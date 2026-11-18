import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('S0-01 distinguishes the verified answer 43 from the endorsed 57', async () => {
  const { checkOriginalAnswer } = await import('./schema.mjs');
  const source = JSON.parse(readFileSync(new URL('./example.json', import.meta.url)));
  assert.deepEqual(checkOriginalAnswer(source.taskId, source.messages), { expected: 43, mismatches: [{ proposed: 57, confirmationId: 'm10' }] });
  const correct = source.messages.map(m => ({ ...m, text: m.text.replaceAll('57', '43') }));
  assert.deepEqual(checkOriginalAnswer(source.taskId, correct).mismatches, []);
});
