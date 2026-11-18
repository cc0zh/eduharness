import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { modes, runId } from '../contracts/artifacts/schema.mjs';
import { failure } from '../contracts/core/schema.mjs';
import { budget, run, scenarioName } from './run.mjs';
import { loadCredentials, requireCheckReceipt } from './real-preflight.mjs';

const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
let config, estimate;
try {
  const { values } = parseArgs({ options: {
    mode: { type: 'string', default: 'offline' }, 'run-root': { type: 'string', default: 'runs' },
    id: { type: 'string' }, 'estimate-only': { type: 'boolean' }, 'confirm-cost': { type: 'boolean' },
    'max-attempts': { type: 'string' }, 'max-requested-output-tokens': { type: 'string' },
    'judge-only': { type: 'string' }, scenario: { type: 'string', default: 'E1' },
  } });
  if (!modes.includes(values.mode)) throw new Error('mode must be offline or real');
  if (!['E1', 'E2'].includes(values.scenario)) throw new Error('scenario must be E1 or E2');
  if (values.scenario === 'E2' && values['judge-only'] !== undefined) throw new Error('--judge-only is only available for E1');
  if (!values['run-root'].trim()) throw new Error('run-root cannot be empty');
  estimate = values['estimate-only'];
  config = { mode: values.mode, scenario: values.scenario, root: resolve(values['run-root']), id: runId(values.id ?? randomUUID()), judgeOnly: values['judge-only'] === undefined ? undefined : runId(values['judge-only']) };
  const ceiling = budget(config);
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
    if (estimate) emit({ scenario: scenarioName(config), typicalCalls: budget(config).typicalCalls, maxCalls: config.limits.maxAttempts, maxOutputTokens: config.limits.maxRequestedOutputTokens });
    else {
      if (config.mode === 'real') {
        config.checkReceipt = requireCheckReceipt();
        loadCredentials(config.judgeOnly ? ['judge'] : undefined);
      }
      const result = await run(config);
      emit(result);
      if (!result.acceptance) {
        const problem = result.cells.find(cell => cell.failure)?.failure;
        console.error(problem ? `${problem.kind} at ${problem.role}:${problem.turn}:${problem.call}, ${resolve(result.runDir, problem.attemptPath ?? '.')}${problem.kind === 'configuration' ? `: ${problem.detail}` : ''}` : `${result.scenario} did not separate all target dimensions`);
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(error.message);
    emit({ failure: error.failure ?? failure('artifact_io', {}, error.message).failure });
    process.exitCode = 1;
  }
}
