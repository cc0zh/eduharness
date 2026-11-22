import assert from 'node:assert/strict';
import test from 'node:test';
import { Models } from '../src/models.mjs';

const route = new URL('https://openrouter.ai/api/v1/chat/completions');
const scope = { role: 'judge', turn: 4, call: 1 };
const context = { messages: [{ role: 'user', timestamp: 1, content: 'Decide' }] };
const schema = { type: 'object', properties: { answer: { type: 'boolean' } }, required: ['answer'], additionalProperties: false };
const sse = chunk => `data: ${JSON.stringify(chunk)}\n\n`;
const delta = (delta, finish_reason = null) => sse({ id: 'fixture', choices: [{ index: 0, delta, finish_reason }] });
const usage = sse({ choices: [], usage: { prompt_tokens: 13, completion_tokens: 37, total_tokens: 50, completion_tokens_details: { reasoning_tokens: 31 } } });
const prelude = ': keepalive\n\n' + delta({ role: 'assistant' });
const done = 'data: [DONE]\n\n';
const headers = { 'content-type': 'text/event-stream' };
const success = () => new Response(prelude + delta({ content: ' ' }) + delta({ reasoning_text: 'A reason' })
  + delta({ reasoning: 'More' }) + delta({ content: '{"answer":true}' }, 'stop') + usage + done, { headers });

function setup(t, sequence, options = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'timing-test-fixture';
  t.after(() => {
    if (key === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = key;
  });
  const rows = [], events = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    assert.equal(new URL(input).href, route.href);
    assert(sequence.length, 'no unexpected transport attempt');
    return sequence.shift()(init.signal, JSON.parse(init.body));
  });
  const originals = [];
  const models = new Models({ mode: 'real', roles: ['judge'], cell: 'fake', save: (raw, row) => { originals.push(raw); rows.push(row); },
    recorder: { append: event => events.push(event) }, ...options });
  return { rows, events, originals, judge: () => models.complete(scope, context, JSON.parse, schema),
    judgeWithoutSchema: () => models.complete(scope, context, JSON.parse) };
}

function ordered(...stamps) {
  assert(stamps.every((ms, i) => Number.isInteger(ms) && ms >= (stamps[i - 1] ?? 0)), JSON.stringify(stamps));
}

test('judge telemetry separates headers, bytes, reasoning and visible JSON without changing the verdict', async t => {
  const { judge, rows, events } = setup(t, [success]);
  assert.deepEqual((await judge()).value, { answer: true });
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.timeoutMs, 180_000);
  assert.deepEqual([row.reasoningTokens, row.reportedOutputTokens, row.visibleTokens], [31, 37, 6]);
  const { requestSent, headersReceived, firstByte, firstReasoning, lastReasoning, firstVisible, ended } = row.phaseMs;
  ordered(requestSent, headersReceived, firstByte, firstReasoning, lastReasoning, firstVisible, ended, row.elapsedMs);
  assert.deepEqual(events.map(event => event.type), ['request_start', 'request_end']);
});

test('truncated visible JSON and a failure before headers retain different, per-attempt phases', async t => {
  const broken = () => { throw new TypeError('fixture transport disconnect'); };
  const truncated = () => new Response(delta({ reasoning_details: [{ type: 'reasoning.text', text: 'Budget' }] })
    + delta({ content: '{"answer":' }, 'length') + done, { headers });
  const { judge, rows } = setup(t, [broken, truncated, success]);
  assert.deepEqual((await judge()).value, { answer: true });
  const [transport, partial, complete] = rows;
  assert.deepEqual(rows.map(row => row.failureKind), ['provider_failure', 'output_truncated', null]);
  ordered(transport.phaseMs.requestSent, transport.phaseMs.ended);
  assert.deepEqual(['headersReceived', 'firstByte', 'firstReasoning', 'lastReasoning', 'firstVisible'].map(k => transport.phaseMs[k]), Array(5).fill(null));
  ordered(partial.phaseMs.firstByte, partial.phaseMs.firstReasoning, partial.phaseMs.firstVisible, partial.phaseMs.ended);
  assert.deepEqual([partial.reasoningTokens, partial.reportedOutputTokens], [null, null]);
  ordered(complete.phaseMs.firstByte, complete.phaseMs.firstReasoning, complete.phaseMs.firstVisible, complete.phaseMs.ended);
});

