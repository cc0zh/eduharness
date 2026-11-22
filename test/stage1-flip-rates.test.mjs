import assert from 'node:assert/strict';
import test from 'node:test';
import { computeFlipRates } from '../scripts/stage1-flip-rates.mjs';

const dimension = 'verification_or_transfer';
const row = (cell, { run = 'retest', transcriptSha256 = 'a'.repeat(64), requestSha256 = 'b'.repeat(64), yes = false } = {}) => ({
  run, cell, transcriptSha256, requestSha256, dimension, callId: `${cell}:judge:4:6:1`, answers: { V1: yes, V2: false }, score: Number(yes),
});

test('same dialogue and request across cohorts form all unordered pairs, with exact call coordinates', () => {
  const rates = computeFlipRates([
    row('x', { run: 'bakeoff' }), row('x', { yes: true }), row('y'),
    row('changed prompt', { requestSha256: 'c'.repeat(64), yes: true }),
    row('changed dialogue', { transcriptSha256: 'd'.repeat(64), yes: true }),
  ]);
  assert.equal(Object.keys(rates.questions).length, 19);
  assert.deepEqual(rates.questions.V1, { pairs: 3, flips: 2, rate: 2 / 3, sufficient: true });
  assert.deepEqual(rates.questions.V2, { pairs: 3, flips: 0, rate: 0, sufficient: true });
  assert.deepEqual(rates.questions.A1, { pairs: 0, flips: 0, rate: null, sufficient: false });
  assert.deepEqual(rates.dimensions[dimension].score, rates.questions.V1);
  assert.deepEqual(rates.dimensions[dimension].anyQuestion, rates.questions.V1);
  assert.deepEqual(rates.dimensions[dimension].questionBits, { pairs: 6, flips: 2, rate: 1 / 3, sufficient: true });
  assert.deepEqual(rates.groups[0].flips.map(flip => [flip.first.run, flip.first.callId, flip.second.run, flip.second.callId, flip.questions]), [
    ['bakeoff', 'x:judge:4:6:1', 'retest', 'x:judge:4:6:1', ['V1']],
    ['retest', 'x:judge:4:6:1', 'retest', 'y:judge:4:6:1', ['V1']],
  ]);
});

test('one pair is insufficient and N/A is not the same as a zero score', () => {
  const pivot = 'representation_pivot';
  const observed = [{ ...row('x'), dimension: pivot, answers: { R0: false, R1: false, R2: false }, score: 'N/A' },
    { ...row('y'), dimension: pivot, answers: { R0: true, R1: false, R2: false }, score: 0 }];
  const rates = computeFlipRates(observed);
  assert.deepEqual(rates.dimensions[pivot].score, { pairs: 1, flips: 1, rate: 1, sufficient: false });
  assert.equal(rates.dimensions[pivot].questionBits.sufficient, false);
  assert.equal(rates.groups[0].sufficient, false);
});

test('a missing or malformed bit is never counted as No and copies are not repeats', () => {
  assert.throws(() => computeFlipRates([row('x'), row('x')]), /duplicate.*x/);
  for (const answers of [{ V2: false }, { V1: 0, V2: false }, { V1: '', V2: false }, { V1: false, V2: false, A1: false }]) {
    assert.throws(() => computeFlipRates([{ ...row('x'), answers }]), /retest.*x.*answers/);
  }
});
