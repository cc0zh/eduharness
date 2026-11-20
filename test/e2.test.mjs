import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { run } from '../src/run.mjs';

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
  assert.equal(manifest.identity.ruler, 'e1-numbered-evidence-v3');
  assert.equal(manifest.identity.judgeOutputContract, 'judge-output-v2');
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
  for (const options of [['--scenario', 'bad'], ['--scenario', 'E2', '--judge-only', 'source'], ['--judge-cell', 'no_teach'], ['--scenario', 'E2', '--judge-only', 'source', '--judge-cell', 'normal']]) {
    const invalid = invoke(...options, '--estimate-only');
    assert.equal(invalid.status, 2, invalid.stderr);
    assert.equal(JSON.parse(invalid.stdout).failure.kind, 'invalid_input');
  }
});

test('E2 judge-only verifies frozen sources and never reruns their teachers or learners', async t => {
  mkdirSync('.tmp/scratch/e2', { recursive: true });
  const root = mkdtempSync(resolve('.tmp/scratch/e2/regrade-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cli = (...args) => invoke('--scenario', 'E2', '--run-root', root, ...args);
  const source = cli('--id', 'source');
  assert.equal(source.status, 0, source.stderr);
  const transcript = resolve(root, 'source/no_teach/transcript.json');
  const bytes = readFileSync(transcript, 'utf8');
  const sourceResultPath = resolve(root, 'source/result.json');
  const sourceResult = JSON.parse(source.stdout);
  Object.assign(sourceResult.cells.at(-1), { status: 'infra_failure', scored: false, validTotal: false, total: null, directAnswer: null });
  writeFileSync(sourceResultPath, JSON.stringify(sourceResult));
  const sourceJudgePath = resolve(root, 'source/no_teach/judge.json');
  const sourceGroups = JSON.parse(readFileSync(sourceJudgePath, 'utf8')).groups;
  rmSync(sourceJudgePath);
  const options = ['--judge-only', 'source', '--judge-cell', 'no_teach'];
  const estimate = cli(...options, '--estimate-only');
  assert.equal(estimate.status, 0, estimate.stderr);
  assert.deepEqual(JSON.parse(estimate.stdout), { scenario: 'E2-judge-only', typicalCalls: 1, maxCalls: 3, maxOutputTokens: 196608 });
  const replay = cli(...options, '--id', 'replay');
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).acceptance, true);
  const verification = invoke('--run-root', root, '--verify-run', 'replay');
  assert.equal(verification.status, 0, verification.stdout);
  assert.deepEqual(JSON.parse(replay.stdout).cells.map(c => c.id), ['no_teach']);
  const read = file => JSON.parse(readFileSync(resolve(root, 'replay', file), 'utf8'));
  assert.deepEqual(read('no_teach/telemetry.json').map(x => x.role), ['judge']);
  assert.deepEqual(read('no_teach/transcript.json'), JSON.parse(bytes));
  assert.deepEqual(read('no_teach/judge.json').groups, sourceGroups);
  assert.equal(read('manifest.json').source.cell, 'no_teach');
  assert.equal(readFileSync(transcript, 'utf8'), bytes);
  const allOptions = ['--judge-only', 'source', '--judge-cell', 'all'];
  await assert.rejects(run({ mode: 'real', root, id: 'offline-source', scenario: 'E2', judgeOnly: 'source', judgeCell: 'all' }), /real frozen source/);
  const allEstimate = cli(...allOptions, '--estimate-only');
  assert.equal(allEstimate.status, 0, allEstimate.stderr);
  assert.deepEqual(JSON.parse(allEstimate.stdout), { scenario: 'E2-judge-only', typicalCalls: 5, maxCalls: 15, maxOutputTokens: 983040 });
  const all = cli(...allOptions, '--id', 'replay-all');
  assert.equal(all.status, 0, all.stderr);
  const allResult = JSON.parse(all.stdout);
  assert.equal(allResult.comparisons.length, 4);
  assert.deepEqual(allResult.cells.map(x=>x.id), sourceResult.cells.map(x=>x.id));
  const originalManifest = readFileSync(resolve(root, 'source', 'manifest.json'));
  const frozen = JSON.parse(readFileSync(resolve(root, 'replay-all', 'manifest.json'))).source;
  assert.equal(frozen.identityId, JSON.parse(originalManifest).identityId);
  assert.equal(frozen.ruler, JSON.parse(originalManifest).identity.ruler);
  assert.equal(frozen.manifestSha256, createHash('sha256').update(originalManifest).digest('hex'));
  for (const {id} of allResult.cells) {
    const readCell = file => JSON.parse(readFileSync(resolve(root, 'replay-all', id, file), 'utf8'));
    assert.deepEqual(readCell('telemetry.json').map(x=>x.role), ['judge']);
    assert.deepEqual(readCell('transcript.json'), JSON.parse(readFileSync(resolve(root, 'source', id, 'transcript.json'))));
    assert.equal(readCell('judge.json').binding.sourceRunId, 'source');
  }
  const manifestPath = resolve(root, 'source/manifest.json');
  const callPath = resolve(root, 'source/no_teach/calls/judge-4-1-1.json');
  const sourceCall = JSON.parse(readFileSync(callPath));
  for (const version of [2, 4]) {
    const ruler = `e1-numbered-evidence-v${version}`;
    const historical = JSON.parse(originalManifest);
    historical.identity.ruler = ruler;
    writeFileSync(manifestPath, JSON.stringify(historical));
    writeFileSync(callPath, JSON.stringify({ ...sourceCall, binding: { ...sourceCall.binding, ruler } }));
    const replay = cli(...options, '--id', `replay-v${version}`);
    assert.equal(replay.status, 0, replay.stderr);
    const replayed = JSON.parse(readFileSync(resolve(root, `replay-v${version}/no_teach/judge.json`)));
    assert.equal(replayed.binding.ruler, 'e1-numbered-evidence-v3');
    assert.equal(JSON.parse(readFileSync(resolve(root, `replay-v${version}/manifest.json`))).identity.ruler, 'e1-numbered-evidence-v3');
  }
  writeFileSync(manifestPath, originalManifest);
  writeFileSync(callPath, JSON.stringify(sourceCall));
  const changed = JSON.parse(bytes);
  changed[1].text += ' edited';
  writeFileSync(transcript, JSON.stringify(changed));
  const rejected = cli(...options, '--id', 'tampered');
  assert.equal(rejected.status, 1, rejected.stderr);
  assert.equal(JSON.parse(rejected.stdout).failure.kind, 'invalid_input');
  assert.equal(cli(...allOptions, '--id', 'tampered-all').status, 1);
});
