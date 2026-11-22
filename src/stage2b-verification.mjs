import { isDeepStrictEqual as same } from 'node:util';
import { policy, rounds, routes } from '../config/e1.mjs';
import { hash, message, requireThat } from '../contracts/core/schema.mjs';
import { bindBinary } from '../contracts/judge/binary.mjs';
import { assembleBinaryVerdict, splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { parseLearner } from '../contracts/learner/schema.mjs';
import { publicReply } from '../contracts/teacher/schema.mjs';
import { replaySplitJudge, splitBinding } from './split-judge-replay.mjs';
import { stage2bLedger } from './stage2b-ledger.mjs';
import { stage2bAddendumSha, stage2bBudget, stage2bCallId, stage2bCallPath, stage2bConcurrency, stage2bEstimateId,
  stage2bLimits, stage2bManifestSha, stage2bMethodSha, stage2bPlan, stage2bRegistration, stage2bRunId, stage2bScenario as scenario, stage2bStop } from './stage2b-plan.mjs';
import { workingJudge, workingJudgeFingerprint } from './working-judge.mjs';

const responseText = raw => raw.response.content.filter(block => block.type === 'text').map(block => block.text).join('');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function verifyStage2bArtifacts({ id, start, receipt, evaluation, requests, checkArtifact }) {
  const { mode, pid, startedAt } = start;
  const launch = start.parameters.values, flags = start.parameters.flags, files = evaluation.files;
  const checked = new Set();
  const read = (path) => {
    const bytes = checkArtifact(path, files[path]);
    requireThat(bytes, `unverified stage 2b artifact: ${path}`);
    checked.add(path);
    return bytes;
  };
  const readJson = path => JSON.parse(read(path));
  const sameWriter = row => same(row.writer, { pid, startedAt });
  const sameLaunch = row => row.id === id && row.mode === mode && row.scenario === scenario;
  const checkClean = check => start.clean && check?.head === start.head && check.status === 'passed' && check.command === 'npm run check' && check.passed > 0;
  requireThat(sameLaunch(evaluation) && launch.scenario === scenario && launch.concurrency === String(stage2bConcurrency), 'stage 2b launch or evaluation differs');
  if (mode === 'real') requireThat(start.clean && flags.includes('--proxy-from-env') && launch.preregistration_sha256 === stage2bMethodSha
    && launch.path_addendum_sha256 === stage2bAddendumSha && Number(launch.max_attempts) === stage2bLimits.maxAttempts
    && Number(launch.max_requested_output_tokens) === stage2bLimits.maxRequestedOutputTokens, 'stage 2b launch differs from registered real parameters');
  if (flags.includes('--estimate-only')) {
    const estimate = readJson('estimate.json');
    requireThat(mode === 'real' && id === stage2bEstimateId && !flags.includes('--confirm-cost') && requests.length === 0 && receipt.exitCode === 0
      && receipt.acceptance === null && estimate.acceptance === null && estimate.requestCount === 0 && sameLaunch(estimate) && sameWriter(estimate)
      && checkClean(estimate.checkReceipt) && estimate.identityId === evaluation.identityId && sha(estimate.identityId) && sha(estimate.judgeFingerprint)
      && estimate.dataset.split === 'dev' && estimate.dataset.manifestSha256 === stage2bManifestSha && stage2bPlan(estimate.dataset.dev).length === estimate.plannedCells
      && estimate.preregistrationSha256 === stage2bMethodSha && estimate.pathAddendumSha256 === stage2bAddendumSha
      && estimate.concurrency === stage2bConcurrency && same(estimate.stop, stage2bStop) && Object.entries({ ...stage2bBudget(), ...stage2bLimits }).every(([k, v]) => estimate[k] === v)
      && Object.keys(files).length === 1, 'stage 2b preflight evidence disagrees');
    return { pid, identityId: estimate.identityId, judgeFingerprint: estimate.judgeFingerprint, estimate: true };
  }

  const manifest = readJson('manifest.json'), result = readJson('result.json');
  const { identity, identityId, planned, limits } = manifest;
  const method = read('preregistration.md'), addendum = read('preregistration-addendum-path.md');
  requireThat([manifest, result].every(sameLaunch) && sameWriter(manifest) && identityId === evaluation.identityId && identityId === result.identityId
    && identityId === hash({ mode, scenario, identity }) && identity.version === 'stage2b-headroom-v1' && identity.teacher === 'normal'
    && identity.ruler === workingJudge.ruler && identity.judgePolicy === workingJudge.judgePolicy && identity.judgeOutputContract === workingJudge.judgeOutputContract
    && identity.judgeFingerprint === workingJudgeFingerprint(identity.sources) && same(identity.judgeCallPolicy, workingJudge.policy)
    && same(identity.judgeTransport, mode === 'real' ? workingJudge.judgeTransport : null)
    && same(identity.routes, mode === 'real' ? { ...routes, judge: workingJudge.routes.judge } : 'pi-ai-faux')
    && identity.rounds === rounds && identity.concurrency === stage2bConcurrency && same(identity.stop, stage2bStop)
    && same(identity.limits, limits) && same(limits, stage2bLimits) && same(manifest.budget, stage2bBudget())
    && identity.dataset.split === 'dev' && ['primary', 'backup'].includes(identity.dataset.source)
    && same(planned, identity.planned) && same(planned, stage2bPlan(identity.dataset.dev))
    && hash(method) === identity.preregistrationSha256 && hash(addendum) === identity.pathAddendumSha256, 'stage 2b identity or plan disagrees');
  if (mode === 'real') {
    const registration = stage2bRegistration(method, addendum);
    requireThat(id === stage2bRunId && flags.includes('--confirm-cost') && !flags.includes('--resume') && checkClean(manifest.checkReceipt)
      && same(manifest.estimateReceipt, { id: stage2bEstimateId, head: start.head, identityId, requestCount: 0 })
      && registration.manifestSha256 === identity.dataset.manifestSha256 && same(registration.dev, identity.dataset.dev), 'stage 2b real registration disagrees');
  }

  const manifestForJudge = { ...manifest, identity: { ...identity, policy: identity.judgeCallPolicy },
    planned: planned.map(({ folder, repetition }) => ({ id: folder, repetition, sourceRunId: id })) };
  const planByFolder = new Map(planned.map(row => [row.folder, row]));
  const ledger = stage2bLedger(limits, stage2bConcurrency);
  const log = read('admission.jsonl').toString('utf8');
  requireThat(log.endsWith('\n'), 'stage 2b admission log is truncated');
  for (const line of log.slice(0, -1).split('\n')) {
    const event = JSON.parse(line);
    const folder = event.coordinates?.folder ?? event.folder ?? ledger.attempts.get(event.callId)?.coordinates.folder;
    requireThat(planByFolder.has(folder), `unregistered stage 2b ledger folder: ${folder}`);
    ledger.apply(event);
  }
  const { inFlight, concurrency: _concurrency, ...tallies } = ledger.snapshot();
  const actualSends = requests.filter(event => event.type === 'request_start');
  requireThat(inFlight === 0 && same(ledger.sent, actualSends.map(event => event.callId))
    && actualSends.every(event => event.requestId === `${event.callId}:1`)
    && (mode === 'real' || actualSends.length === 0), 'stage 2b admission and transport request counts differ');
  requireThat(Object.entries(tallies).every(([key, value]) => same(result[key], value)), 'stage 2b result differs from admission log');
  const completed = new Map();
  const usage = Object.fromEntries(['teacher', 'learner', 'judge'].map(role => [role, { requests: 0, missing: 0, input: 0, output: 0, total: 0, reasoning: 0, reasoningMissing: 0 }]));
  const verifiedCalls = new Set();
  const attemptByFolder = Map.groupBy(ledger.attempts, ([, { coordinates }]) => coordinates.folder);
  requireThat(result.cells.length === planned.length, 'stage 2b result lacks planned cells');
  for (const [i, row] of result.cells.entries()) {
    const { status, failure, ...coordinate } = row;
    const { folder, taskId, student } = coordinate;
    requireThat(same(coordinate, planned[i]) && (ledger.completions.get(folder) ?? 'not_started') === status, `stage 2b result coordinate differs: ${folder}`);
    const attempts = attemptByFolder.get(folder) ?? [];
    if (status === 'not_started') {
      requireThat(attempts.length === 0 && !failure && result.stop, `unexplained missing cell: ${folder}`);
      continue;
    }
    completed.set(folder, status);
    const transcript = readJson(`${folder}/transcript.json`), telemetry = readJson(`${folder}/telemetry.json`);
    requireThat(Array.isArray(readJson(`${folder}/teacher-events.json`)) && telemetry.length === attempts.length
      && Array.isArray(transcript) && transcript.length <= 2 * rounds + 1 && (status !== 'scored' || transcript.length === 2 * rounds + 1),
    `invalid stage 2b cell artifacts: ${folder}`);
    const observed = new Map(), parts = {}, dimensions = {};
    for (const [j, [callId, attempt]] of attempts.entries()) {
      const { coordinates, limit, sent, settled, failureKind, rateLimited } = attempt;
      const { role, turn, call } = coordinates, attemptPath = stage2bCallPath(coordinates);
      const meter = telemetry[j], raw = readJson(attemptPath);
      requireThat(settled && callId === stage2bCallId(coordinates) && Number.isSafeInteger(meter.requestLimit)
        && meter.requestLimit > 0 && meter.requestLimit <= limit && meter.failureKind === failureKind
        && [raw, meter].every(record => record.callId === callId && record.pid === pid && record.processIndex === 1 && record.attemptPath === attemptPath
          && record.sent === sent && record.rateLimited === rateLimited && ['role', 'turn', 'call', 'attempt'].every(key => record[key] === coordinates[key])),
      `attempt/PID binding differs: ${callId}`);
      requireThat(mode !== 'real' || sent || failureKind, `successful call was not sent: ${callId}`);
      verifiedCalls.add(callId);
      if (sent) {
        const counter = usage[role];
        counter.requests++;
        if (meter.usage?.totalTokens == null) counter.missing++;
        else {
          counter.input += meter.usage.input;
          counter.output += meter.usage.output;
          counter.total += meter.usage.totalTokens;
        }
        if (meter.reasoningTokens == null) counter.reasoningMissing++;
        else counter.reasoning += meter.reasoningTokens;
      }
      if (role === 'judge') {
        const part = replaySplitJudge(manifestForJudge, folder, transcript, meter, raw);
        if (part) {
          const dimension = splitDimensions[call - 1];
          requireThat(!parts[dimension], `duplicate accepted dimension: ${callId}`);
          parts[dimension] = part.verdict;
          dimensions[dimension] = part.binding;
        }
      } else if (!failureKind) {
        if (role === 'learner') {
          const window = transcript.slice(0, 2 * turn).map(({ role, text }) => ({ role, text }));
          requireThat(same(JSON.parse(raw.context.messages.at(-1).content), window), `student window mismatch: ${callId}`);
          const jsonMode = student !== 'default', metadata = jsonMode ? { allowBoundedCleanup: true } : undefined;
          if (mode === 'real' && jsonMode) requireThat(raw.outbound?.thinking?.type === 'disabled'
            && raw.outbound?.response_format?.type === 'json_object' && raw.outbound?.reasoning_effort === undefined, `high-pressure student outbound mismatch: ${callId}`);
          const text = parseLearner(responseText(raw), raw.response, undefined, metadata).text;
          requireThat(!jsonMode || same(raw.formatCleanups, metadata.formatCleanups), `student JSON cleanup differs: ${callId}`);
          observed.set(2 * turn, text);
        } else if (raw.response.stopReason === 'stop') observed.set(2 * turn - 1, publicReply(responseText(raw)));
      }
    }
    for (const [j, m] of transcript.entries()) {
      const expected = message(`${id}:${folder.replaceAll('/', ':')}:m:${j + 1}`, j % 2 ? 'teacher' : 'learner', Math.ceil(j / 2), m.text);
      requireThat(same(m, expected) && (j === 0 ? hash(m.text) === identity.dataset.openings[taskId] : m.text === observed.get(j)),
        `transcript replay differs: ${folder} #${j + 1}`);
    }
    if (status === 'scored') {
      const { verdict } = assembleBinaryVerdict(parts, identity.ruler);
      const binding = splitBinding(manifestForJudge, folder, bindBinary(transcript));
      requireThat(!failure && verdict && same(readJson(`${folder}/judge.json`), { binding: { ...binding, dimensions }, verdict }), `verdict differs: ${folder}`);
    } else requireThat(failure?.kind && !Object.hasOwn(files, `${folder}/judge.json`), `failed cell must not have a score: ${folder}`);
  }
  requireThat(checked.size === Object.keys(files).length && verifiedCalls.size === ledger.attempts.size && completed.size === ledger.completions.size,
    'unbound stage 2b artifacts, attempts, or cells');
  const complete = result.cells.every(cell => cell.status === 'scored');
  requireThat(result.acceptance === complete && receipt.acceptance === complete && receipt.exitCode === (complete ? 0 : 1), 'stage 2b completeness, acceptance or exit differs');
  return { pid, identityId, judgeFingerprint: identity.judgeFingerprint, planned: planned.length,
    scored: result.cells.filter(cell => cell.status === 'scored').length, ...tallies, usage };
}