test('a judge-only diagnostic override bounds the body read and records reasoning without visible text', async t => {
  const stall = signal => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(prelude + delta({ content: ' ' }) + delta({ reasoning_content: 'Still reasoning' })));
    const failsafe = setTimeout(() => controller.error(new Error('test deadline was not applied')), 1_500);
    signal.addEventListener('abort', () => {
      clearTimeout(failsafe);
      controller.error(signal.reason);
    }, { once: true });
  } }), { headers });
  const { judge, rows } = setup(t, [stall, success], { judgeTimeoutMs: 350 });
  assert.deepEqual((await judge()).value, { answer: true });
  const [aborted, complete] = rows;
  assert.equal(aborted.timeoutMs, 350);
  assert.equal(complete.timeoutMs, 350);
  assert.equal(aborted.detail, 'local request timeout');
  ordered(aborted.phaseMs.requestSent, aborted.phaseMs.firstByte, aborted.phaseMs.firstReasoning, aborted.phaseMs.ended);
  assert.deepEqual([aborted.phaseMs.firstVisible, aborted.reasoningTokens, aborted.reportedOutputTokens], [null, null, null]);
});

test('a judge deadline override cannot enter a mixed-role run', () => {
  assert.throws(() => new Models({ mode: 'offline', roles: ['judge', 'learner'], responses: [], judgeTimeoutMs: 360_000 }),
    error => error.failure?.kind === 'configuration');
});

test('the opt-in HY4 request disables reasoning and preserves structured judging, policy identity and reported zero', async t => {
  const payloads = [];
  const reply = (_signal, payload) => {
    payloads.push(payload);
    return new Response(prelude + delta({ content: '{"answer":true}' }, 'stop')
      + sse({ choices: [], usage: { prompt_tokens: 13, completion_tokens: 6, total_tokens: 19, completion_tokens_details: { reasoning_tokens: 0 } } }) + done, { headers });
  };
  const { judge, rows, originals } = setup(t, [reply], { judgeReasoningOff: true });
  assert.deepEqual((await judge()).value, { answer: true });
  const [outbound] = payloads;
  assert.deepEqual(outbound.reasoning, { enabled: false });
  assert.equal(outbound.model, 'tencent/hy4-flash');
  assert.equal(outbound.max_tokens ?? outbound.max_completion_tokens, 65_536);
  assert.equal(outbound.provider.require_parameters, true);
  assert.deepEqual(outbound.response_format.json_schema.schema, schema);
  assert.equal(outbound.response_format.json_schema.strict, true);
  assert.deepEqual(originals[0].outbound.reasoning, outbound.reasoning);
  assert.deepEqual(originals[0].outbound.parameterNames, Object.keys(outbound).sort());
  const [row] = rows;
  assert.equal(row.policyVersion, 'e1-call-policy-v5-reasoning-off');
  assert.equal(row.timeoutMs, 180_000);
  assert.equal(row.reasoningLimit, null);
  assert.deepEqual([row.reasoningTokens, row.reportedOutputTokens, row.visibleTokens], [0, 6, 6]);
  assert.equal(row.phaseMs.firstReasoning, null);
  ordered(row.phaseMs.firstVisible, row.phaseMs.ended);
});

test('switching off must neither assume missing usage is zero nor suppress evidence of actual reasoning', async t => {
  const missing = () => new Response(delta({ content: '{"answer":true}' }, 'stop') + done, { headers });
  const { judge, rows, originals } = setup(t, [missing, success], { judgeReasoningOff: true });
  await judge();
  await judge();
  assert(originals.every(raw => raw.outbound.reasoning.enabled === false));
  assert.deepEqual(rows.map(row => row.reasoningTokens), [null, 31]);
  assert.equal(rows[0].phaseMs.firstReasoning, null);
  ordered(rows[1].phaseMs.firstReasoning, rows[1].phaseMs.firstVisible);
});

