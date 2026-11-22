import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { hash } from '../contracts/core/schema.mjs';
import { loadStage2bDev, stage2bBudget, stage2bLimits } from '../src/stage2b-plan.mjs';
import { stage2bLedger } from '../src/stage2b-ledger.mjs';
import { prepareStage2b, runStage2b } from '../src/stage2b-run.mjs';
import { startRunReceipt, verifyRun } from '../src/run-receipts.mjs';

const json = value => JSON.stringify(value);
function fixture(t) {
  const scratch = resolve('.tmp/scratch/stage2b-headroom');
  mkdirSync(scratch, { recursive: true });
  const work = mkdtempSync(join(scratch, 'test-'));
  t.after(() => rmSync(work, { force: true, recursive: true }));
  const primary = join(work, 'primary'), backup = join(work, 'backup');
  const dev = Array.from({ length: 4 }, (_, i) => `TA2B-F0${i + 1}`).flatMap(family => ['A', 'B'].map(side => {
    const id = `${family}-${side}`;
    const input = json([{ id, user_scenario: { persona: 'synthetic', instructions: {
      task_instructions: 'I am confused about a synthetic practice question.', known_info: 'some algebra', unknown_info: 'this step',
      reason_for_call: 'ask about a step', student_model: { private: 'private student fixture' },
    } } }]);
    for (const root of [primary, backup]) {
      mkdirSync(join(root, 'dev'), { recursive: true });
      writeFileSync(join(root, 'dev', `${id}.json`), input);
    }
    return { id, family, sha256: hash(input) };
  }));
  const manifest = json([...dev, { id: 'outside-dev', family: 'not part of eval', sha256: 'never loaded' }]);
  for (const root of [primary, backup]) writeFileSync(join(root, 'manifest.json'), manifest);
  return { root: join(work, 'runs'), primary, backup, dev, manifestSha256: hash(manifest) };
}

test('only registered dev files are loaded, and only a missing source or wrong manifest digest enables backup', t => {
  const input = fixture(t);
  assert.equal(loadStage2bDev(input).source, 'primary');
  assert.equal(loadStage2bDev(input).tasks.size, 8);
  const firstFile = join(input.primary, 'dev', `${input.dev[0].id}.json`);
  writeFileSync(firstFile, 'not loaded from backup when a dev hash differs');
  assert.throws(() => loadStage2bDev(input), /dev file digest.*TA2B-F01-A/);
  writeFileSync(join(input.primary, 'manifest.json'), 'wrong');
  assert.equal(loadStage2bDev(input).source, 'backup');
  writeFileSync(join(input.backup, 'manifest.json'), 'also wrong');
  assert.throws(() => loadStage2bDev(input), /manifest.*SHA256/);
});

test('48 cells use the registered upper bounds, not 3x the no-tool request count', () => {
  assert.deepEqual(stage2bBudget(), { typicalCalls: 672, logicalCalls: 864, maxCalls: 2592, maxOutputTokens: 11999232 });
  assert.deepEqual(stage2bLimits, { maxAttempts: 2592, maxRequestedOutputTokens: 11999232 });
});

const coordinate = (folder, role = 'teacher', attempt = 1) => ({ folder, role, turn: role === 'judge' ? 4 : 1, call: 1, attempt });
test('mixed-role provider stop counts settled sends, and blocked calls cannot send', () => {
  const ledger = stage2bLedger(stage2bLimits, 4);
  for (const [i, role] of ['teacher', 'learner', 'judge'].entries()) {
    const call = coordinate(`r1/TA2B-F01-A/${['default','stubborn','answer-seeker'][i]}`, role);
    const id = ledger.reserve(call, role === 'teacher' ? 5296 : 4096);
    ledger.send(id);
    ledger.settle(id, 'provider_failure', i === 0);
  }
  assert.equal(ledger.snapshot().stop.kind, 'consecutive_provider_failures');
  assert.equal(ledger.snapshot().concurrency, 3);
  assert.throws(() => ledger.reserve(coordinate('r2/TA2B-F01-A/default'), 5296), /stopped/);
});

test('failed cells are counted separately from provider and budget stops', () => {
  const ledger = stage2bLedger(stage2bLimits, 4);
  for (const student of ['default', 'stubborn', 'answer-seeker']) ledger.complete(`r1/TA2B-F01-A/${student}`, 'failed');
  assert.equal(ledger.snapshot().stop.kind, 'consecutive_failed_cells');
  const capped = stage2bLedger({ maxAttempts: 1, maxRequestedOutputTokens: 5296 }, 4);
  const id = capped.reserve(coordinate('r1/TA2B-F01-A/default'), 5296);
  capped.send(id);
  assert.throws(() => capped.reserve(coordinate('r1/TA2B-F01-A/stubborn'), 5296), /budget/);
  capped.settle(id, null, false);
  assert.equal(capped.snapshot().used.attempts, 1);
  assert.equal(capped.snapshot().stop.kind, 'budget_exhausted');
});

test('offline uses the full registered four-turn path and the same artifact verifier, including PID binding', async t => {
  const input = fixture(t), mode = 'offline', id = 'stage2b-fixture';
  const argv = ['--scenario', 'stage2b-headroom', '--mode', mode, '--concurrency', '4', '--id', id];
  const prepared = prepareStage2b({ mode, corpus: loadStage2bDev(input), method: Buffer.from('fixture method'), addendum: Buffer.from('fixture addendum') });
  const recorder = startRunReceipt({ root: input.root, id, mode, argv });
  const result = await runStage2b({ id, root: input.root, mode, concurrency: 4, recorder }, prepared);
  recorder.finish({ exitCode: 0, acceptance: result.acceptance });
  assert.equal(result.acceptance, true);
  assert.equal(result.cells.length, 48);
  assert.deepEqual([...new Set(result.cells.map(row => row.status))], ['scored']);
  const cell = join(input.root, id, 'r2/TA2B-F04-B/answer-seeker');
  const read = name => JSON.parse(readFileSync(join(cell, name)));
  assert.equal(read('transcript.json').length, 9);
  assert.equal(Object.keys(read('judge.json').binding.dimensions).length, 6);
  assert.ok(read('telemetry.json').every(row => row.pid === process.pid));
  const verified = verifyRun(input.root, id);
  assert.equal(verified.verified, true, verified.invalid.join('; '));
  assert.equal(verified.requestCount, 0);
  writeFileSync(join(cell, 'telemetry.json'), '[]');
  assert.equal(verifyRun(input.root, id).verified, false);
});
