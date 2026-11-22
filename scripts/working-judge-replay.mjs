import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { splitBinaryIdentityVersion, splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { readBatch } from '../src/cell-batch-verification.mjs';
import { checkout } from '../src/real-preflight.mjs';
import { evaluationIdentity } from '../src/run.mjs';
import { createWorkingJudge, workingJudge, workingJudgeFingerprint, workingJudgeFingerprintFiles } from '../src/working-judge.mjs';

const runId = 'round2-binary-v3-freeze-gemini-01';
const referenceHead = 'd93b5d43cf38f58e8ec2fef7f16052be7cc67821';
const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
const scenario = 'stage2-working-judge-replay';
const batch = readBatch(join(checkout, 'runs'), runId);
const { manifest, manifestSha256, selected, attempts, latest, head } = batch;
requireThat(head === referenceHead && manifest.mode === 'real' && !latest.interrupted && latest.exitCode === 0
  && manifest.planned.length === selected.size && attempts.length === latest.requestCount, 'missing verified v3 freeze originals');
const historicalFiles = workingJudgeFingerprintFiles.filter(path => path !== 'src/working-judge.mjs');
const { ruler, judgeOutputContract, policy, routes, judgeTransport, sources } = manifest.identity;
const historicalSources = Object.fromEntries(historicalFiles.map(path => [path, sources[path]]));
const historicalFingerprint = manifest.identity.freeze.judgeFingerprint;
requireThat(hash({ ruler, judgeOutputContract, policy, routes, judgeTransport, sources: historicalSources }) === historicalFingerprint,
  'v3 reference fingerprint does not reproduce');

const scratch = resolve(checkout, '.tmp/scratch/stage1-closeout');
mkdirSync(scratch, { recursive: true });
const historical = mkdtempSync(join(scratch, 'historical-'));
const dummyEnv = { OPENROUTER_API_KEY: 'local-replay-fixture', HTTPS_PROXY: 'http://127.0.0.1:9', NODE_TLS_REJECT_UNAUTHORIZED: undefined };
const envBefore = Object.fromEntries(Object.keys(dummyEnv).map(key => [key, process.env[key]]));
const dispatcher = getGlobalDispatcher(), fetchBefore = globalThis.fetch;
const mock = new MockAgent();
mock.disableNetConnect();

function recordedReply({ raw }) {
  const texts = raw.response.content.filter(block => block.type === 'text');
  requireThat(texts.length > 0 && raw.response.stopReason === 'stop', 'unhandled historical response framing');
  const chunks = [
    { id: 'fixture', provider: 'Google AI Studio', model: workingJudge.routes.judge.id, choices: [{ index: 0,
      delta: { role: 'assistant', content: texts.map(block => block.text).join('') }, finish_reason: null }] },
    { id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30, completion_tokens_details: { reasoning_tokens: 0 } } },
  ];
  return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n');
}