test('the normal judge policy still sends the existing numeric reasoning cap', async t => {
  const payloads = [];
  const { judge, rows } = setup(t, [(_signal, payload) => { payloads.push(payload); return success(); }]);
  await judge();
  assert.deepEqual(payloads[0].reasoning, { max_tokens: 16_384 });
  assert.equal(rows[0].policyVersion, 'e1-call-policy-v4');
  assert.equal(rows[0].reasoningLimit, 16_384);
});

test('Qwen requests pin Parasail FP8 and omit reasoning on every strict JSON attempt', async t => {
  const payloads = [];
  const qwen = (content, finish, report = false) => (_signal, payload) => {
    payloads.push(payload);
    return new Response(sse({ provider: 'Parasail', model: 'qwen/qwen3-235b-a22b-2507',
      choices: [{ index: 0, delta: { content }, finish_reason: finish }] })
      + (report ? sse({ choices: [], usage: { prompt_tokens: 13, completion_tokens: 6, total_tokens: 19,
        completion_tokens_details: { reasoning_tokens: 0 } } }) : '') + done, { headers });
  };
  const { judge, rows, originals } = setup(t, [qwen('{', 'length'), qwen(' ', 'stop'), qwen('{"answer":true} extra', 'stop'),
    qwen('{"answer":true}', 'stop', true)], { judgePolicy: 'qwen-parasail' });
  await assert.rejects(judge(), error => error.failure?.kind === 'judge_partial_failure' && error.failure.detail === 'invalid JSON document');
  assert.deepEqual((await judge()).value, { answer: true });
  assert.deepEqual(rows.map(row => row.failureKind), ['output_truncated', 'empty_unconfirmed', 'judge_partial_failure', null]);
  for (const payload of payloads) {
    assert.equal(payload.model, 'qwen/qwen3-235b-a22b-2507');
    assert.deepEqual(payload.provider, { only: ['parasail/fp8'], order: ['parasail/fp8'], allow_fallbacks: false, require_parameters: true });
    for (const forbidden of ['reasoning', 'reasoning_effort', 'include_reasoning', 'thinking', 'extra_body', 'models', 'route']) {
      assert.equal(Object.hasOwn(payload, forbidden), false);
    }
    assert.equal(payload.max_tokens ?? payload.max_completion_tokens, 8_192);
    assert.equal(payload.response_format.type, 'json_schema');
    assert.equal(payload.response_format.json_schema.strict, true);
    assert.deepEqual(payload.response_format.json_schema.schema, schema);
  }
  assert.deepEqual(originals.at(-1).outbound.provider, payloads.at(-1).provider);
  assert.equal(rows.at(-1).policyVersion, 'e1-call-policy-v6-qwen-parasail');
  assert.equal(rows.at(-1).reportedProvider, 'Parasail');
  assert.equal(rows.at(-1).reasoningTokens, 0);
  assert.equal(rows.at(-1).phaseMs.firstReasoning, null);
});

test('a response that names a different Qwen provider cannot publish a judgement', async t => {
  const other = () => new Response(sse({ provider: 'Venice', model: 'qwen/qwen3-235b-a22b-2507',
    choices: [{ index: 0, delta: { content: '{"answer":true}' }, finish_reason: 'stop' }] }) + done, { headers });
  const { judge, rows } = setup(t, [other], { judgePolicy: 'qwen-parasail' });
  await assert.rejects(judge(), error => error.failure?.kind === 'configuration' && error.failure.detail === 'response judge route mismatch');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reportedProvider, 'Venice');
});

