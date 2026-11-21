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
