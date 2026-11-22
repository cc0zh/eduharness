import { appendFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { rounds } from '../config/e1.mjs';
import { stage3Concurrency, stage3ProxySource, stage3Scenario as scenario } from '../config/stage3.mjs';
import { runId } from '../contracts/artifacts/schema.mjs';
import { failure, hash, message, requireThat } from '../contracts/core/schema.mjs';
import { bindBinary } from '../contracts/judge/binary.mjs';
import { assembleBinaryVerdict, splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { learnerPrompt, learnerReply } from './learner.mjs';
import { Models } from './models.mjs';
import { resolveOpenRouterProxySource } from './openrouter-proxy.mjs';
import { checkout, loadCredentials, requireCheckReceipt } from './real-preflight.mjs';
import { atomicBytes, atomicJson } from './receipt-files.mjs';
import { installRunReceiptHandlers, startRunReceipt, verifyRun } from './run-receipts.mjs';
import { splitBinding } from './split-judge-replay.mjs';
import { auditPrompt, auditSchema, auditWindow, blindJobs, exposurePrompt, exposureSchema, parseAgencyAudit, parseExposure, rhetoricTranscript } from './stage3-audit.mjs';
import { stage3Fixtures } from './stage3-fixtures.mjs';
import { judgementManifest, prepareStage3, readStage3Method, stage3AddendumFile, stage3AddendumFlag, stage3Budget, stage3CallId, stage3CallPath, stage3Folder, stage3HardLearner, stage3Ledger } from './stage3-plan.mjs';
import { assessStage3, tutorExamples } from './stage3-report.mjs';
import { createTeacher } from './teacher/session.mjs';
import { observeStudent } from './teacher/state-machine.mjs';
import { createWorkingJudge } from './working-judge.mjs';

const blankExposure = { specified: 'uncertain', evidence: null };
const full = messages => messages?.length === 2 * rounds + 1;
const pauseKind = kind => ['budget_exhausted', 'batch_stopped'].includes(kind);
const completeAudit = verdicts => verdicts.every(row => row.verdict);

export async function runStage3({ id, mode, root, recorder, checkReceipt, estimateReceipt }, prepared) {
  const { identity, identityId, planned, tasks, operatorPolicy, method, addendum, budget, limits } = prepared;
  const { pid, startedAt, head, clean } = recorder.start;
  requireThat(pid === process.pid && recorder.start.runId === id && recorder.start.mode === mode, 'stage 3 writer differs from start record');
  requireThat(mode !== 'real' || clean && checkReceipt?.head === head && estimateReceipt?.head === head && estimateReceipt.identityId === identityId,
    'stage 3 HEAD or preflight changed before execution');

  const dir = join(root, id), files = {}, cells = new Map();
  mkdirSync(dir);
  function put(path, value, bytes = false) {
    try { return files[path] = (bytes ? atomicBytes : atomicJson)(join(dir, path), value); }
    catch (error) { throw failure('artifact_io', {}, `cannot publish ${path}: ${error.code ?? 'write failed'}`); }
  }
  const manifest = { id, scenario, mode, identity, identityId, planned, budget, limits, writer: { pid, startedAt }, checkReceipt, estimateReceipt };
  put('manifest.json', manifest);
  put('preregistration.md', method, true);
  if (addendum) put(stage3AddendumFile, addendum, true);
  const log = join(dir, 'admission.jsonl');
  const events = [];
  const ledger = stage3Ledger(limits, event => {
    const line = `${JSON.stringify(event)}\n`;
    appendFileSync(log, line, { flush: true });
    events.push(line);
  });
  const transport = { append(event) {
    if (event.type === 'request_start') ledger.send(event.callId);
    recorder.append(event);
  } };
  const waiters = new Set();
  let fatal;
  const wake = () => { for (const resolve of waiters) resolve(); waiters.clear(); };
  const offline = mode === 'offline';

  function attempts(folder, telemetry) {
    return { mode, recorder: transport, cell: folder.replaceAll('/', ':'),
      async beforeAttempt(scope, limit) {
        if (telemetry.at(-1)?.rateLimited && !ledger.snapshot().stop) await new Promise(resolve => setTimeout(resolve, 100));
        while (!fatal && !ledger.snapshot().stop && ledger.snapshot().inFlight >= ledger.snapshot().concurrency) await new Promise(resolve => waiters.add(resolve));
        if (fatal) throw fatal;
        try { ledger.reserve({ folder, ...scope }, limit); }
        finally { if (ledger.snapshot().stop) wake(); }
      },
      save(raw, meter, rateLimited) {
        const coords = { folder, ...meter }, callId = stage3CallId(coords), attemptPath = stage3CallPath(coords);
        const metadata = { callId, pid, processIndex: 1, attemptPath, sent: ledger.attempts.get(callId).sent, rateLimited: Boolean(rateLimited) };
        put(attemptPath, { ...raw, ...metadata });
        telemetry.push({ ...meter, ...metadata });
        ledger.settle(callId, meter.failureKind, metadata.rateLimited);
        wake();
        return attemptPath;
      },
    };
  }

  async function audit(controls, window, exposure = false) {
    const models = new Models({ ...controls, roles: ['agency_audit'], responses: offline
      ? exposure ? stage3Fixtures.exposure() : stage3Fixtures.audit(window) : undefined });
    try {
      const { value } = await models.complete({ role: 'agency_audit', turn: rounds, call: 1 }, {
        systemPrompt: exposure ? exposurePrompt : auditPrompt,
        messages: [{ role: 'user', timestamp: Date.now(), content: JSON.stringify(window) }],
      }, text => (exposure ? parseExposure : parseAgencyAudit)(text, window), exposure ? exposureSchema : auditSchema);
      return value;
    } finally { await models.close(); }
  }

  async function execute(row) {
    const { folder, taskId, student, arm } = row;
    const telemetry = [], teacherEvents = [], controls = attempts(folder, telemetry);
    const token = folder.replaceAll('/', ':');
    let messages = [], verdict, exposure, baselineSha256, problem;
    let status = 'scored';
    const say = (role, turn, text) => messages.push(message(`${id}:${token}:m:${messages.length + 1}`, role, turn, text));
    try {
      if (arm === 'rhetoric') {
        const baselineFolder = stage3Folder('baseline', taskId, student);
        const baseline = cells.get(baselineFolder);
        if (!full(baseline?.messages)) return;
        baselineSha256 = files[`${baselineFolder}/transcript.json`];
        messages = rhetoricTranscript(id, folder, baseline.messages);
        try { exposure = await audit(controls, auditWindow(baseline.messages), true); }
        catch (error) {
          if (!error.failure || error.failure.kind === 'artifact_io' || pauseKind(error.failure.kind)) throw error;
          exposure = blankExposure;
        }
      } else {
        const task = tasks.get(taskId), variant = student === 'default' ? undefined : student;
        const fixtures = offline ? stage3Fixtures.dialogue(arm, identity.edition) : undefined;
        const models = new Models({ ...controls, roles: ['teacher', 'learner'], responses: fixtures?.generation,
          boundedRetries: true, learnerJsonMode: Boolean(variant), learnerThinking: variant && stage3HardLearner.thinking });
        const observer = arm === 'candidate' ? new Models({ ...controls, roles: ['teacher_observer'], responses: fixtures?.observations }) : null;
        const teach = createTeacher({ models, variant: 'normal', operatorPolicy, saveEvent: event => teacherEvents.push(event), candidateEdition: identity.edition,
          observe: observer && ((window, turn) => observeStudent(observer, window, turn, identity.edition)) });
        const prompt = learnerPrompt(task, variant, variant && stage3HardLearner.antiSelfFalsification);
        say('learner', 0, task.user_scenario.instructions.task_instructions);
        for (let turn = 1; turn <= rounds; turn++) {
          say('teacher', turn, await teach(messages.at(-1).text));
          say('learner', turn, await learnerReply(models, prompt, messages, turn));
        }
      }
      const judge = createWorkingJudge({ ...controls, singleAgencyDecision: true, responses: offline ? stage3Fixtures.judgement(arm, messages) : undefined });
      const binding = splitBinding(judgementManifest(manifest, folder), folder, bindBinary(messages));
      const parts = {}, dimensions = {};
      try {
        for (const dimension of splitDimensions) {
          const outcome = await judge(messages, { ...binding, turn: rounds, dimension });
          const { role, turn, call, attempt, attemptPath } = outcome.binding;
          dimensions[dimension] = { dimension, callId: stage3CallId({ folder, role, turn, call, attempt }), processIndex: 1, role, turn, call, attempt, attemptPath };
          parts[dimension] = outcome.verdict;
        }
      } finally { await judge.close(); }
      const assembled = assembleBinaryVerdict(parts, identity.ruler);
      if (assembled.conflict) throw failure('judge_partial_failure', dimensions.productive_struggle, 'S3 and P1 disagree across dimensions');
      verdict = assembled.verdict;
      put(`${folder}/judge.json`, { binding: { ...binding, dimensions }, verdict });
    } catch (error) {
      if (!error.failure || error.failure.kind === 'artifact_io') throw error;
      problem = error.failure;
      status = pauseKind(problem.kind) ? 'paused' : 'failed';
    }
    put(`${folder}/transcript.json`, messages);
    put(`${folder}/telemetry.json`, telemetry);
    if (arm !== 'rhetoric') put(`${folder}/teacher-events.json`, teacherEvents);
    else put(`${folder}/control.json`, { baselineSha256, exposure: exposure ?? blankExposure });
    ledger.complete(folder, status, problem?.callId);
    cells.set(folder, { ...row, status, messages, teacherEvents, verdict, exposure, failure: problem });
    wake();
  }

  async function schedule(rows, work) {
    let cursor = 0;
    const running = new Set();
    while (true) {
      while (!fatal && !ledger.snapshot().stop && cursor < rows.length && running.size < ledger.snapshot().concurrency) {
        const job = work(rows[cursor++]).catch(error => { fatal ??= error; wake(); }).finally(() => running.delete(job));
        running.add(job);
      }
      if (!running.size) break;
      await Promise.race(running);
    }
    if (fatal) throw fatal;
  }

  await schedule(planned.filter(row => row.arm !== 'rhetoric'), execute);
  await schedule(planned.filter(row => row.arm === 'rhetoric'), execute);
  const ordered = planned.map(row => cells.get(row.folder) ?? { ...row, status: 'not_started' });
  const jobs = blindJobs(ordered);
  const blindMap = jobs.map(({ id, folder }) => ({ id, folder }));
  put('blind-map.json', blindMap);
  const completedAudits = new Map();
  await schedule(jobs, async ({ id, window }) => {
    const folder = `audit/${id}`, telemetry = [];
    try { completedAudits.set(id, { id, verdict: await audit(attempts(folder, telemetry), window) }); }
    catch (error) {
      if (!error.failure || error.failure.kind === 'artifact_io') throw error;
      completedAudits.set(id, { id, failure: error.failure });
    }
    put(`${folder}/telemetry.json`, telemetry);
  });
  const verdicts = jobs.map(({ id }) => completedAudits.get(id) ?? { id, status: 'not_started' });
  const blindVerdictsSha256 = put('blind-verdicts.json', verdicts);
  const audits = blindMap.map(({ id, folder }) => ({ folder, verdict: completedAudits.get(id)?.verdict }));
  const report = { ...assessStage3(ordered, audits, identity.preregistrationAddendum?.exposureGateStudents), blindVerdictsSha256, examples: tutorExamples(ordered) };
  put('report.json', report);

  const { used, stop, failedCells, peakInFlight, downshifts, inFlight } = ledger.snapshot();
  requireThat(inFlight === 0 && events.length > 0, 'stage 3 admission has no complete ledger');
  files['admission.jsonl'] = hash(Buffer.from(events.join('')));
  requireThat(files['admission.jsonl'] === hash(readFileSync(log)), 'stage 3 admission ledger changed');
  const acceptance = !stop && ordered.every(row => row.status === 'scored') && completeAudit(verdicts);
  const result = { id, mode, scenario, identityId, acceptance, adoptionEligible: false, decision: report.decision,
    stop, used, failedCells, peakInFlight, downshifts,
    cells: ordered.map(({ messages: _messages, verdict: _verdict, teacherEvents: _events, exposure: _exposure, ...row }) => row) };
  put('result.json', result);
  recorder.publishEvaluation({ id, mode, scenario, identityId, acceptance, files });
  return result;
}

export async function stage3Cli(argv) {
  const { values: args } = parseArgs({ args: argv, options: {
    scenario: { type: 'string' }, mode: { type: 'string' }, id: { type: 'string' }, 'run-root': { type: 'string' },
    edition: { type: 'string', default: '1' }, concurrency: { type: 'string' }, 'estimate-id': { type: 'string' },
    'estimate-only': { type: 'boolean' }, 'confirm-cost': { type: 'boolean' }, 'proxy-from-env': { type: 'boolean' },
    'preregistration-sha256': { type: 'string' }, [stage3AddendumFlag.slice(2)]: { type: 'string' },
    'max-attempts': { type: 'string' }, 'max-requested-output-tokens': { type: 'string' },
  } });
  const { mode, edition } = args;
  const id = runId(args.id), real = mode === 'real', estimate = Boolean(args['estimate-only']);
  const realRoot = resolve(checkout, 'runs/stage3-dev');
  const root = resolve(args['run-root'] ?? 'runs/stage3-offline');
  const { maxAttempts, maxRequestedOutputTokens } = stage3Budget();
  requireThat(args.scenario === scenario && ['real', 'offline'].includes(mode) && ['1', '2'].includes(edition), 'invalid stage 3 mode or edition');
  requireThat(real ? root === realRoot && args.concurrency === String(stage3Concurrency)
    && args['proxy-from-env'] && args['preregistration-sha256'] && args['max-attempts'] === String(maxAttempts)
    && args['max-requested-output-tokens'] === String(maxRequestedOutputTokens)
    && (estimate ? !args['estimate-id'] && !args['confirm-cost'] : args['estimate-id'] && args['confirm-cost'] && args['estimate-id'] !== id)
    : root !== realRoot && !estimate && !args['estimate-id'] && !args['confirm-cost'] && !args['proxy-from-env'] && !args['max-attempts'] && !args['max-requested-output-tokens']
      && (args.concurrency === undefined || args.concurrency === String(stage3Concurrency)), 'stage 3 requires registered limits, preflight and cost confirmation in real mode');
  const preflightId = real && !estimate ? runId(args['estimate-id']) : null;
  const method = readStage3Method(Number(edition));
  requireThat(!args['preregistration-sha256'] || args['preregistration-sha256'] === method.sha, 'stage 3 preregistration SHA256 mismatch');
  requireThat(args[stage3AddendumFlag.slice(2)] === (real ? method.addendumIdentity?.sha256 : undefined),
    'stage 3 preregistration addendum SHA256 mismatch');
  const checkReceipt = real ? requireCheckReceipt() : undefined;
  if (real) {
    mkdirSync(root, { recursive: true });
    requireThat(resolve(realpathSync(root)) === realRoot, 'stage 3 run root must not redirect');
  }
  const prepared = prepareStage3(mode, Number(edition), method);
  let estimateReceipt;
  if (preflightId) {
    const prior = verifyRun(root, preflightId);
    requireThat(prior.verified && prior.mode === 'real' && prior.requestCount === 0 && prior.exitCode === 0
      && prior.stage3?.estimate && prior.stage3.identityId === prepared.identityId && prior.head === checkReceipt.head,
    'stage 3 requires a matching clean-HEAD zero-request preflight');
    requireThat(resolveOpenRouterProxySource().source === stage3ProxySource, 'stage 3 requires HTTPS_PROXY');
    loadCredentials();
    requireThat(['DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY'].every(key => process.env[key]?.trim()), 'missing stage 3 credentials');
    estimateReceipt = { id: preflightId, head: prior.head, identityId: prior.stage3.identityId, requestCount: prior.requestCount };
  }
  const recorder = startRunReceipt({ root, id, mode, argv });
  let acceptance = null;
  installRunReceiptHandlers(recorder, () => acceptance);
  if (real) requireThat(recorder.start.clean && recorder.start.head === checkReceipt.head, 'stage 3 checkout changed after preflight');
  if (estimate) {
    const { identity, identityId, limits, budget, planned } = prepared;
    const value = { id, mode, scenario, requestCount: 0, acceptance, identity, identityId, limits, budget, plannedCells: planned.length, checkReceipt,
      writer: { pid: recorder.start.pid, startedAt: recorder.start.startedAt } };
    const files = { 'estimate.json': atomicJson(join(root, id, 'estimate.json'), value) };
    if (prepared.addendum) files[stage3AddendumFile] = atomicBytes(join(root, id, stage3AddendumFile), prepared.addendum);
    recorder.publishEvaluation({ id, mode, scenario, identityId, acceptance, files });
    return { value, exitCode: 0 };
  }
  if (real) atomicJson(join(root, '_receipts', `stage3-dev-v${edition}.claim.json`), { id, identityId: prepared.identityId, head: checkReceipt.head, pid: recorder.start.pid });
  const result = await runStage3({ id, mode, root, recorder, checkReceipt, estimateReceipt }, prepared);
  acceptance = result.acceptance;
  return { exitCode: acceptance ? 0 : 1, value: { id, mode, scenario, identityId: result.identityId, acceptance, decision: result.decision,
    adoptionEligible: false, used: result.used, stop: result.stop, planned: result.cells.length, scored: result.cells.filter(row => row.status === 'scored').length } };
}
