import assert from 'node:assert/strict';
import test from 'node:test';

for (const [name, text] of [['bad shape', '{"text":37}'], ['truncated', '{"text":"hi"'], ['empty', '  '], ['trailing text', '{"text":"hi"} extra']]) {
  test(`learner JSON rejects ${name}`, async () => {
    const { parseLearner } = await import('./schema.mjs');
    assert.throws(() => parseLearner(text));
  });
}

test('learner JSON accepts a valid reply', async () => {
  const { parseLearner } = await import('./schema.mjs');
  assert.deepEqual(parseLearner('{"text":"hi"}'), { text: 'hi' });
});