const requestContext = ({ systemPrompt, messages }) => JSON.stringify({ systemPrompt, messages: messages.map(({ timestamp: _, ...msg }) => msg) });
const originalsByCell = Object.groupBy(attempts, attempt => attempt.folder);
const checked = [];
try {
  const env = values => { for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } };
  env(dummyEnv);
  setGlobalDispatcher(mock);
  const tar = join(historical, 'code.tar');
  execFileSync('git', ['-c', 'core.autocrlf=false', 'archive', '--format=tar', '-o', tar, referenceHead,
    'config', 'contracts', 'src', 'package.json', 'package-lock.json'], { cwd: checkout });
  execFileSync('tar', ['-xf', tar, '-C', historical]);
  for (const [path, sha] of Object.entries(historicalSources)) {
    const file = join(historical, path);
    const bytes = readFileSync(file);
    if (hash(bytes) === sha) continue;
    const windowsBytes = bytes.toString('utf8').replace(/\r?\n/g, '\r\n');
    requireThat(hash(windowsBytes) === sha, `historical source digest differs: ${path}`);
    writeFileSync(file, windowsBytes);
  }
  requireThat(JSON.stringify(JSON.parse(readFileSync(join(historical, 'package-lock.json'))))
    === JSON.stringify(JSON.parse(readFileSync(join(checkout, 'package-lock.json')))), 'historical SDK lock differs');
  const loadHistorical = file => import(pathToFileURL(join(historical, 'src', file)).href);
  const { Models } = await loadHistorical('models.mjs');
  const { gradeBinaryDimension } = await loadHistorical('binary-judge-v3.mjs');
  function historicalJudge(options) {
    const models = new Models({ ...options, roles: ['judge'], judgePolicy: manifest.identity.judgePolicy, judgeProxySource: manifest.identity.judgeTransport.proxySource });
    return (messages, scope) => gradeBinaryDimension(models, messages, { ...scope, ruler: manifest.identity.ruler });
  }
  for (const planned of manifest.planned) {
    const { id: folder, condition, sourceRunId, repetition } = planned;
    const { messages } = selected.get(folder);
    const originals = originalsByCell[folder];
    async function capture(makeJudge) {
      const captured = [];
      globalThis.fetch = async (input, init) => {
        const original = originals[captured.length];
        requireThat(original, `unexpected call for ${folder}`);
        requireThat(String(input) === endpoint && init.method === 'POST' && init.dispatcher !== undefined && typeof init.body === 'string',
          `unexpected transport at ${original.callId}`);
        captured.push({ body: init.body });
        return recordedReply(original);
      };
      const judge = makeJudge({ mode: 'real', save(raw, meter) {
        const i = captured.length - 1, original = originals[i];
        requireThat(requestContext(raw.context) === requestContext(original.raw.context)
          && JSON.stringify(raw.outbound) === JSON.stringify(original.raw.outbound)
          && raw.proxied === original.raw.proxied && raw.proxySource === original.raw.proxySource,
          `recorded request differs at ${original.callId}`);
        requireThat(raw.call === original.scope.call && raw.attempt === original.scope.attempt
          && meter.failureKind === original.meter.failureKind && meter.retryFeedback === original.meter.retryFeedback,
          `replay attempt differs at ${original.callId}`);
      } });
      for (const dimension of splitDimensions) await judge(messages, { turn: messages.at(-1).turn, runId, cell: condition ?? folder, sourceRunId, repetition, dimension });
      requireThat(captured.length === originals.length, `missing calls at ${folder}`);
      return captured;
    }
    const prior = await capture(historicalJudge);
    const current = await capture(createWorkingJudge);
    for (const [i, { body }] of current.entries()) {
      const { callId, processIndex, meter } = originals[i];
      requireThat(body === prior[i].body, `HTTP body differs at ${runId}/${callId}`);
      checked.push({ callId, processIndex, attemptPath: meter.attemptPath, bodySha256: hash(body) });
    }
  }
} finally {
  globalThis.fetch = fetchBefore;
  setGlobalDispatcher(dispatcher);
  await mock.close();
  for (const [key, value] of Object.entries(envBefore)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(historical, { recursive: true, force: true });
}

const base = evaluationIdentity({ mode: 'real', limits: manifest.limits, provenance: { runId, manifestSha256 },
  sources: workingJudgeFingerprintFiles });
const judgeFingerprint = workingJudgeFingerprint(base.sources);
const identity = { ...base, ...workingJudge, version: splitBinaryIdentityVersion, judgeFingerprint };
const summary = { scenario, referenceRunId: runId, referenceHead, historicalFingerprint, requestsCompared: checked.length,
  networkRequests: 0, identityId: hash({ mode: 'real', scenario, identity }), judgeFingerprint,
  changedFingerprintFiles: workingJudgeFingerprintFiles.filter(file => base.sources[file] !== manifest.identity.sources[file]) };
writeFileSync(join(scratch, 'working-judge-replay.json'), JSON.stringify({ ...summary, identity, checked }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
