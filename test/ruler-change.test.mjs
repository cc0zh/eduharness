import assert from 'node:assert/strict';
import { test } from 'node:test';

test('a changed ruler cannot pass the check without a verified training reference', async () => {
  const current = { ruler: 'e1-numbered-evidence-v4', fingerprint: '0'.repeat(64) };
  await assert.rejects(async () => {
    const { checkRulerChange } = await import('../scripts/check-ruler.mjs');
    checkRulerChange({ current });
  }, /ruler change requires a training run reference/);
});
