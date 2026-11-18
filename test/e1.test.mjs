import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('one offline command emits two valid cells with resolvable evidence', t => {
  mkdirSync('.tmp/scratch/e1', { recursive: true });
  const root = mkdtempSync(resolve('.tmp/scratch/e1/run-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const call = spawnSync(process.execPath, ['src/cli.mjs', '--mode', 'offline', '--run-root', root, '--id', 'test'], { encoding: 'utf8' });
  assert.equal(call.status, 0, call.stderr);
  assert.equal(call.stderr, '');
  const result = JSON.parse(call.stdout);
  const read = file => JSON.parse(readFileSync(resolve(result.runDir, file), 'utf8'));
  assert.equal(read('manifest.json').mode, 'offline');
  assert.deepEqual(read('result.json'), result);
  const manifest = read('manifest.json');
  assert.ok(Number.isInteger(manifest.writer.pid));
  assert.ok(read('normal/telemetry.json').every(row => row.pid === manifest.writer.pid));
  const duplicate = spawnSync(process.execPath, ['src/cli.mjs', '--mode', 'offline', '--run-root', root, '--id', 'test'], { encoding: 'utf8' });
  assert.equal(duplicate.status,1);
  assert.equal(JSON.parse(duplicate.stdout).failure.kind,'run_conflict');
  assert.deepEqual(read('manifest.json'),manifest);
  assert.deepEqual(result.cells.map(c => c.id), ['normal', 'answer_dump']);
  assert.ok(result.cells[0].directAnswer - result.cells[1].directAnswer >= 1);
  for (const cell of result.cells) {
    assert.equal(cell.status, 'execution_success');
    assert.equal(cell.validTotal, true);
    assert.equal(typeof cell.total, 'number');
    const messages = read(`${cell.id}/transcript.json`);
    assert.ok(messages.length >= 3);
    const groups = Object.values(read(`${cell.id}/judge.json`));
    assert.ok(groups.length >= 2);
    for (const group of groups) for (const dimension of Object.values(group)) {
      assert.ok(dimension.evidence.length > 0);
      for (const id of dimension.evidence) assert.ok(messages.some(message => message.id === id && message.text));
    }
    assert.ok(read(`${cell.id}/teacher-events.json`).some(event => event.kind === 'finishTurn'));
    const calls = read(`${cell.id}/telemetry.json`);
    assert.ok(calls.every(call => call.attempt === 1 && call.requestLimit > 0));
    for (const attempt of calls.filter(call => call.role === 'learner')) {
      const { context } = read(attempt.attemptPath);
      assert.doesNotMatch(JSON.stringify(context), /teacharena_internal|Private reasoning fixture|check_distance/);
    }
  }
  const teacherEvents = read('normal/teacher-events.json');
  const before = teacherEvents.find(event => event.kind === 'beforeToolCall');
  assert.ok(before && teacherEvents.some(event => event.kind === 'afterToolCall' && event.toolCallId === before.toolCallId && !event.isError));
});

test('a shared attempt budget stops before sending the next model request', async () => {
  const { attemptBudget } = await import('../src/models.mjs');
  const account = attemptBudget({maxAttempts:2,maxRequestedOutputTokens:10});
  account({role:'teacher'},6);
  const exhausted = error => error.failure?.kind === 'budget_exhausted' && error.failure.role === 'judge';
  assert.throws(() => account({role:'judge'},5), exhausted);
  account({role:'learner'},4);
  assert.throws(() => account({role:'judge'},1), exhausted);
});

test('CLI shares the same attempt allowance between both cells', t => {
  mkdirSync('.tmp/scratch/e1', { recursive: true });
  const root = mkdtempSync(resolve('.tmp/scratch/e1/budget-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const call = spawnSync(process.execPath, ['src/cli.mjs', '--run-root', root, '--id', 'budget', '--max-attempts', '10'], { encoding: 'utf8' });
  assert.equal(call.status, 1);
  const result = JSON.parse(call.stdout);
  assert.equal(result.cells[0].validTotal, true);
  assert.equal(result.cells[1].failure.kind, 'budget_exhausted');
  assert.deepEqual(JSON.parse(readFileSync(resolve(result.runDir, 'answer_dump/telemetry.json'))), []);
});

test('reject unsafe run IDs with structured stdout and a diagnostic', () => {
  const call = spawnSync(process.execPath, ['src/cli.mjs', '--id', '../escape'], { encoding: 'utf8' });
  assert.equal(call.status, 2, call.stderr);
  assert.equal(JSON.parse(call.stdout).failure.kind, 'invalid_input');
  assert.match(call.stderr, /id/i);
});

test('estimate-only reports the effective limits for an authorized real retry', () => {
  const call = spawnSync(process.execPath, ['src/cli.mjs', '--mode', 'real', '--estimate-only', '--max-attempts', '54', '--max-requested-output-tokens', '442704'], { encoding: 'utf8' });
  assert.equal(call.status, 0, call.stderr);
  const estimate = JSON.parse(call.stdout);
  assert.equal(estimate.maxCalls, 54);
  assert.equal(estimate.maxOutputTokens, 442704);
});
