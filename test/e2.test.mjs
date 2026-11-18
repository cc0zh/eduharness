import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const targets = {
  answer_dump: 'productive_struggle',
  lecture: 'agency_handoff',
  sycophant_close: 'verification_or_transfer',
  no_teach: 'misconception_repair',
};
const invoke = (...args) => spawnSync(process.execPath, ['src/cli.mjs', ...args], { encoding: 'utf8' });

test('offline E2 records four preregistered raw comparisons against one normal dialogue', t => {
  mkdirSync('.tmp/scratch/e2', { recursive: true });
  const root = mkdtempSync(resolve('.tmp/scratch/e2/run-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const args = ['--scenario', 'E2', '--run-root', root];
  const call = invoke(...args, '--id', 'offline');
  assert.equal(call.status, 0, call.stderr);
  const result = JSON.parse(call.stdout);
  const read = (id, file) => JSON.parse(readFileSync(resolve(root, id, file), 'utf8'));
  assert.deepEqual(read('offline', 'result.json'), result);
  assert.equal(read('_receipts', 'offline.json').acceptance, true);
  const manifest = read('offline', 'manifest.json');
  assert.equal(manifest.scenario, 'E2');
  assert.equal(manifest.mode, 'offline');
  assert.equal(manifest.taskId, 'S0-06');
  assert.equal(manifest.identity.ruler, 'e1-numbered-evidence-v2');
  assert.deepEqual(manifest.identity.targets, targets);
  assert.deepEqual(result.cells.map(cell => cell.id).sort(), ['normal', ...Object.keys(targets)].sort());
  assert.ok(result.cells.every(cell => cell.status === 'execution_success' && cell.validTotal));
  const opening = read('offline', 'normal/transcript.json')[0].text;
  const judge = cell => read('offline', `${cell}/judge.json`);
  for (const row of result.comparisons) {
    assert.equal(row.dimension, targets[row.cell]);
    assert.ok(row.delta >= 1);
    for (const [cell, side] of [['normal', row.normal], [row.cell, row.variant]]) {
      const original = judge(cell);
      const dimension = Object.values(original.groups).find(group => Object.hasOwn(group, row.dimension))[row.dimension];
      const messages = read('offline', `${cell}/transcript.json`);
      assert.equal(messages[0].text, opening);
      assert.equal(messages.length, 9);
      assert.equal(side.score, dimension.score);
      assert.deepEqual(side.references.map(ref => ref.id), dimension.evidence);
      assert.ok(side.references.length);
      for (const ref of side.references) {
        const { id, turn, role } = messages[ref.number - 1];
        assert.deepEqual(ref, { id, number: original.binding.messageIds.indexOf(id) + 1, turn, role });
      }
    }
  }
  assert.equal(result.comparisons.length, 4);
  for (const [cell, dimension, slot] of [
    ['lecture', 'agency_handoff', 'late_student_drives_agency'],
    ['sycophant_close', 'verification_or_transfer', 'tutor_consolidation_or_transfer_prompt'],
    ['no_teach', 'misconception_repair', 'tutor_why_flawed'],
  ]) {
    const row = Object.values(judge(cell).groups).find(group => Object.hasOwn(group, dimension))[dimension];
    assert.equal(row.evidence_groups[0].slots[slot].state, 'not_observed');
  }

  const limited = invoke(...args, '--id', 'limited', '--max-attempts', '10');
  assert.equal(limited.status, 1, limited.stderr);
  const stopped = JSON.parse(limited.stdout);
  assert.equal(stopped.cells.at(-1).failure.kind, 'budget_exhausted');
  assert.equal(stopped.cells.length, 2);
  assert.ok(stopped.comparisons.every(row => row.normal && row.variant === null && row.delta === null));
});

test('E2 estimate covers the whole shared run and rejects incompatible input', () => {
  const estimate = invoke('--scenario', 'E2', '--mode', 'real', '--estimate-only');
  assert.equal(estimate.status, 0, estimate.stderr);
  assert.deepEqual(JSON.parse(estimate.stdout), { scenario: 'E2', typicalCalls: 45, maxCalls: 147, maxOutputTokens: 1610112 });
  for (const options of [['--scenario', 'bad'], ['--scenario', 'E2', '--judge-only', 'source']]) {
    const invalid = invoke(...options, '--estimate-only');
    assert.equal(invalid.status, 2, invalid.stderr);
    assert.equal(JSON.parse(invalid.stdout).failure.kind, 'invalid_input');
  }
});
