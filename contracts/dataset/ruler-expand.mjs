import { readFileSync } from 'node:fs';
import { hash, record, requireThat } from '../core/schema.mjs';
import { readTask } from './schema.mjs';

export const rulerTaskSource = 'data/upstream/tasks/stage0_situated_tutoring.json';
const splitPath = 'data/ruler-expand-v1.json';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url));
const seed = 'teacharena-ruler-expand-v1';
const trainCount = 15;
const candidateCount = 40;
const pinned = ['S0-01', 'S0-06'];
const subjects = ['B', 'C', 'F', 'G', 'I', 'M', 'P'];
const conditions = ['normal', 'answer_dump', 'lecture', 'sycophant_close', 'no_teach'];
const digestOrder = (stage, ids) => ids.map(id => [hash(`${seed}:${stage}:${id}`), id]).sort().map(([, id]) => id);
const listHash = ids => hash(`${ids.join('\n')}\n`);

function partition(items) {
  const strata = subjects.map(subject => {
    const ids = Object.keys(items).filter(id => items[id].subject === subject).sort();
    const numerator = ids.length * trainCount;
    return { subject, ids, quota: Math.floor(numerator / candidateCount), remainder: numerator % candidateCount };
  });
  const extras = trainCount - strata.reduce((n, stratum) => n + stratum.quota, 0);
  strata.sort((a, b) => b.remainder - a.remainder || a.subject.localeCompare(b.subject));
  for (const stratum of strata.slice(0, extras)) stratum.quota++;

  const train = new Set();
  for (const { ids, quota } of strata) {
    const familyIds = [...new Set(ids.map(id => items[id].family))];
    const fixed = new Set(pinned.filter(id => ids.includes(id)).map(id => items[id].family));
    let left = quota;
    for (const family of [...fixed, ...digestOrder('split', familyIds).filter(id => !fixed.has(id))]) {
      const group = ids.filter(id => items[id].family === family);
      if (group.length > left && !fixed.has(family)) continue;
      requireThat(group.length <= left, 'pinned family exceeds stratified quota');
      for (const id of group) train.add(id);
      left -= group.length;
    }
    requireThat(left === 0, 'a family cannot fit the stratified quota');
  }
  return { train: digestOrder('train', [...train]), test: digestOrder('test', Object.keys(items).filter(id => !train.has(id))) };
}

export function validateRulerSplit(split, sourceBytes, legacy) {
  requireThat(split?.seed === seed && record(split.items), 'invalid ruler split or seed');
  requireThat(hash(sourceBytes) === split.sourceSha256, 'ruler split source hash mismatch');
  const ids = Object.keys(split.items).sort();
  requireThat(ids.length === candidateCount && pinned.every(id => ids.includes(id)), 'invalid ruler split candidate count or pinned tasks');
  const excluded = new Set([...legacy.holdout, ...legacy.excludedInvalid, 'S0-16', 'S0-17', 'S0-24', 'S0-28', 'S0-67']);
  for (const id of ids) {
    const { subject, family } = split.items[id];
    requireThat(legacy.dev.includes(id) && !excluded.has(id) && subjects.includes(subject), `invalid ruler split candidate ${id}`);
    requireThat(Object.hasOwn(split.items, family) && family <= id && split.items[family].family === family && split.items[family].subject === subject, `invalid family for ${id}`);
  }
  const { train, test } = split;
  const trainIds = new Set(train), testIds = new Set(test);
  requireThat(Array.isArray(train) && trainIds.size === trainCount && train.length === trainCount, 'invalid train list');
  requireThat(Array.isArray(test) && testIds.size === candidateCount - trainCount && test.length === testIds.size, 'invalid test list');
  for (const id of ids) {
    requireThat(trainIds.has(id) !== testIds.has(id), `invalid split membership for ${id}`);
    requireThat(trainIds.has(id) === trainIds.has(split.items[id].family), `family crosses the train/test split at ${id}`);
  }
  const expected = partition(split.items);
  for (const phase of ['train', 'test']) {
    requireThat(listHash(split[phase]) === split[`${phase}Sha256`], `${phase} list hash mismatch`);
    requireThat(listHash(split[phase]) === listHash(expected[phase]), `${phase} list order or membership cannot be reproduced`);
  }
  return split;
}

export function loadRulerSplit() {
  return validateRulerSplit(JSON.parse(read(splitPath)), read(rulerTaskSource), JSON.parse(read('data/s0-v1.json')));
}

export function trainingPlan(phase, split) {
  requireThat(phase !== 'test', 'test phase is blocked: the ruler is unfrozen');
  requireThat(phase === 'train', 'ruler phase must be train or test');
  split ??= loadRulerSplit();
  return split.train.map((taskId, i) => ({ taskId, condition: conditions[(i + 4) % conditions.length] }));
}

export function readRulerTask(rows, split, taskId) {
  requireThat(split.train.includes(taskId), `${taskId} is not in the training list`);
  return readTask(rows, taskId);
}
