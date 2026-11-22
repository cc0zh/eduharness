import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { rounds, routes } from '../config/e1.mjs';
import { conflictingReasoningKeys, reasoningOffPolicy } from '../config/judge-reasoning-off.mjs';
import { filenames, modes, runId } from '../contracts/artifacts/schema.mjs';
import { failure, hash } from '../contracts/core/schema.mjs';
import { binaryRuler, bindBinary, parseBinaryJudgement } from '../contracts/judge/binary.mjs';
import { gradeBinary } from '../src/binary-judge.mjs';
import { Models, attemptBudget } from '../src/models.mjs';
import { binaryOfflineResponses } from '../src/offline.mjs';
import { checkout, loadCredentials, requireCheckReceipt } from '../src/real-preflight.mjs';
import { installRunReceiptHandlers, startRunReceipt, verifyRun } from '../src/run-receipts.mjs';
import { write } from '../src/run.mjs';
import { concurrency, contrastIdentity, defaultRegistration, defaultRoot, limits, prepareContrast, readLocked, registeredId, retriesPerKind, scenario } from './reasoning-off-plan.mjs';
import { analyzeReasoningOff, renderReasoningOffReport } from './reasoning-off-report.mjs';

const registrationName = 'preregistration.md';
const attemptPath = (id, n) => `${id}/${filenames.raw}/judge-${rounds}-1-${n}.json`;
const callId = (id, n) => `${id}:judge:${rounds}:1:${n}`;
const coord = ({ role, turn, call, attempt, attemptPath }) => ({ role, turn, call, attempt, attemptPath });
const emit = value => console.log(JSON.stringify(value));

async function execute({ id, root, mode, prepared, digest, recorder, checkReceipt }) {
  const { plan, queue, inputs } = prepared;
  const { pid, startedAt } = recorder.start;
  const writer = { pid, startedAt }, dir = join(root, id);
  const { identity, identityId } = contrastIdentity(mode, plan, digest);
  mkdirSync(dir);
  writeFileSync(join(dir, registrationName), prepared.markdown);
  write(join(dir, filenames.manifest), { id, scenario, mode, writer, checkReceipt, identity, identityId, planned: queue, limits });
  const result = { id, scenario, mode, acceptance: false, cells: [] };
  const saveResult = () => write(join(dir, filenames.result), result);
  saveResult();
  const artifacts = [], retries = new Map(), budget = attemptBudget(limits);
  const digestAt = path => hash(readFileSync(join(dir, path)));
  console.error(`pid=${pid} run=${id} cells=${queue.length} serial`);
  for (const row of queue) {
    const cell = row.id, folder = join(dir, cell), { bytes, messages } = inputs.get(cell);
    const telemetryPath = `${cell}/${filenames.telemetry}`, meter = [], attempts = [];
    mkdirSync(join(folder, filenames.raw), { recursive: true });
    writeFileSync(join(folder, filenames.transcript), bytes);
    write(join(dir, telemetryPath), meter);
    const reserve = (where, limit) => {
      if (where.attempt === 1) return budget(where, limit);
      const last = meter.at(-1), kind = last.failureKind, used = retries.get(kind) ?? 0;
      if (kind === 'configuration') throw failure(kind, coord(last), last.detail);
      if (used >= retriesPerKind) throw failure(kind, coord(last), 'run-wide retry limit for this failure kind');
      budget(where, limit);
      retries.set(kind, used + 1);
    };
    const models = new Models({ mode, roles: ['judge'], judgeReasoningOff: true, reserve, recorder, cell,
      responses: mode === 'offline' ? binaryOfflineResponses(row.condition ?? 'no_teach') : undefined,
      save(raw, telemetry) {
        const path = attemptPath(cell, raw.attempt);
        write(join(dir, path), raw);
        meter.push({ ...telemetry, attemptPath: path, pid });
        write(join(dir, telemetryPath), meter);
        attempts.push({ path, sha256: digestAt(path) });
        return path;
      },
    });
    const artifact = { id: cell, transcriptSha256: row.transcriptSha256, attempts };
    try {
      const judgement = await gradeBinary(models, messages, { turn: rounds, runId: id, cell, sourceRunId: row.sourceRunId });
      const path = `${cell}/${filenames.judge}`;
      write(join(dir, path), judgement);
      artifact.judgeSha256 = digestAt(path);
      result.cells.push({ id: cell, scoring: judgement.verdict.scoring });
    } catch (error) {
      result.cells.push({ id: cell, failure: error.failure ?? failure('artifact_io', { role: 'judge', turn: rounds, call: 1 }, error.message).failure });
    }
    artifacts.push({ ...artifact, telemetrySha256: digestAt(telemetryPath) });
    saveResult();
    const problem = result.cells.at(-1).failure;
    console.error(`${result.cells.length}/${queue.length} ${cell}: ${problem ? `${problem.kind} ${problem.detail ?? ''}` : 'scored'}; ${meter.length} attempt(s)`);
    if (problem) break;
  }
  const scored = result.cells.filter(row => row.scoring).length;
  result.acceptance = scored === queue.length;
  saveResult();
  recorder.publishEvaluation({ id, mode, scenario, acceptance: result.acceptance, identityId, preregistrationSha256: digest,
    manifestSha256: digestAt(filenames.manifest), resultSha256: digestAt(filenames.result), cells: artifacts });
  return { id, pid, identityId, planned: queue.length, scored, acceptance: result.acceptance };
}

