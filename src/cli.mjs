import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { modes, runId } from '../contracts/artifacts/schema.mjs';
import { failure } from '../contracts/core/schema.mjs';
import { budget, runE1 } from './run.mjs';

const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
let config, estimate;
try {
  const { values } = parseArgs({ options: {
    mode: { type: 'string', default: 'offline' }, 'run-root': { type: 'string', default: 'runs' },
    id: { type: 'string' }, 'estimate-only': { type: 'boolean' }, 'confirm-cost': { type: 'boolean' },
  } });
  if (!modes.includes(values.mode)) throw new Error('mode must be offline or real');
  if (!values['run-root'].trim()) throw new Error('run-root cannot be empty');
  estimate = values['estimate-only'];
  config = { mode: values.mode, root: resolve(values['run-root']), id: runId(values.id ?? randomUUID()) };
  if (!estimate && config.mode === 'real' && !values['confirm-cost']) throw new Error('real mode requires explicit cost authorization and --confirm-cost');
} catch (error) {
  console.error(error.message);
  emit({ failure: failure('invalid_input', {}, error.message).failure });
  process.exitCode = 2;
}

if (config && !process.exitCode) {
  try {
    if (estimate) emit({ scenario: 'E1', ...budget() });
    else {
      const result = await runE1(config);
      emit(result);
      if (!result.acceptance) {
        const problem = result.cells.find(cell => cell.failure)?.failure;
        console.error(problem ? `${problem.kind} at ${problem.role}:${problem.turn}:${problem.call}, ${resolve(result.runDir, problem.attemptPath ?? '.')}` : 'E1 direct-answer check did not separate the two cells');
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(error.message);
    emit({ failure: error.failure ?? failure('artifact_io', {}, error.message).failure });
    process.exitCode = 1;
  }
}
