import { appendFileSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual as same, parseArgs } from 'node:util';
import { policy, rounds, routes } from '../config/e1.mjs';
import { learnerFixArms } from '../config/hard-learners.mjs';
import { runId } from '../contracts/artifacts/schema.mjs';
import { failure, hash, message, requireThat } from '../contracts/core/schema.mjs';
import { assembleBinaryVerdict, splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { hardProfileIdentity } from '../contracts/learner/profiles.mjs';
import { learnerPrompt, learnerReply } from './learner.mjs';
import { Models } from './models.mjs';
import { offlineResponses, splitBinaryOfflineResponses } from './offline.mjs';
import { resolveOpenRouterProxySource } from './openrouter-proxy.mjs';
import { checkout, loadCredentials, requireCheckReceipt } from './real-preflight.mjs';
import { atomicBytes, atomicJson } from './receipt-files.mjs';
import { evaluationIdentity, source } from './run.mjs';
import { installRunReceiptHandlers, startRunReceipt, verifyRun } from './run-receipts.mjs';
import { splitBinding } from './split-judge-replay.mjs';
import { bindBinary } from '../contracts/judge/binary.mjs';
import { createTeacher } from './teacher/session.mjs';
import { createWorkingJudge, workingJudge, workingJudgeFingerprint, workingJudgeFingerprintFiles } from './working-judge.mjs';
import { stage2bLedger } from './stage2b-ledger.mjs';
import { loadStage2bDev, stage2bBudget, stage2bCallId, stage2bCallPath, stage2bConcurrency, stage2bEstimateId, stage2bLimits,
  stage2bPlan, stage2bRegistration, stage2bRunId, stage2bScenario as scenario, stage2bStop } from './stage2b-plan.mjs';

const sourceFiles = [...workingJudgeFingerprintFiles, 'config/hard-learners.mjs', 'config/stage2b-headroom.mjs', 'src/stage2b-plan.mjs', 'src/stage2b-run.mjs',
  'src/stage2b-ledger.mjs', 'src/stage2b-verification.mjs'];
const operatorPolicyFile = 'data/upstream/policy_situated_tutoring.md';
const hardLearner = learnerFixArms.a;
const ids = ['stubborn', 'answer-seeker'];

export function prepareStage2b({ mode, corpus, method, addendum }) {
  const { source: datasetSource, manifestSha256, dev, tasks } = corpus;
  const planned = stage2bPlan(dev);
  const operatorPolicy = source(operatorPolicyFile);
  const dataset = { split: 'dev', source: datasetSource, manifestSha256, dev, operatorPolicySha256: hash(operatorPolicy),
    openings: Object.fromEntries(dev.map(({ id }) => [id, hash(tasks.get(id).user_scenario.instructions.task_instructions)])) };
  const budget = stage2bBudget();
  requireThat(budget.maxCalls === stage2bLimits.maxAttempts && budget.maxOutputTokens === stage2bLimits.maxRequestedOutputTokens,
    'current config no longer matches the registered budget');
  const base = evaluationIdentity({ mode, limits: stage2bLimits, dataset, sources: sourceFiles });
  const identity = { ...base, version: 'stage2b-headroom-v1', ruler: workingJudge.ruler, judgeOutputContract: workingJudge.judgeOutputContract,
    judgePolicy: workingJudge.judgePolicy, judgeFingerprint: workingJudgeFingerprint(base.sources), judgeTransport: mode === 'real' ? workingJudge.judgeTransport : null,
    rounds, teacher: 'normal', concurrency: stage2bConcurrency, planned, judgeCallPolicy: workingJudge.policy,
    routes: mode === 'real' ? { ...routes, judge: workingJudge.routes.judge } : 'pi-ai-faux',
    students: { default: { jsonMode: false, thinking: policy.learner.thinking }, ...Object.fromEntries(ids.map(id => [id, {
      jsonMode: true, thinking: hardLearner.thinking, antiSelfFalsification: hardLearner.antiSelfFalsification,
      profileSha256: hardProfileIdentity(id, hardLearner.antiSelfFalsification),
    }])) },
    stop: stage2bStop, preregistrationSha256: hash(method), pathAddendumSha256: hash(addendum),
  };
  return { identity, identityId: hash({ mode, scenario, identity }), planned, tasks, operatorPolicy: operatorPolicy.toString('utf8'), method, addendum, budget };
}

export async function runStage2b({ id, mode, root, concurrency, recorder, checkReceipt, estimateReceipt }, prepared) {
  const { identity, identityId, planned, tasks, operatorPolicy, method, addendum, budget } = prepared;
  requireThat(concurrency === stage2bConcurrency && recorder.start.pid === process.pid && recorder.start.runId === id && recorder.start.mode === mode,
    'unexpected stage 2b launch');
  requireThat(mode !== 'real' || recorder.start.clean && checkReceipt?.head === recorder.start.head && estimateReceipt?.head === checkReceipt.head
    && estimateReceipt.identityId === identityId, 'checkout or estimate changed before stage 2b launch');
  const dir = join(root, id), files = {};
  mkdirSync(dir);
  const put = (path, value) => { files[path] = atomicJson(join(dir, path), value); };
  for (const [path, bytes] of [['preregistration.md', method], ['preregistration-addendum-path.md', addendum]]) files[path] = atomicBytes(join(dir, path), bytes);
  const { pid, startedAt } = recorder.start;
  const manifest = { id, scenario, mode, identity, identityId, planned, budget, limits: stage2bLimits, writer: { pid, startedAt }, checkReceipt, estimateReceipt };
  put('manifest.json', manifest);
  const events = [];
  const log = join(dir, 'admission.jsonl');
  const ledger = stage2bLedger(stage2bLimits, concurrency, event => {
    const line = `${JSON.stringify(event)}\n`;
    appendFileSync(log, line, { flush: true });
    events.push(line);
  });
  const requestRecorder = { append(event) {
    if (event.type === 'request_start') ledger.send(event.callId);
    recorder.append(event);
  } };
  const waiters = new Set(), running = new Set(), completed = new Map();
  let fatal;
  const wake = () => { for (const resolve of waiters) resolve(); waiters.clear(); };
  const pause = (folder, scope) => failure('batch_stopped', { ...scope, callId: stage2bCallId({ folder, ...scope }) }, 'stage 2b batch stopped');

  async function execute(row) {
    const { folder, taskId, student, repetition } = row;
    const cell = folder.replaceAll('/', ':');
    const task = tasks.get(taskId), messages = [], telemetry = [], teacherEvents = [];
    const say = (role, turn, text) => messages.push(message(`${id}:${cell}:m:${messages.length + 1}`, role, turn, text));
    const controls = { mode, recorder: requestRecorder, cell,
      async beforeAttempt(scope, limit) {
        if (telemetry.at(-1)?.rateLimited && !ledger.snapshot().stop) await new Promise(resolve => setTimeout(resolve, 100));
        while (!fatal && !ledger.snapshot().stop && ledger.snapshot().inFlight >= ledger.snapshot().concurrency) {
          await new Promise(resolve => waiters.add(resolve));
        }
        if (fatal) throw pause(folder, scope);
        try { ledger.reserve({ folder, ...scope }, limit); }
        finally { if (ledger.snapshot().stop) wake(); }
      },
      save(raw, meter, rateLimited) {
        const callId = stage2bCallId({ folder, ...meter }), attemptPath = stage2bCallPath({ folder, ...meter });
        const attempt = ledger.attempts.get(callId);
        const metadata = { callId, pid, processIndex: 1, attemptPath, rateLimited: Boolean(rateLimited), sent: attempt.sent };
        put(attemptPath, { ...raw, ...metadata });
        telemetry.push({ ...meter, ...metadata });
        ledger.settle(callId, meter.failureKind, metadata.rateLimited);
        wake();
        return attemptPath;
      },
    };
    let status = 'scored', problem;
    try {
      const variant = student === 'default' ? undefined : student;
      const generation = new Models({ ...controls, roles: ['teacher', 'learner'], learnerJsonMode: Boolean(variant), learnerThinking: variant && hardLearner.thinking,
        responses: mode === 'offline' ? offlineResponses('normal').slice(0, -1) : undefined });
      const teach = createTeacher({ models: generation, variant: 'normal', operatorPolicy, saveEvent: event => teacherEvents.push(event) });
      const studentPrompt = learnerPrompt(task, variant, variant && hardLearner.antiSelfFalsification);
      say('learner', 0, task.user_scenario.instructions.task_instructions);
      for (let turn = 1; turn <= rounds; turn++) {
        say('teacher', turn, await teach(messages.at(-1).text));
        say('learner', turn, await learnerReply(generation, studentPrompt, messages, turn));
      }
      const judge = createWorkingJudge({ ...controls, responses: mode === 'offline' ? splitBinaryOfflineResponses('normal', messages, 1) : undefined });
      const binding = splitBinding({ ...manifest, planned: [{ id: folder, repetition, sourceRunId: id }] }, folder, bindBinary(messages));
      const parts = {}, dimensions = {};
      for (const dimension of splitDimensions) {
        const outcome = await judge(messages, { ...binding, turn: rounds, dimension });
        const { turn, call, attempt, attemptPath } = outcome.binding;
        const role = 'judge', callId = stage2bCallId({ folder, role, turn, call, attempt });
        dimensions[dimension] = { dimension, callId, processIndex: 1, role, turn, call, attempt, attemptPath };
        parts[dimension] = outcome.verdict;
      }
      const { verdict, conflict } = assembleBinaryVerdict(parts, identity.ruler);
      if (conflict) throw failure('judge_partial_failure', { ...dimensions.productive_struggle, crossDimension: { ...conflict, dimensions } }, 'S3 and P1 disagree across dimensions');
      put(`${folder}/judge.json`, { binding: { ...binding, dimensions }, verdict });
    } catch (error) {
      if (fatal || !error.failure) throw fatal ?? error;
      problem = { ...error.failure };
      if (!problem.callId && problem.role && problem.turn && problem.call && problem.attempt) problem.callId = stage2bCallId({ folder, ...problem });
      status = ['batch_stopped', 'budget_exhausted'].includes(problem.kind) ? 'paused' : 'failed';
    }
    put(`${folder}/transcript.json`, messages);
    put(`${folder}/telemetry.json`, telemetry);
    put(`${folder}/teacher-events.json`, teacherEvents);
    ledger.complete(folder, status, problem?.callId);
    completed.set(folder, { ...row, status, ...(problem && { failure: problem }) });
    wake();
  }

  let next = 0;
  while (true) {
    while (!fatal && !ledger.snapshot().stop && next < planned.length && running.size < ledger.snapshot().concurrency) {
      const job = execute(planned[next++]).catch(error => { fatal ??= error; wake(); }).finally(() => running.delete(job));
      running.add(job);
    }
    if (!running.size) break;
    await Promise.race(running);
  }
  if (fatal) throw fatal;
  const { used, stop, failedCells, peakInFlight, downshifts, inFlight } = ledger.snapshot();
  requireThat(inFlight === 0, 'stage 2b stopped with unsettled calls');
  const eventBytes = Buffer.from(events.join(''));
  requireThat(eventBytes.length > 0 && hash(readFileSync(log)) === hash(eventBytes), 'stage 2b admission ledger changed');
  files['admission.jsonl'] = hash(eventBytes);
  const cells = planned.map(row => completed.get(row.folder) ?? { ...row, status: 'not_started' });
  const acceptance = cells.every(row => row.status === 'scored');
  const result = { id, scenario, mode, identityId, acceptance, cells, stop, used, failedCells, peakInFlight, downshifts };
  put('result.json', result);
  recorder.publishEvaluation({ id, scenario, mode, identityId, acceptance, files });
  return result;
}

export async function stage2bCli(argv) {
  const { values: args } = parseArgs({ args: argv, options: {
    scenario: { type: 'string' }, mode: { type: 'string' }, id: { type: 'string' }, 'run-root': { type: 'string', default: 'runs' },
    'estimate-only': { type: 'boolean' }, 'confirm-cost': { type: 'boolean' }, 'proxy-from-env': { type: 'boolean' }, concurrency: { type: 'string' },
    preregistration: { type: 'string' }, 'preregistration-sha256': { type: 'string' }, 'path-addendum': { type: 'string' }, 'path-addendum-sha256': { type: 'string' },
    'max-attempts': { type: 'string' }, 'max-requested-output-tokens': { type: 'string' },
  } });
  const { mode, id: requestedId } = args;
  const id = runId(requestedId), root = resolve(args['run-root']);
  const estimate = Boolean(args['estimate-only']), real = mode === 'real';
  requireThat(args.scenario === scenario && ['offline', 'real'].includes(mode) && args.concurrency === String(stage2bConcurrency)
    && args['max-attempts'] === String(stage2bLimits.maxAttempts) && args['max-requested-output-tokens'] === String(stage2bLimits.maxRequestedOutputTokens)
    && args['run-root'].trim() && args.preregistration && args['path-addendum'], 'stage 2b requires the registered paths, limits, and concurrency 4');
  requireThat(real ? root === resolve(checkout, 'runs') && Boolean(args['proxy-from-env']) && (estimate
    ? id === stage2bEstimateId && !args['confirm-cost'] : id === stage2bRunId && args['confirm-cost'])
    : !estimate && id !== stage2bRunId && id !== stage2bEstimateId && !args['proxy-from-env'] && !args['confirm-cost'],
  'stage 2b real run requires its registered ID, HTTPS proxy opt-in and explicit cost confirmation');
  const registrationDir = resolve(checkout, '.tmp/scratch/stage2b-headroom');
  const readRegistration = (flag, filename) => {
    const file = join(registrationDir, filename);
    requireThat(resolve(args[flag]) === file && lstatSync(file).isFile(), `stage 2b requires its local ${filename}`);
    return readFileSync(file);
  };
  const method = readRegistration('preregistration', 'preregistration.md');
  const addendum = readRegistration('path-addendum', 'preregistration-addendum-path.md');
  requireThat(hash(method) === args['preregistration-sha256'] && hash(addendum) === args['path-addendum-sha256'], 'stage 2b launch SHA256 mismatch');
  const locked = stage2bRegistration(method, addendum);
  const corpus = loadStage2bDev({ primary: join(tmpdir(), 'teacharena', 'stage2-holdout'), backup: 'D:/Archive/teacharena/stage2-holdout', ...locked });
  const prepared = prepareStage2b({ mode, corpus, method, addendum });
  const checkReceipt = real ? requireCheckReceipt() : undefined;
  let estimateReceipt;
  if (real && !estimate) {
    const preflight = verifyRun(root, stage2bEstimateId);
    requireThat(preflight.verified && preflight.requestCount === 0 && preflight.head === checkReceipt.head
      && preflight.stage2b?.identityId === prepared.identityId && preflight.exitCode === 0, 'no matching clean-HEAD zero-request stage 2b preflight');
    estimateReceipt = { id: stage2bEstimateId, head: preflight.head, identityId: preflight.stage2b.identityId, requestCount: preflight.requestCount };
    requireThat(resolveOpenRouterProxySource().source === workingJudge.judgeTransport.proxySource, 'stage 2b requires HTTPS_PROXY');
    loadCredentials();
    requireThat(['DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY'].every(key => process.env[key]?.trim()), 'missing stage 2b model credentials');
  }
  const recorder = startRunReceipt({ root, id, mode, argv });
  let acceptance = null;
  installRunReceiptHandlers(recorder, () => acceptance);
  if (estimate) {
    requireThat(recorder.start.clean && recorder.start.head === checkReceipt.head, 'checkout changed before stage 2b estimate');
    const value = { id, scenario, mode, acceptance, requestCount: 0, identityId: prepared.identityId, judgeFingerprint: prepared.identity.judgeFingerprint,
      dataset: prepared.identity.dataset, checkReceipt, plannedCells: prepared.planned.length, ...prepared.budget, ...stage2bLimits, concurrency: stage2bConcurrency, stop: stage2bStop,
      preregistrationSha256: hash(method), pathAddendumSha256: hash(addendum), writer: { pid: recorder.start.pid, startedAt: recorder.start.startedAt } };
    const sha = atomicJson(join(root, id, 'estimate.json'), value);
    recorder.publishEvaluation({ id, scenario, mode, acceptance, identityId: value.identityId, files: { 'estimate.json': sha } });
    return { exitCode: 0, value };
  }
  const result = await runStage2b({ id, mode, root, concurrency: stage2bConcurrency, recorder, checkReceipt, estimateReceipt }, prepared);
  acceptance = result.acceptance;
  return { exitCode: acceptance ? 0 : 1, value: { id, scenario, mode, identityId: result.identityId, acceptance, stop: result.stop,
    used: result.used, planned: result.cells.length, scored: result.cells.filter(row => row.status === 'scored').length } };
}
