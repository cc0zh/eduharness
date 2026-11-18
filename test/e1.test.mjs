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

test('reject unsafe run IDs with structured stdout and a diagnostic', () => {
  const call = spawnSync(process.execPath, ['src/cli.mjs', '--id', '../escape'], { encoding: 'utf8' });
  assert.equal(call.status, 2, call.stderr);
  assert.equal(JSON.parse(call.stdout).failure.kind, 'invalid_input');
  assert.match(call.stderr, /id/i);
});
