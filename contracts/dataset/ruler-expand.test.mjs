import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const contract = () => import('./ruler-expand.mjs');
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url));
const source = () => read('data/upstream/tasks/stage0_situated_tutoring.json');

test('the test phase is closed until the ruler has a signed freeze', async () => {
  await assert.rejects(async () => (await contract()).trainingPlan('test'), /test phase.*unfrozen/);
});

test('the locked split is reproducible, old holdout remains separate, and condition counts are balanced', async () => {
  const { loadRulerSplit, trainingPlan, readRulerTask } = await contract();
  const split = loadRulerSplit();
  const legacy = JSON.parse(read('data/s0-v1.json'));
  assert.equal(split.seed, 'teacharena-ruler-expand-v1');
  assert.equal(split.train.length, 15);
  assert.equal(split.test.length, 25);
  const members = new Set([...split.train, ...split.test]);
  assert.equal(members.size, 40);
  assert.ok(legacy.holdout.every(id => !members.has(id)));
  assert.ok(['S0-01', 'S0-06'].every(id => split.train.includes(id)));
  assert.ok(['S0-08', 'S0-16', 'S0-67'].every(id => !members.has(id)));
  const plan = trainingPlan('train', split);
  assert.deepEqual(plan.map(row => row.taskId), split.train);
  for (const condition of ['normal', 'answer_dump', 'lecture', 'sycophant_close', 'no_teach']) {
    assert.equal(plan.filter(row => row.condition === condition).length, 3);
  }
  const rows = JSON.parse(source());
  assert.deepEqual(readRulerTask(rows, split, 'S0-01'), rows.find(row => row.id === 'S0-01'));
  assert.throws(() => readRulerTask(rows, split, split.test[0]), /not in the training list/);
  assert.throws(() => readRulerTask(rows, split, legacy.holdout[0]), /not in the training list/);
});

test('edited ordered lists, source bytes, and a split family fail validation', async () => {
  const { validateRulerSplit, loadRulerSplit } = await contract();
  const split = loadRulerSplit();
  const legacy = JSON.parse(read('data/s0-v1.json'));
  assert.throws(() => validateRulerSplit({ ...split, train: [...split.train].reverse() }, source(), legacy), /train.*(hash|order)/);
  assert.throws(() => validateRulerSplit(split, Buffer.concat([source(), Buffer.from('\n')]), legacy), /source hash/);
  const adjusted = structuredClone(split);
  adjusted.items[adjusted.test[0]].family = adjusted.train[0];
  assert.throws(() => validateRulerSplit(adjusted, source(), legacy), /family/);
});

test('the approved candidates and legacy holdout cannot be silently redefined', async () => {
  const { validateRulerSplit, loadRulerSplit } = await contract();
  const split = loadRulerSplit();
  const legacy = JSON.parse(read('data/s0-v1.json'));
  const replacement = structuredClone(split);
  const oldId = 'S0-20';
  replacement.items['S0-19'] = { ...replacement.items[oldId], family: 'S0-19' };
  delete replacement.items[oldId];
  assert.throws(() => validateRulerSplit(replacement, source(), legacy), /approved candidates/);
  const changed = { ...legacy, holdout: legacy.holdout.slice(1) };
  assert.throws(() => validateRulerSplit(split, source(), changed), /legacy holdout/);
  assert.throws(() => validateRulerSplit({ ...split, train: {} }, source(), legacy), /invalid train list/);
});