test('Qwen fails closed for a mixed role, a text-only call, or a serialized routing override', async t => {
  assert.throws(() => new Models({ mode: 'offline', roles: ['judge', 'learner'], responses: [], judgePolicy: 'qwen-parasail' }),
    error => error.failure?.kind === 'configuration');
  const { judge, judgeWithoutSchema, events } = setup(t, [], { judgePolicy: 'qwen-parasail' });
  await assert.rejects(judgeWithoutSchema(), error => error.failure?.kind === 'configuration');
  const stringify = JSON.stringify;
  t.mock.method(JSON, 'stringify', (value, ...args) => stringify(
    value?.model === 'qwen/qwen3-235b-a22b-2507' && Array.isArray(value.messages)
      ? { ...value, provider: { ...value.provider, allow_fallbacks: true }, reasoning: { enabled: false } } : value, ...args));
  await assert.rejects(judge(), error => error.failure?.kind === 'configuration' && error.failure.detail === 'outbound judge budget or schema mismatch');
  assert.deepEqual(events, []);
});

test('the capped HY4 contrast sends thinking with a 32768 total cap and records reasoning exhaustion', async t => {
  const outgoing = [];
  const response = (content, finish, reasoningTokens, completionTokens) => (_signal, payload) => {
    outgoing.push(payload);
    const chunk = { provider: 'Tencent', model: 'tencent/hy4-flash', choices: [{ index: 0, delta: content, finish_reason: finish }] };
    return new Response(sse(chunk) + sse({ choices: [], usage: { prompt_tokens: 13, completion_tokens: completionTokens,
      total_tokens: completionTokens + 13, completion_tokens_details: { reasoning_tokens: reasoningTokens } } }) + done, { headers });
  };
  const { judge, rows, originals } = setup(t, [response({ reasoning_content: 'continuing' }, 'length', 32768, 32768),
    response({ content: '{"answer":true}' }, 'stop', 9, 15)], { judgePolicy: 'hy4-capped' });
  assert.deepEqual((await judge()).value, { answer: true });
  for (const body of outgoing) {
    assert.equal(body.model, 'tencent/hy4-flash');
    assert.deepEqual(body.reasoning, { max_tokens: 16_384 });
    assert.equal(body.max_tokens ?? body.max_completion_tokens, 32_768);
    assert.deepEqual(body.provider, { only: ['tencent/fp8'], order: ['tencent/fp8'], allow_fallbacks: false, require_parameters: true });
    assert.equal(body.response_format.json_schema.strict, true);
  }
  assert.equal(rows[0].policyVersion, 'e1-call-policy-v7-hy4-capped');
  assert.equal(rows[0].timeoutMs, 180_000);
  assert.equal(rows[0].failureKind, 'reasoning_exhausted_empty');
  assert.deepEqual([rows[0].reasoningTokens, rows[0].reportedOutputTokens, rows[0].phaseMs.firstVisible], [32_768, 32_768, null]);
  assert.ok(Number.isInteger(rows[0].phaseMs.firstReasoning));
  assert.deepEqual(originals[0].outbound.provider, outgoing[0].provider);
});

test('the off policy fails before transport outside structured, judge-only calls', async t => {
  assert.throws(() => new Models({ mode: 'offline', roles: ['judge', 'learner'], responses: [], judgeReasoningOff: true }),
    error => error.failure?.kind === 'configuration');
  const { judgeWithoutSchema, events } = setup(t, [success], { judgeReasoningOff: true });
  await assert.rejects(judgeWithoutSchema(), error => error.failure?.kind === 'configuration');
  assert.deepEqual(events, []);
});

test('the off request is not sent if the SDK serializes a conflicting reasoning control', async t => {
  const stringify = JSON.stringify;
  t.mock.method(JSON, 'stringify', (value, ...args) => stringify(
    value?.model === 'tencent/hy4-flash' && value.response_format?.type === 'json_schema' && Array.isArray(value.messages)
      ? { ...value, reasoning_effort: 'high' } : value, ...args));
  const { judge, events } = setup(t, [success], { judgeReasoningOff: true });
  await assert.rejects(judge(), error => error.failure?.kind === 'configuration');
  assert.deepEqual(events, []);
});