function verify({ root, id }) {
  const receiptCheck = verifyRun(root, id);
  assert(receiptCheck.verified, JSON.stringify(receiptCheck));
  const dir = join(root, id), input = path => JSON.parse(readFileSync(path));
  const ledger = suffix => join(root, '_receipts', `${id}${suffix}`);
  const start = input(ledger('.start.json')), receipt = input(ledger('.process.json'));
  const read = (path, digest) => readLocked(join(dir, path), digest);
  const json = (path, digest) => JSON.parse(read(path, digest));
  const evaluation = JSON.parse(readLocked(ledger('.json'), receipt.evaluationSha256));
  const manifest = json(filenames.manifest, evaluation.manifestSha256), result = json(filenames.result, evaluation.resultSha256);
  const digest = evaluation.preregistrationSha256, prepared = prepareContrast(), { mode } = start;
  assert.equal(read(registrationName, digest).toString('utf8'), prepared.markdown);
  assert.equal(start.parameters.values.preregistration_sha256, digest);
  const { identity, identityId } = contrastIdentity(mode, prepared.plan, digest);
  const { queue, prompt } = prepared;
  assert([manifest, result, evaluation].every(row => row.id === id && row.mode === mode && row.scenario === scenario));
  assert.equal(evaluation.identityId, identityId);
  assert.equal(manifest.identityId, identityId);
  assert.deepEqual(manifest.identity, identity);
  assert.deepEqual(manifest.planned, queue);
  assert.deepEqual(manifest.limits, limits);
  assert.deepEqual(manifest.writer, { pid: start.pid, startedAt: start.startedAt });
  assert.equal(start.parameters.values.max_attempts, String(limits.maxAttempts));
  assert.equal(start.parameters.values.max_requested_output_tokens, String(limits.maxRequestedOutputTokens));
  if (mode === 'real') assert(id === registeredId && start.clean && manifest.checkReceipt?.head === start.head && manifest.checkReceipt.status === 'passed');
  assert(result.cells.length <= queue.length && result.cells.length === evaluation.cells.length);

  const outcomes = [], sent = [], retries = new Map();
  let reservedAttempts = 0;
  for (const [i, cell] of result.cells.entries()) {
    const planned = queue[i], folder = planned.id, artifact = evaluation.cells[i];
    assert(cell.id === folder && artifact.id === folder && artifact.transcriptSha256 === planned.transcriptSha256, `cell order or source hash: ${folder}`);
    const view = bindBinary(json(`${folder}/${filenames.transcript}`, planned.transcriptSha256));
    const telemetry = json(`${folder}/${filenames.telemetry}`, artifact.telemetrySha256);
    const binding = { runId: id, cell: folder, ruler: binaryRuler, viewHash: view.id, messageIds: view.messages.map(m => m.id), sourceRunId: planned.sourceRunId };
    const expectedMessages = view.messages.map(({ role, text }, i) => ({ n: i + 1, role, text }));
    assert(telemetry.length === artifact.attempts.length && telemetry.length <= reasoningOffPolicy.retries + 1, `attempt count: ${folder}`);
    let verdict;
    const attempts = telemetry.map((row, j) => {
      const n = j + 1, path = attemptPath(folder, n), key = callId(folder, n);
      const entry = artifact.attempts[j], coordinates = { role: 'judge', turn: rounds, call: 1, attempt: n, attemptPath: path };
      assert(entry.path === path && row.pid === start.pid && row.policyVersion === reasoningOffPolicy.version && row.timeoutMs === prepared.plan.timeoutMs, `attempt path, PID, or policy mismatch: ${path}`);
      assert.deepEqual(coord(row), coordinates);
      const raw = json(path, entry.sha256);
      const { attemptPath: _, ...rawCoordinates } = coordinates;
      assert(Object.entries(rawCoordinates).every(([key, value]) => raw[key] === value), `raw coordinates mismatch: ${path}`);
      assert.deepEqual(row.binding, binding);
      assert.deepEqual(raw.binding, binding);
      const last = telemetry[j - 1];
      if (last) {
        assert(last.failureKind && last.failureKind !== 'configuration', `retry without a retryable failure: ${path}`);
        retries.set(last.failureKind, (retries.get(last.failureKind) ?? 0) + 1);
      }
      const expectedPrompt = last?.failureKind === 'judge_partial_failure'
        ? `${prompt}\nPrevious response rejected: ${last.detail}. Correct that problem and submit a complete replacement judgement for the same evidence view.` : prompt;
      assert.equal(hash(raw.context.systemPrompt), hash(expectedPrompt), `prompt mismatch: ${path}`);
      assert(raw.context.messages.length === 1 && raw.context.messages[0].role === 'user', `request shape: ${path}`);
      assert.equal(hash(JSON.parse(raw.context.messages[0].content)), hash({ messages: expectedMessages }), `request text mismatch: ${path}`);
      assert(Number.isInteger(row.requestLimit) && row.requestLimit > 0 && row.requestLimit <= reasoningOffPolicy.judge.maxTokens);
      reservedAttempts++;
      const issued = Boolean(raw.outbound);
      if (mode === 'real') {
        const p = row.phaseMs;
        assert(p && Number.isSafeInteger(p.ended) && p.ended <= row.elapsedMs && issued === Number.isSafeInteger(p.requestSent), `request timing mismatch: ${path}`);
        for (const k of ['headersReceived', 'firstByte', 'firstReasoning', 'lastReasoning', 'firstVisible']) {
          assert(p[k] === null || Number.isSafeInteger(p[k]) && p[k] >= p.requestSent && p[k] <= p.ended && issued, `invalid ${k}: ${path}`);
        }
        assert(row.reasoningTokens === null || Number.isSafeInteger(row.reasoningTokens) && row.reasoningTokens >= 0, `invalid reasoning count: ${path}`);
        assert(row.reportedOutputTokens === null || row.reportedOutputTokens === row.usage?.output, `output count mismatch: ${path}`);
      }
      if (issued) {
        const o = raw.outbound;
        assert(mode === 'real' && o.model === routes.judge.id && row.model === routes.judge.id && row.provider === routes.judge.provider);
        assert.deepEqual(o.reasoning, reasoningOffPolicy.judge.reasoning);
        assert(Array.isArray(o.parameterNames) && o.parameterNames.includes('reasoning')
          && !conflictingReasoningKeys.some(key => o.parameterNames.includes(key)), `conflicting reasoning parameters: ${path}`);
        assert((o.max_tokens ?? o.max_completion_tokens) === row.requestLimit && row.reasoningLimit === null
          && o.provider.require_parameters && o.response_format.type === 'json_schema' && o.response_format.json_schema.strict, `outbound mismatch: ${path}`);
        sent.push(key);
      }
      if (!row.failureKind) {
        assert(n === telemetry.length && (mode === 'offline' || issued) && raw.response.stopReason === 'stop'
          && !raw.response.content.some(b => b.type === 'toolCall'), `invalid successful attempt: ${path}`);
        const text = raw.response.content.filter(b => b.type === 'text').map(b => b.text).join('');
        verdict = parseBinaryJudgement(text, view);
        assert.deepEqual(json(`${folder}/${filenames.judge}`, artifact.judgeSha256), { binding: { ...binding, ...coordinates }, verdict });
        assert.deepEqual(cell, { id: folder, scoring: verdict.scoring });
      }
      return { ...row, sent: issued, callId: key };
    });
    if (!verdict) assert(!artifact.judgeSha256 && cell.failure && i === result.cells.length - 1, `unexpected failed cell: ${folder}`);
    outcomes.push({ id: folder, verdict, failure: cell.failure, attempts });
  }
  const events = readFileSync(ledger('.requests.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.deepEqual(events.map(({ type, callId }) => [type, callId]), sent.flatMap(callId => [['request_start', callId], ['request_end', callId]]), 'requests do not match the single-process serial attempts');
  assert.equal(sent.length, receipt.requestCount);
  const reservedOutputTokens = reservedAttempts * reasoningOffPolicy.judge.maxTokens;
  assert(reservedAttempts <= limits.maxAttempts && reservedOutputTokens <= limits.maxRequestedOutputTokens);
  assert([...retries.values()].every(count => count <= retriesPerKind));
  const scored = outcomes.filter(row => row.verdict).length;
  const acceptance = scored === queue.length;
  assert(acceptance === result.acceptance && acceptance === receipt.acceptance);
  return { prepared, outcomes, verification: { ...receiptCheck, fullArtifactReplay: true, pid: start.pid, identityId,
    preregistrationSha256: digest, scored, planned: queue.length, attempts: reservedAttempts, reservedOutputTokens, ...limits } };
}

async function main() {
  const argv = process.argv.slice(2);
  const { values: args } = parseArgs({ args: argv, options: {
    register: { type: 'boolean' }, report: { type: 'boolean' }, 'verify-run': { type: 'string' },
    id: { type: 'string' }, mode: { type: 'string', default: 'offline' }, 'run-root': { type: 'string', default: defaultRoot },
    preregistration: { type: 'string', default: defaultRegistration }, 'preregistration-sha256': { type: 'string' }, 'estimate-only': { type: 'boolean' }, 'confirm-cost': { type: 'boolean' },
    'max-attempts': { type: 'string' }, 'max-requested-output-tokens': { type: 'string' },
  } });
  const root = resolve(args['run-root']), mode = args.mode;
  if (args['verify-run']) {
    const id = runId(args['verify-run']);
    const { prepared, outcomes, verification } = verify({ root, id });
    if (args.report) {
      const { queue, expected, history } = prepared;
      const analysis = analyzeReasoningOff({ mode: verification.mode, queue, outcomes, expected, history, limits });
      const dir = join(root, id);
      write(join(dir, 'verify-run.json'), verification);
      write(join(dir, 'reasoning-off-summary.json'), analysis);
      writeFileSync(join(dir, 'reasoning-off-report.md'), renderReasoningOffReport(analysis, { ...verification, id }));
    }
    return emit(verification);
  }
  assert(!args.report, '--report requires --verify-run');
  const prepared = prepareContrast(), path = resolve(args.preregistration);
  if (args.register) {
    assert(!args.id && !args['estimate-only'] && !args['confirm-cost']);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, prepared.markdown, { flag: 'wx' });
    return emit({ id: registeredId, path, preregistrationSha256: hash(readFileSync(path)), typicalCalls: prepared.queue.length, concurrency, ...limits });
  }
  assert(modes.includes(mode));
  const id = runId(args.id), digest = args['preregistration-sha256'];
  assert.equal(readLocked(path, digest).toString('utf8'), prepared.markdown, 'registration or inputs changed');
  const estimating = Boolean(args['estimate-only']);
  if (estimating || mode === 'offline') assert(id.toLowerCase() !== registeredId && !args['confirm-cost'], 'estimate and offline run IDs must differ from the registered real run ID');
  else assert(id === registeredId && root === defaultRoot && args['confirm-cost'], 'real execution requires the registered ID, run root, and authorized hard limits');
  const recorder = startRunReceipt({ root, id, mode, argv });
  let acceptance = null;
  installRunReceiptHandlers(recorder, () => acceptance);
  const { identityId } = contrastIdentity(mode, prepared.plan, digest);
  if (estimating) return emit({ id, registeredId, mode, identityId, policyVersion: reasoningOffPolicy.version, preregistrationSha256: digest,
    typicalCalls: prepared.queue.length, concurrency, ...limits, timeoutMs: prepared.plan.timeoutMs, retriesPerKind });
  assert.equal(args['max-attempts'], String(limits.maxAttempts));
  assert.equal(args['max-requested-output-tokens'], String(limits.maxRequestedOutputTokens));
  let checkReceipt;
  if (mode === 'real') {
    checkReceipt = requireCheckReceipt(checkout, [recorder.startPath, recorder.requestPath]);
    assert(recorder.start.clean && recorder.start.head === checkReceipt.head);
    loadCredentials(['judge']);
    assert.equal(new URL(new Models({ mode, roles: ['judge'], judgeReasoningOff: true }).model('judge').baseUrl).origin, 'https://openrouter.ai');
  }
  const result = await execute({ id, root, mode, prepared, digest, recorder, checkReceipt });
  acceptance = result.acceptance;
  emit(result);
  if (!acceptance) process.exitCode = 1;
}

try { await main(); }
catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
