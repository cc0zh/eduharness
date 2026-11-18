import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('judge accepts a bound payload and rejects foreign and reversed IDs', async () => {
  const { bind, parseJudge } = await import('./schema.mjs');
  const { messages, response } = JSON.parse(readFileSync(new URL('./example.json', import.meta.url)));
  const view = bind(messages);
  response.context_id = view.id;
  const parse = () => parseJudge(JSON.stringify(response), view, ['productive_struggle']);
  assert.equal(parse().productive_struggle.score, 0);
  const slots = response.results.productive_struggle.evidence_groups[0].slots;
  slots.tutor_delay_of_gratification.message_ids = ['foreign:m:2'];
  assert.throws(parse, /ID/);
  slots.tutor_delay_of_gratification.message_ids = ['example:m:2'];
  slots.student_stuck_or_error.message_ids = ['example:m:3'];
  assert.throws(parse, /order/);
});

test('judge rejects overlapping teaching cycles even when each group is internally ordered', async () => {
  const { bind, parseJudge, ruler } = await import('./schema.mjs');
  const messages = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'teacher' : 'learner', text: `message ${i}` }));
  const view = bind(messages);
  const group = (a, b) => ({ claim: 'support_chain', slots: {
    student_stuck_or_error: { state: 'observed', message_ids: [a] },
    tutor_delay_of_gratification: { state: 'observed', message_ids: [b] },
  } });
  const parse = evidence_groups => parseJudge(JSON.stringify({ contract_version: ruler, context_id: view.id, results: { productive_struggle: { score: 2, reason: 'Two distinct cycles.', evidence_groups } } }), view, ['productive_struggle']);
  assert.equal(parse([group('m0', 'm1'), group('m2', 'm3')]).productive_struggle.score, 2);
  assert.throws(() => parse([group('m0', 'm5'), group('m2', 'm3')]), /group order/);
});
