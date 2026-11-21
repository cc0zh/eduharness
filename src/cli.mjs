import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { modes, runId } from '../contracts/artifacts/schema.mjs';
import { failure } from '../contracts/core/schema.mjs';
import { checkout, loadCredentials, requireCheckReceipt } from './real-preflight.mjs';
import { installRunReceiptHandlers, startRunReceipt, verifyRun } from './run-receipts.mjs';
import { s1Scenario } from './s1-binary-plan.mjs';

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

if (option('--verify-run') >= 0) {
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
  const start = id => startRunReceipt({ root, id, mode: optionValue('--mode') ?? 'offline', argv });
  let recorder, conflict = false;
  try { recorder = start(id); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    conflict = true;
    recorder = start(randomUUID());
  }
  let acceptance = null;
  installRunReceiptHandlers(recorder, () => acceptance);
  const { budget, run, scenarioName } = await import('./run.mjs');

  let config, estimate, rulerRunner, s1Runner, ceiling;
  try {
    const { values } = parseArgs({ options: {
      mode: { type: 'string', default: 'offline' }, 'run-root': { type: 'string', default: 'runs' },
      id: { type: 'string' }, 'estimate-only': { type: 'boolean' }, 'confirm-cost': { type: 'boolean' },
      'max-attempts': { type: 'string' }, 'max-requested-output-tokens': { type: 'string' },
      'judge-only': { type: 'string' }, 'judge-cell': { type: 'string' }, scenario: { type: 'string', default: 'E1' }, 'verify-run': { type: 'string' },
      phase: { type: 'string' }, freeze: { type: 'string' }, 'generate-only': { type: 'boolean' },
      harness: { type: 'string' }, 'source-root': { type: 'string' }, preregistration: { type: 'string' }, 'preregistration-sha256': { type: 'string' },
    } });
    if (!modes.includes(values.mode)) throw new Error('mode must be offline or real');
    if (!['E1', 'E2', 'ruler-expand', s1Scenario].includes(values.scenario)) throw new Error('scenario must be E1, E2, ruler-expand or S1-binary');
    const judgeCell = values['judge-cell'];
    const hasJudgeSource = values['judge-only'] !== undefined;
    const e2Replay = values.scenario === 'E2' && hasJudgeSource;
    if (e2Replay ? !['no_teach', 'all'].includes(judgeCell) : judgeCell !== undefined) throw new Error('E2 judge-only requires --judge-cell no_teach or all');
    if (!values['run-root'].trim()) throw new Error('run-root cannot be empty');
    if ((values.harness !== undefined || values['source-root'] !== undefined) && (values.scenario !== 'ruler-expand' || values.phase !== 'ab')) throw new Error('--harness and --source-root require ruler-expand --phase ab');
    if ((values.preregistration !== undefined || values['preregistration-sha256'] !== undefined) && values.scenario !== s1Scenario) throw new Error('preregistration flags require S1-binary');
    estimate = values['estimate-only'];
    config = { mode: values.mode, scenario: values.scenario, root, id: runId(values.id ?? id), judgeOnly: hasJudgeSource ? runId(values['judge-only']) : undefined, judgeCell, recorder };
    if (values.scenario === s1Scenario) {
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
    function limit(flag, maximum) {
      const value = values[flag] ?? String(maximum);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum) throw new Error(`invalid --${flag}; expected 1 through ${maximum}`);
      return Number(value);
    }
    config.limits = { maxAttempts: limit('max-attempts', ceiling.maxCalls), maxRequestedOutputTokens: limit('max-requested-output-tokens', ceiling.maxOutputTokens) };
    if (!estimate && config.mode === 'real' && !values['confirm-cost']) throw new Error('real mode requires explicit cost authorization and --confirm-cost');
    if (s1Runner) config.prepared = s1Runner.prepareS1(config, estimate);
    if (config.phase === 'test' || config.phase === 'ab') config.prepared = rulerRunner.prepareRulerRun(config, { estimate });
  } catch (error) {
    console.error(error.message);
    emit({ failure: failure('invalid_input', {}, error.message).failure });
    process.exitCode = 2;
  }

  if (config && !process.exitCode) {
    try {
      if (conflict) throw failure('run_conflict', {}, `run ID ${id} already has a startup record; this launch was recorded as ${recorder.start.runId}`);
      if (estimate) emit({ scenario: s1Runner ? s1Scenario : scenarioName(config), typicalCalls: ceiling.typicalCalls, maxCalls: config.limits.maxAttempts, maxOutputTokens: config.limits.maxRequestedOutputTokens,
        ...(s1Runner && { source: config.prepared.source }), ...rulerRunner?.holdoutEstimate(config.prepared) });
      else {
        const prepared = config.prepared ?? rulerRunner?.prepareRulerRun(config);
        if (config.mode === 'real') {
          config.checkReceipt = requireCheckReceipt(checkout, [recorder.startPath, recorder.requestPath]);
          if (!recorder.start.clean || config.checkReceipt.head !== recorder.start.head) throw failure('preflight_failed', {}, 'checkout changed after startup');
          loadCredentials(config.judgeOnly ? ['judge'] : config.phase === 'train' ? ['teacher', 'learner'] : undefined);
        }
        const result = s1Runner ? await s1Runner.runS1(config, prepared) : rulerRunner ? await rulerRunner.runRuler(config, prepared) : await run(config);
        acceptance = result.acceptance;
        emit(rulerRunner ? rulerRunner.publicRulerResult(result) : result);
        if (!result.acceptance) {
          const problem = result.cells.find(cell => cell.failure)?.failure;
          if (s1Runner) console.error(problem ? `${problem.kind} at ${result.cells.at(-1).repetition}/${result.cells.at(-1).id}: ${problem.detail}` : `${result.scenario} did not complete all planned cells`);
          else if (rulerRunner) console.error(problem ? `${problem.kind} at ${problem.taskId}/${problem.condition}` : `${result.scenario} did not complete all planned cells`);
          else console.error(problem ? `${problem.kind} at ${problem.role}:${problem.turn}:${problem.call}, ${resolve(result.runDir, problem.attemptPath ?? '.')}${problem.kind === 'configuration' ? `: ${problem.detail}` : ''}` : `${result.scenario} did not separate all target dimensions`);
          process.exitCode = 1;
        }
      }
    } catch (error) {
      console.error(error.message);
      emit({ failure: error.failure ?? failure('artifact_io', {}, error.message).failure });
      process.exitCode = 1;
    }
  }
}
