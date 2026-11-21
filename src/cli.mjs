import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { modes, runId } from '../contracts/artifacts/schema.mjs';
import { failure } from '../contracts/core/schema.mjs';
import { checkout, loadCredentials, requireCheckReceipt } from './real-preflight.mjs';
import { installRunReceiptHandlers, startRunReceipt, verifyRun } from './run-receipts.mjs';
import { s1Scenario } from './s1-binary-plan.mjs';
import { contrastBudget, judgeContrastScenario } from './judge-contrast-plan.mjs';
import { judgeCandidates } from '../config/judge-contrast.mjs';

const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const argv = process.argv.slice(2);
const leadingArgs = argv.includes('--') ? argv.slice(0, argv.indexOf('--')) : argv;
const option = name => leadingArgs.findLastIndex(value => value === name || value.startsWith(`${name}=`));
const optionValue = name => {
  const index = option(name);
  if (index < 0) return undefined;
  const token = leadingArgs[index];
  if (token !== name) return token.slice(name.length + 1);
  const next = leadingArgs[index + 1];
  return next?.startsWith('-') ? undefined : next;
};

if (option('--export-report') >= 0) {
  try {
    const { values } = parseArgs({ options: { 'export-report': { type: 'string' }, out: { type: 'string' } } });
    const { exportReport } = await import('./html-report.mjs');
    emit(exportReport(values['export-report'], values.out));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
} else if (option('--verify-run') >= 0) {
  try {
    const { values } = parseArgs({ options: { 'run-root': { type: 'string', default: 'runs' }, 'verify-run': { type: 'string' } } });
    const result = verifyRun(values['run-root'], runId(values['verify-run']));
    emit(result);
    if (!result.verified) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    emit({ verified: false, conclusion: 'invalid', missing: [], invalid: [error.message] });
    process.exitCode = 2;
  }
} else {
  const id = (() => { try { return runId(optionValue('--id') ?? randomUUID()); } catch { return randomUUID(); } })();
  const root = resolve(optionValue('--run-root')?.trim() ? optionValue('--run-root') : 'runs');
  const start = (id, extra) => startRunReceipt({ root, id, mode: optionValue('--mode') ?? 'offline', argv, ...extra });
  let recorder;
  let acceptance = null;
  const openRun = (extra = {}) => {
    try { recorder = start(id, extra); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!extra.resume) {
        recorder = start(randomUUID());
        installRunReceiptHandlers(recorder, () => acceptance);
      }
      throw failure('run_conflict', {}, `run ${id} was claimed by another process or already exists`);
    }
    installRunReceiptHandlers(recorder, () => acceptance);
    return recorder;
  };
  const recordRejection = () => {
    if (!recorder && option('--resume') < 0) {
      try { openRun(); } catch (error) { if (!recorder) console.error(`startup receipt write failed: ${error.message}`); }
    }
  };
  const rejectInput = error => {
    recordRejection();
    console.error(error.message);
    emit({ failure: failure('invalid_input', {}, error.message).failure });
    process.exitCode = 2;
  };
  const { budget, run, scenarioName } = await import('./run.mjs');

  let config, estimate, rulerRunner, s1Runner, contrastRunner, ceiling;
  try {
    const { values } = parseArgs({ options: {
      mode: { type: 'string', default: 'offline' }, 'run-root': { type: 'string', default: 'runs' },
      id: { type: 'string' }, 'estimate-only': { type: 'boolean' }, 'confirm-cost': { type: 'boolean' },
      resume: { type: 'boolean' }, concurrency: { type: 'string' },
      'max-attempts': { type: 'string' }, 'max-requested-output-tokens': { type: 'string' },
      'judge-only': { type: 'string' }, 'judge-cell': { type: 'string' }, scenario: { type: 'string', default: 'E1' }, 'verify-run': { type: 'string' },
      phase: { type: 'string' }, freeze: { type: 'string' }, 'generate-only': { type: 'boolean' },
      harness: { type: 'string' }, 'source-root': { type: 'string' }, preregistration: { type: 'string' }, 'preregistration-sha256': { type: 'string' },
      'judge-policy': { type: 'string' },
    } });
    if (!modes.includes(values.mode)) throw new Error('mode must be offline or real');
    if (!['E1', 'E2', 'ruler-expand', s1Scenario, judgeContrastScenario].includes(values.scenario)) throw new Error('unknown scenario');
    const judgeCell = values['judge-cell'];
    const hasJudgeSource = values['judge-only'] !== undefined;
    const e2Replay = values.scenario === 'E2' && hasJudgeSource;
    if (e2Replay ? !['no_teach', 'all'].includes(judgeCell) : judgeCell !== undefined) throw new Error('E2 judge-only requires --judge-cell no_teach or all');
    if (!values['run-root'].trim()) throw new Error('run-root cannot be empty');
    if ((values.harness !== undefined || values['source-root'] !== undefined) && (values.scenario !== 'ruler-expand' || values.phase !== 'ab')) throw new Error('--harness and --source-root require ruler-expand --phase ab');
    if ((values.preregistration !== undefined || values['preregistration-sha256'] !== undefined) && ![s1Scenario, judgeContrastScenario].includes(values.scenario)) throw new Error('preregistration flags require a binary scenario');
    if (values['judge-policy'] !== undefined && values.scenario !== judgeContrastScenario) throw new Error('--judge-policy requires S1-judge-contrast');
    estimate = values['estimate-only'];
    if (values.resume && (!values.id || estimate)) throw new Error('--resume requires --id and cannot be combined with --estimate-only');
    if (values.scenario === 'ruler-expand' && (values.resume || values.concurrency !== undefined)) throw new Error('--resume and --concurrency are not supported for ruler-expand');
    config = { mode: values.mode, scenario: values.scenario, root, id: runId(values.id ?? id), judgeOnly: hasJudgeSource ? runId(values['judge-only']) : undefined,
      judgeCell, openRun, resume: values.resume };
    if (values.scenario === judgeContrastScenario) {
      const judgePolicy = values['judge-policy'];
      if (hasJudgeSource || values.phase !== undefined || values.freeze !== undefined || values['generate-only'] || !Object.hasOwn(judgeCandidates, judgePolicy)) {
        throw new Error('S1-judge-contrast requires a registered --judge-policy and fixed sources');
      }
      contrastRunner = await import('./judge-contrast.mjs');
      Object.assign(config, { judgePolicy, registration: values.preregistration, registrationDigest: values['preregistration-sha256'] });
      ceiling = contrastBudget(judgeCandidates[judgePolicy].policy);
    } else if (values.scenario === s1Scenario) {
      if (!config.judgeOnly || values.phase !== undefined || values.freeze !== undefined || values['generate-only']) throw new Error('S1-binary only admits --judge-only <frozen E2 run ID>');
      s1Runner = await import('./s1-binary.mjs');
      config.registration = values.preregistration;
      config.registrationDigest = values['preregistration-sha256'];
      ceiling = s1Runner.s1Budget();
    } else if (values.scenario === 'ruler-expand') {
      rulerRunner = await import('./ruler-run.mjs');
      config.phase = values.phase;
      if (config.phase === 'test') {
        config.admission = rulerRunner.admitRulerRun(config.phase, values.freeze);
        if (values['generate-only'] || hasJudgeSource) throw new Error('the frozen test phase only admits the combined generation and scoring run');
      } else if (config.phase === 'ab') {
        config.harness = values.harness;
        if (values['generate-only'] || (config.harness === 'rhetoric') !== hasJudgeSource || (config.harness === 'rhetoric') !== Boolean(values['source-root']?.trim())) throw new Error('A/B requires combined generation and scoring except rhetoric, which requires --judge-only <baseline ID> and --source-root <baseline root>');
        config.sourceRoot = values['source-root'];
        config.admission = rulerRunner.admitRulerRun(config.phase, values.freeze, config.harness);
      } else {
        if (values.freeze !== undefined) throw new Error('--freeze requires --phase test');
        if (Boolean(values['generate-only']) === hasJudgeSource) throw new Error('ruler-expand needs exactly one of --generate-only or --judge-only <id>');
        config.admission = rulerRunner.admitRulerRun(config.phase);
      }
      ceiling = rulerRunner.rulerBudget(config.admission.planned, config.judgeOnly, config.phase);
    } else {
      if (values.phase !== undefined || values.freeze !== undefined || values['generate-only']) throw new Error('--phase, --freeze and --generate-only require --scenario ruler-expand');
      ceiling = budget(config);
    }
    function limit(flag, maximum, fallback = maximum) {
      const value = values[flag] ?? String(fallback);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum) throw new Error(`invalid --${flag}; expected 1 through ${maximum}`);
      return Number(value);
    }
    config.concurrency = limit('concurrency', 5, 1);
    config.limits = { maxAttempts: limit('max-attempts', ceiling.maxCalls), maxRequestedOutputTokens: limit('max-requested-output-tokens', ceiling.maxOutputTokens) };
    if (!estimate && config.mode === 'real' && !values['confirm-cost']) throw new Error('real mode requires explicit cost authorization and --confirm-cost');
    if (s1Runner) config.prepared = s1Runner.prepareS1(config, estimate);
    if (contrastRunner) config.prepared = contrastRunner.prepareJudgeContrast(config, estimate);
  } catch (error) {
    rejectInput(error);
  }

  if (config && !process.exitCode) {
    try {
      if (estimate || rulerRunner) config.recorder = openRun();
      if (config.phase === 'test' || config.phase === 'ab') {
        try { config.prepared = rulerRunner.prepareRulerRun(config, { estimate }); }
        catch (error) { rejectInput(error); }
      }
      if (!process.exitCode && estimate) emit({ scenario: s1Runner ? s1Scenario : scenarioName(config), typicalCalls: ceiling.typicalCalls, maxCalls: config.limits.maxAttempts, maxOutputTokens: config.limits.maxRequestedOutputTokens,
        ...(s1Runner && { source: config.prepared.source }), ...(contrastRunner && { identityId: config.prepared.identityId,
          runId: config.prepared.plan.runId, judgePolicy: config.judgePolicy, policyVersion: config.prepared.plan.policyVersion,
          route: config.prepared.candidate.route, preregistrationSha256: config.registrationDigest, concurrency: config.concurrency, retriesPerKind: config.prepared.plan.retriesPerKind }),
        ...rulerRunner?.holdoutEstimate(config.prepared) });
      else if (!process.exitCode) {
        const prepared = config.prepared ?? rulerRunner?.prepareRulerRun(config);
        if (config.mode === 'real') {
          config.checkReceipt = requireCheckReceipt(checkout, recorder ? [recorder.startPath, recorder.requestPath] : []);
          if (recorder && (!recorder.start.clean || config.checkReceipt.head !== recorder.start.head)) throw failure('preflight_failed', {}, 'checkout changed after startup');
          loadCredentials(config.judgeOnly || contrastRunner ? ['judge'] : config.phase === 'train' ? ['teacher', 'learner'] : undefined);
        }
        const result = contrastRunner ? await contrastRunner.runJudgeContrast(config, prepared) : s1Runner ? await s1Runner.runS1(config, prepared)
          : rulerRunner ? await rulerRunner.runRuler(config, prepared) : await run(config);
        acceptance = result.acceptance;
        emit(rulerRunner ? rulerRunner.publicRulerResult(result) : result);
        if (!result.acceptance) {
          const failed = result.cells.find(cell => cell.failure);
          const problem = failed?.failure;
          if (s1Runner || contrastRunner) console.error(problem ? `${problem.kind} at ${[failed.repetition, failed.id].filter(Boolean).join('/')}: ${problem.detail}` : `${result.scenario} did not complete all planned cells`);
          else if (rulerRunner) console.error(problem ? `${problem.kind} at ${problem.taskId}/${problem.condition}` : `${result.scenario} did not complete all planned cells`);
          else console.error(problem ? `${problem.kind} at ${problem.role}:${problem.turn}:${problem.call}, ${resolve(result.runDir, problem.attemptPath ?? '.')}${problem.kind === 'configuration' ? `: ${problem.detail}` : ''}` : `${result.scenario} did not separate all target dimensions`);
          process.exitCode = 1;
        }
      }
    } catch (error) {
      recordRejection();
      console.error(error.message);
      emit({ failure: error.failure ?? failure('artifact_io', {}, error.message).failure });
      process.exitCode = 1;
    }
  }
}
