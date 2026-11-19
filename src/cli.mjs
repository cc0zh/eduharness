import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { modes, runId } from '../contracts/artifacts/schema.mjs';
import { failure } from '../contracts/core/schema.mjs';
import { checkout, loadCredentials, requireCheckReceipt } from './real-preflight.mjs';
import { installRunReceiptHandlers, startRunReceipt, verifyRun } from './run-receipts.mjs';

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

  let config, estimate, rulerRunner, ceiling;
  try {
    const { values } = parseArgs({ options: {
      mode: { type: 'string', default: 'offline' }, 'run-root': { type: 'string', default: 'runs' },
      id: { type: 'string' }, 'estimate-only': { type: 'boolean' }, 'confirm-cost': { type: 'boolean' },
      'max-attempts': { type: 'string' }, 'max-requested-output-tokens': { type: 'string' },
      'judge-only': { type: 'string' }, 'judge-cell': { type: 'string' }, scenario: { type: 'string', default: 'E1' }, 'verify-run': { type: 'string' },
      phase: { type: 'string' }, 'generate-only': { type: 'boolean' },
    } });
    if (!modes.includes(values.mode)) throw new Error('mode must be offline or real');
    if (!['E1', 'E2', 'ruler-expand'].includes(values.scenario)) throw new Error('scenario must be E1, E2 or ruler-expand');
    const judgeCell = values['judge-cell'];
    const hasJudgeSource = values['judge-only'] !== undefined;
    const e2Replay = values.scenario === 'E2' && hasJudgeSource;
    if (e2Replay ? !['no_teach', 'all'].includes(judgeCell) : judgeCell !== undefined) throw new Error('E2 judge-only requires --judge-cell no_teach or all');
    if (!values['run-root'].trim()) throw new Error('run-root cannot be empty');
    estimate = values['estimate-only'];
    config = { mode: values.mode, scenario: values.scenario, root, id: runId(values.id ?? id), judgeOnly: hasJudgeSource ? runId(values['judge-only']) : undefined, judgeCell, recorder };
    if (values.scenario === 'ruler-expand') {
      if (Boolean(values['generate-only']) === hasJudgeSource) throw new Error('ruler-expand needs exactly one of --generate-only or --judge-only <id>');
      rulerRunner = await import('./ruler-run.mjs');
      config.phase = values.phase;
      config.admission = rulerRunner.admitRulerRun(config.phase);
      ceiling = rulerRunner.rulerBudget(config.admission.planned, config.judgeOnly);
    } else {
      if (values.phase !== undefined || values['generate-only']) throw new Error('--phase and --generate-only require --scenario ruler-expand');
      ceiling = budget(config);
    }
    function limit(flag, maximum) {
      const value = values[flag] ?? String(maximum);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum) throw new Error(`invalid --${flag}; expected 1 through ${maximum}`);
      return Number(value);
    }
    config.limits = { maxAttempts: limit('max-attempts', ceiling.maxCalls), maxRequestedOutputTokens: limit('max-requested-output-tokens', ceiling.maxOutputTokens) };
    if (!estimate && config.mode === 'real' && !values['confirm-cost']) throw new Error('real mode requires explicit cost authorization and --confirm-cost');
  } catch (error) {
    console.error(error.message);
    emit({ failure: failure('invalid_input', {}, error.message).failure });
    process.exitCode = 2;
  }

  if (config && !process.exitCode) {
    try {
      if (conflict) throw failure('run_conflict', {}, `run ID ${id} already has a startup record; this launch was recorded as ${recorder.start.runId}`);
      if (estimate) emit({ scenario: scenarioName(config), typicalCalls: ceiling.typicalCalls, maxCalls: config.limits.maxAttempts, maxOutputTokens: config.limits.maxRequestedOutputTokens });
      else {
        const prepared = rulerRunner?.prepareRulerRun(config);
        if (config.mode === 'real') {
          config.checkReceipt = requireCheckReceipt(checkout, [recorder.startPath, recorder.requestPath]);
          if (!recorder.start.clean || config.checkReceipt.head !== recorder.start.head) throw failure('preflight_failed', {}, 'checkout changed after startup');
          loadCredentials(config.judgeOnly ? ['judge'] : rulerRunner ? ['teacher', 'learner'] : undefined);
        }
        const result = rulerRunner ? await rulerRunner.runRuler(config, prepared) : await run(config);
        acceptance = result.acceptance;
        emit(rulerRunner ? rulerRunner.publicRulerResult(result) : result);
        if (!result.acceptance) {
          const problem = result.cells.find(cell => cell.failure)?.failure;
          if (rulerRunner) console.error(problem ? `${problem.kind} at ${problem.taskId}/${problem.condition}` : `${result.scenario} did not complete all planned cells`);
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
