import assert from 'node:assert/strict';
import { test } from 'node:test';

test('the frozen v3 rubric matches the original fingerprint without a change reference', async () => {
  const { checkRulerChange } = await import('../scripts/check-ruler.mjs');
  assert.doesNotThrow(() => checkRulerChange({ reference: null }));
});

test('a changed ruler cannot pass the check without a verified training reference', async () => {
  const current = { ruler: 'e1-numbered-evidence-v4', fingerprint: '0'.repeat(64) };
  await assert.rejects(async () => {
    const { checkRulerChange } = await import('../scripts/check-ruler.mjs');
    checkRulerChange({ current, reference: null });
  }, /ruler change requires a training run reference/);
});

test('an altered fingerprint needs a new version and a matching reference to a real run', async () => {
  const { checkRulerChange } = await import('../scripts/check-ruler.mjs');
  const current = { ruler: 'e1-numbered-evidence-v4', fingerprint: '0'.repeat(64) };
  assert.throws(() => checkRulerChange({ current: { ...current, ruler: 'e1-numbered-evidence-v3' }, reference: current }), /new ruler version/);
  assert.throws(() => checkRulerChange({ current, reference: { ...current, fingerprint: '1'.repeat(64) } }), /does not match/);
  assert.throws(() => checkRulerChange({ current, reference: { ...current, trainingRunId: 'fabricated' }, root: '.tmp/scratch/ruler-expand' }), /verified real training run/);
});
