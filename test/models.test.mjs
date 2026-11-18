import assert from 'node:assert/strict';
import test from 'node:test';
import { fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { Models, stopFailure } from '../src/models.mjs';
import { parseLearner } from '../contracts/learner/schema.mjs';

test('model boundary preserves every failed attempt; no fourth attempt or fallback text', async () => {
  const saved = [];
  const envelope = (text, stopReason = 'stop') => fauxAssistantMessage([fauxText(text)], { stopReason });
  const models = new Models({ mode: 'offline', responses: [envelope('{"text":"partial"}', 'length'), envelope(''), envelope('{"text":"valid-looking"} extra'), envelope('{"text":"must not consume"}')], save: (raw, row) => {
    saved.push({ raw, row });
    return `${raw.attempt}.json`;
  } });
  await assert.rejects(models.complete({ role: 'learner', turn: 2, call: 1 }, { messages: [{ role: 'user', content: 'try', timestamp: 1 }] }, parseLearner), { failure: { status: 'infra_failure', kind: 'simulator_generation_contract', role: 'learner', turn: 2, call: 1, attempt: 3, attemptPath: '3.json', detail: 'invalid JSON document' } });
  assert.deepEqual(saved.map(x => x.row.failureKind), ['output_truncated', 'empty_unconfirmed', 'simulator_generation_contract']);
  assert.deepEqual(saved.map(x => x.row.retryCount), [0, 1, 2]);
});

test('reasoning exhaustion requires a provider count equal to all output at the limit', () => {
  const response = { stopReason: 'length', usage: { output: 10 } };
  assert.equal(stopFailure(response, '', 10, 10), 'reasoning_exhausted_empty');
  assert.equal(stopFailure(response, '', null, 10), 'output_limit_empty_unconfirmed');
  assert.equal(stopFailure(response, '', 0, 10), 'output_limit_empty_unconfirmed');
  assert.equal(stopFailure(response, 'partial', 9, 10), 'output_truncated');
});

test('provider refusal cannot be treated as a successful generation even with full JSON', () => {
  assert.equal(stopFailure({ stopReason: 'stop' }, '{"text":"looks valid"}', 0, 10, 'content_filter'), 'provider_failure');
});

test('learner JSON on toolUse cannot become a published utterance', async () => {
  const unfinished = fauxAssistantMessage([fauxText('{"text":"looks valid"}'), fauxToolCall('unsolicited', {})], { stopReason: 'toolUse' });
  const complete = fauxAssistantMessage([fauxText('{"text":"complete"}')]);
  const rows = [];
  const models = new Models({ mode: 'offline', responses: [unfinished, complete], save: (_raw, row) => rows.push(row) });
  const result = await models.complete({ role: 'learner', turn: 1, call: 1 }, { messages: [{ role: 'user', content: 'try', timestamp: 1 }] }, parseLearner);
  assert.deepEqual(result.value, { text: 'complete' });
  assert.deepEqual(rows.map(r => r.failureKind), ['simulator_generation_contract', null]);
});
