import assert from 'node:assert/strict';
import test from 'node:test';
import { fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { Models, stopFailure } from '../src/models.mjs';
import { parseFidelityAudit } from '../contracts/learner/fidelity.mjs';
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

function realAudit(t, respond) {
  const key = 'audit-credential-canary';
  const before = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = key;
  t.after(() => {
    if (before === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = before;
  });
  const payloads = [], attempts = [];
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    payloads.push(JSON.parse(init.body));
    return respond(key);
  });
  const models = new Models({ mode: 'real', roles: ['fidelity_audit'], save: (raw, row) => attempts.push({ raw, row }) });
  return { payloads, attempts, call: parse => models.complete({ role: 'fidelity_audit', turn: 4, call: 1 },
    { messages: [{ role: 'user', timestamp: 1, content: 'Review the sample.' }] }, parse) };
}

test('real audit sends a pinned non-reasoning strict JSON request and still binds the quotes locally', async t => {
  const sample = { sample: 'A', messages: [{ n: 8, text: 'Try a step.' }, { n: 9, text: 'I need a hint.' }] };
  const row = { sample: 'A', stance: 'exposed-gap', progress: 'none', unsupported: false, privateLeak: false,
    teacher: { n: 8, quote: 'Try a step' }, learner: { n: 9, quote: 'need a hint' }, reason: 'A gap is visible.' };
  const chunk = content => ({ id: 'transport-fixture', provider: 'Parasail', choices: [{ index: 0, delta: { content }, finish_reason: 'stop' }] });
  const { call, payloads, attempts } = realAudit(t, () => new Response(`data: ${JSON.stringify(chunk(JSON.stringify({ observations: [row] })))}\n\ndata: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } }));
  assert.deepEqual((await call(text => parseFidelityAudit(text, [sample]))).value, [row]);
  const [sent] = payloads;
  assert.equal(sent.model, 'qwen/qwen3-235b-a22b-2507');
  assert.deepEqual(sent.provider, { require_parameters: true, only: ['parasail/fp8'], allow_fallbacks: false });
  assert.equal(Object.hasOwn(sent, 'reasoning'), false);
  assert.equal(sent.max_tokens ?? sent.max_completion_tokens, 4096);
  assert.equal(sent.response_format.type, 'json_schema');
  assert.equal(sent.response_format.json_schema.strict, true);
  const rows = sent.response_format.json_schema.schema.properties.observations.items;
  assert.equal(rows.additionalProperties, false);
  assert.deepEqual(rows.required.sort(), Object.keys(row).sort());
  assert.equal(attempts[0].raw.outbound.response_format.json_schema.schema, '[redacted]');
  assert.equal(attempts[0].row.auditUpstream, 'Parasail');
});

test('audit HTTP errors retain diagnostic fields, not credentials or raw bodies', async t => {
  const { call, attempts } = realAudit(t, key => Response.json({ error: {
    code: 403, message: `Permission denied for ${key}`, metadata: { provider_name: 'Parasail', raw: `Bearer ${key}`, error_type: 'permission' },
  } }, { status: 403 }));
  await assert.rejects(call(JSON.parse), error => error.failure?.kind === 'provider_failure' && error.failure.attempt === 3);
  assert.equal(attempts.length, 3);
  assert.deepEqual(attempts[0].row.auditError, { code: 403, hasMessage: true, kind: 'permission', provider: 'Parasail' });
  assert.doesNotMatch(JSON.stringify(attempts), /audit-credential-canary|Bearer|Permission denied for/);
});
