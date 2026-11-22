import assert from 'node:assert/strict';
import test from 'node:test';
import { fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { ProxyAgent } from 'undici';
import { Models, stopFailure } from '../src/models.mjs';
import { fidelityAuditPrompt, fidelityAuditSchema, parseFidelityEvidence } from '../contracts/learner/fidelity.mjs';
import { hash } from '../contracts/core/schema.mjs';
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

test('learner thinking independently changes the sent and recorded DeepSeek thinking bit', async t => {
  const before = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'learner-thinking-canary';
  t.after(() => {
    if (before === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = before;
  });
  const sent = [], saved = [];
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    sent.push(JSON.parse(init.body));
    const chunk = { choices: [{ index: 0, delta: { content: '{"text":"I tried a step."}' }, finish_reason: 'stop' }] };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const config = { mode: 'real', roles: ['learner'], learnerJsonMode: true, save: raw => saved.push(raw) };
  for (const learnerThinking of ['low', 'off']) {
    const model = new Models({ ...config, learnerThinking });
    const { value } = await model.complete({ role: 'learner', turn: 4, call: 1 }, {
      systemPrompt: 'Try the next step.', messages: [{ role: 'user', timestamp: 1, content: 'Keep going.' }],
    }, parseLearner);
    assert.equal(value.text, 'I tried a step.');
  }
  assert.deepEqual(sent.map(body => body.thinking), [{ type: 'enabled' }, { type: 'disabled' }]);
  assert.deepEqual(saved.map(raw => raw.outbound.thinking), sent.map(body => body.thinking));
  const { reasoning_effort, ...sameRequest } = sent[0];
  assert.equal(reasoning_effort, 'low');
  assert.deepEqual(saved.map(raw => raw.outbound.reasoning_effort), ['low', undefined]);
  assert.deepEqual(sent[1], { ...sameRequest, thinking: { type: 'disabled' } });
  for (const bad of [{ learnerThinking: 'invalid' }, { learnerThinking: null }, { learnerJsonMode: false, learnerThinking: 'off' }]) {
    assert.throws(() => new Models({ ...config, ...bad }), error => error.failure?.kind === 'configuration');
  }
  assert.equal(sent.length, 2);
});

test('learner JSON mode sends a JSON object request and records the outbound format', async t => {
  const key = 'learner-credential-canary';
  const before = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = key;
  t.after(() => {
    if (before === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = before;
  });
  const payloads = [], attempts = [];
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    payloads.push(JSON.parse(init.body));
    const chunk = { id: 'learner-transport-fixture', provider: 'DeepSeek', choices: [{ index: 0,
      delta: { content: '{"text":"I am trying the first step."}' }, finish_reason: 'stop' }] };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  });
  const models = new Models({ mode: 'real', roles: ['learner'], learnerJsonMode: true, recorder: { append() {} },
    save: (raw, row) => attempts.push({ raw, row }) });
  const prompt = 'Return one JSON object with exactly one key, "text".';
  const result = await models.complete({ role: 'learner', turn: 4, call: 1 }, {
    systemPrompt: prompt, messages: [{ role: 'user', timestamp: 1, content: 'Reply to the tutor.' }],
  }, parseLearner);
  assert.deepEqual(result.value, { text: 'I am trying the first step.' });
  assert.match(payloads[0].messages[0].content, /Example JSON output: \{"text":"<learner utterance>"\}/);
  assert.equal(payloads[0].response_format.type, 'json_object');
  assert.deepEqual(attempts[0].raw.outbound.response_format, { type: 'json_object' });
  assert.doesNotMatch(JSON.stringify(attempts), /learner-credential-canary/);
});

test('learner cleanup extracts one fenced object and records surrounding-text cleanup', async () => {
  const source = 'Answer follows:\n```json\n{"text":"I need to check one step."}\n```\nThat is my reply.';
  const saved = [];
  const envelope = fauxAssistantMessage([fauxText(source)]);
  const models = new Models({ mode: 'offline', learnerJsonMode: true, responses: [envelope, envelope, envelope], save: (raw, row) => saved.push({ raw, row }) });
  const result = await models.complete({ role: 'learner', turn: 4, call: 1 }, {
    systemPrompt: 'Return one JSON object with one text field.', messages: [{ role: 'user', content: 'Try.' }],
  }, parseLearner);
  assert.deepEqual(result.value, { text: 'I need to check one step.' });
  const kinds = saved[0].raw.formatCleanups.map(cleanup => cleanup.kind);
  assert.ok(kinds.includes('code_fence'));
  assert.ok(kinds.includes('leading_text'));
  assert.ok(kinds.includes('trailing_text'));
});

test('learner cleanup repairs only invalid JSON backslashes and preserves LaTeX text exactly', async () => {
  const source = String.raw`{"text":"The exact value is \sqrt{2}."}`;
  const saved = [];
  const envelope = fauxAssistantMessage([fauxText(source)]);
  const models = new Models({ mode: 'offline', learnerJsonMode: true, responses: [envelope, envelope, envelope],
    save: (raw, row) => saved.push({ raw, row }) });
  const result = await models.complete({ role: 'learner', turn: 4, call: 1 }, {
    systemPrompt: 'Return one JSON object with one text field.', messages: [{ role: 'user', content: 'Try.' }],
  }, parseLearner);
  assert.equal(result.value.text, String.raw`The exact value is \sqrt{2}.`);
  assert.deepEqual(saved[0].raw.formatCleanups.map(cleanup => cleanup.kind), ['unescaped_backslash']);
});

test('learner cleanup rejects valid JSON control escapes that are ambiguous LaTeX commands', async () => {
  const source = String.raw`{"text":"The exact expression is \frac{1}{2}."}`;
  const saved = [];
  const envelope = fauxAssistantMessage([fauxText(source)]);
  const models = new Models({ mode: 'offline', learnerJsonMode: true, responses: [envelope, envelope, envelope],
    save: (raw, row) => saved.push({ raw, row }) });
  await assert.rejects(models.complete({ role: 'learner', turn: 4, call: 1 }, {
    systemPrompt: 'Return one JSON object with one text field.', messages: [{ role: 'user', content: 'Try.' }],
  }, parseLearner), error => error.failure?.kind === 'simulator_generation_contract' && error.failure.attempt === 3
    && error.failure.detail === 'ambiguous JSON control escape');
  assert.equal(saved.every(({ raw }) => raw.formatCleanups.length === 0), true);
});

test('bare learner prose remains a contract failure rather than being wrapped as JSON', async () => {
  const saved = [];
  const source = 'I think the answer is correct because it looks familiar.';
  const envelope = fauxAssistantMessage([fauxText(source)]);
  const models = new Models({ mode: 'offline', learnerJsonMode: true, responses: [envelope, envelope, envelope], save: (raw, row) => saved.push({ raw, row }) });
  await assert.rejects(models.complete({ role: 'learner', turn: 4, call: 1 }, {
    systemPrompt: 'Return one JSON object with one text field.', messages: [{ role: 'user', content: 'Try.' }],
  }, parseLearner), error => error.failure?.kind === 'simulator_generation_contract' && error.failure.attempt === 3);
  assert.equal(saved.every(({ raw }) => raw.formatCleanups === undefined || raw.formatCleanups.length === 0), true);
});

test('bounded learner JSON rejects ambiguous wrappers, duplicate fields and broken string syntax', async () => {
  const ambiguous = ['[{"text":"inside an array"}]', '{"text":"first","text":"second"}',
    '{"text":"one"} {"text":"two"}', '```json\n{"text":"unclosed fence"}',
    '{"text":"unfinished', String.raw`{"text":"broken Unicode \u12"}`];
  for (const body of ambiguous) {
    const envelope = fauxAssistantMessage([fauxText(body)]);
    const models = new Models({ mode: 'offline', learnerJsonMode: true, responses: [envelope, envelope, envelope], save: () => 'attempt.json' });
    await assert.rejects(models.complete({ role: 'learner', turn: 4, call: 1 }, {
      systemPrompt: 'Return one JSON object.', messages: [{ role: 'user', timestamp: 1, content: 'Try.' }],
    }, parseLearner), { message: /invalid JSON|expected a nonempty learner text/ }, body);
  }
});

test('learner format repair preserves existing JSON escapes alongside the original malformed LaTeX', async () => {
  const body = String.raw`{"text":"  I can write \(S(z)\). \"Yes\". \\frac{1}{2} and \u03c0.  "}`;
  const expected = '  I can write \\(S(z)\\). "Yes". \\frac{1}{2} and π.  ';
  const envelope = fauxAssistantMessage([fauxText(body)]), saved = [];
  const models = new Models({ mode: 'offline', learnerJsonMode: true, responses: [envelope, envelope, envelope],
    save: (raw, row) => saved.push({ raw, row }) });
  const result = await models.complete({ role: 'learner', turn: 4, call: 1 }, {
    systemPrompt: 'Return one JSON object.', messages: [{ role: 'user', timestamp: 1, content: 'Try.' }],
  }, parseLearner);
  assert.equal(result.value.text, expected);
  assert.deepEqual(saved[0].raw.formatCleanups, ['\\(', '\\)'].map(value => ({ kind: 'unescaped_backslash', offset: body.indexOf(value) })));
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

function realAudit(t, respond, config = {}) {
  const key = 'audit-credential-canary';
  const before = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = key;
  t.after(() => {
    if (before === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = before;
  });
  const payloads = [], attempts = [], dispatchers = [];
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    payloads.push(JSON.parse(init.body));
    dispatchers.push(init.dispatcher);
    return respond(key);
  });
  const models = new Models({ mode: 'real', roles: ['fidelity_audit'], ...config, save: (raw, row) => attempts.push({ raw, row }) });
  return { payloads, attempts, dispatchers, call: parse => models.complete({ role: 'fidelity_audit', turn: 4, call: 1 },
    { systemPrompt: fidelityAuditPrompt, messages: [{ role: 'user', timestamp: 1, content: 'Review the sample.' }] }, parse) };
}

test('real audit sends a pinned non-reasoning strict JSON request and still binds the quotes locally', async t => {
  const sample = { sample: 'A', messages: [{ n: 8, text: 'Try a step.' }, { n: 9, text: 'I need a hint.' }] };
  const row = { sample: 'A', stance: 'exposed-gap', stepPerformed: false, correctionWithBasis: false, unexplainedClaim: '', privateLeak: false,
    teacher: { n: 8, quote: 'Try a step' }, learner: { n: 9, quote: 'need a hint' }, reason: 'A gap is visible.' };
  const chunk = content => ({ id: 'transport-fixture', provider: 'Parasail', choices: [{ index: 0, delta: { content }, finish_reason: 'stop' }] });
  const { call, payloads, attempts } = realAudit(t, () => new Response(`data: ${JSON.stringify(chunk(JSON.stringify({ observations: [row] })))}\n\ndata: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } }));
  const { stepPerformed, correctionWithBasis, unexplainedClaim, ...labels } = row;
  assert.deepEqual((await call(text => parseFidelityEvidence(text, [sample]))).value, [{ ...labels, progress: 'none', unsupported: false }]);
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

const geminiAudit = { fidelityAuditPolicy: 'gemini', fidelityProxySource: 'HTTPS_PROXY' };
function auditProxy(t, value) {
  const names = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NODE_TLS_REJECT_UNAUTHORIZED'];
  const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  if (value) process.env.HTTPS_PROXY = value;
  t.after(() => {
    for (const [name, previous] of Object.entries(old)) {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
  });
}

const auditSample = { sample: 'A', messages: [{ n: 8, text: 'Try one subtraction.' }, { n: 9, text: 'I used 12 - 7.' }] };
const auditDocument = JSON.stringify({ observations: [{ sample: 'A', stance: 'other', stepPerformed: true, correctionWithBasis: false,
  unexplainedClaim: '', privateLeak: false, teacher: { n: 8, quote: 'one subtraction' }, learner: { n: 9, quote: '12 - 7' }, reason: 'The learner subtracts.' }] });
const parseAudit = text => parseFidelityEvidence(text, [auditSample]);
const geminiStream = (content, finish_reason = 'stop', provider = 'Google AI Studio') => new Response(
  `data: ${JSON.stringify({ id: 'fixture', model: 'google/gemini-3.8-flash', provider, choices: [{ index: 0, delta: { content }, finish_reason }] })}\n\ndata: [DONE]\n\n`,
  { headers: { 'content-type': 'text/event-stream' } });

test('Gemini fidelity audit sends the winning pinned, proxied, strict request and unchanged v2 prompt', async t => {
  auditProxy(t, 'http://audit-user:audit-pass@127.0.0.1:9');
  const { call, payloads, attempts, dispatchers } = realAudit(t, () => geminiStream(auditDocument), geminiAudit);
  assert.equal((await call(parseAudit)).value[0].progress, 'attempt');
  assert.equal(payloads.length, 1);
  const [body] = payloads;
  assert.equal(body.model, 'google/gemini-3.8-flash');
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens ?? body.max_completion_tokens, 4096);
  assert.deepEqual(body.provider, { only: ['google-ai-studio'], order: ['google-ai-studio'], require_parameters: true, allow_fallbacks: false });
  assert.deepEqual(body.response_format, { type: 'json_schema', json_schema: { name: 'teacharena_fidelity', strict: true, schema: fidelityAuditSchema } });
  assert.equal(hash(body.messages[0].content), 'c7823a99e324ba5e03b303833b9f9590d3c5be357bc4f9b7b85a0168eef93af0');
  assert.ok(dispatchers[0] instanceof ProxyAgent);
  assert.equal(attempts[0].row.proxySource, 'HTTPS_PROXY');
  assert.equal(attempts[0].row.auditMode, 'json_schema');
  assert.equal(attempts[0].row.auditUpstream, 'Google AI Studio');
  assert.equal(attempts[0].row.timeoutMs, 120_000);
  assert.doesNotMatch(JSON.stringify(attempts), /audit-user|audit-pass|audit-credential-canary|127\.0\.0\.1:9/);
});

test('Gemini fidelity audit refuses missing proxy opt-in or configuration before sending', t => {
  auditProxy(t);
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'audit-opt-in-test';
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  });
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('unexpected network'); });
  for (const config of [{ fidelityAuditPolicy: 'gemini' }, geminiAudit, { ...geminiAudit, fidelityProxySource: null },
    { fidelityProxySource: 'HTTPS_PROXY' }, { fidelityAuditPolicy: 'unknown' }, { fidelityAuditPolicy: null }]) {
    assert.throws(() => new Models({ mode: 'real', roles: ['fidelity_audit'], ...config, save() {} }),
      error => error.failure?.kind === 'configuration' && /proxy|policy/.test(error.message));
  }
  assert.equal(requests, 0);
});

test('Gemini fidelity audit does not retry through a route different from its pin', async t => {
  auditProxy(t, 'http://127.0.0.1:9');
  const { call, payloads, attempts } = realAudit(t, () => geminiStream(auditDocument, 'stop', 'Unexpected Provider'), geminiAudit);
  await assert.rejects(call(parseAudit), error => error.failure?.kind === 'configuration' && error.failure.attempt === 1);
  assert.equal(payloads.length, 1);
  assert.equal(attempts[0].row.failureKind, 'configuration');
});

test('Gemini fidelity audit records truncation, empty body and trailing text without a fourth attempt', async t => {
  auditProxy(t, 'http://127.0.0.1:9');
  const responses = [geminiStream('{"observations":', 'length'), geminiStream(''), geminiStream(`${auditDocument}\nextra`)];
  const { call, payloads, attempts } = realAudit(t, () => responses.shift(), geminiAudit);
  await assert.rejects(call(parseAudit), error => error.failure?.kind === 'fidelity_audit_contract' && error.failure.attempt === 3);
  assert.equal(payloads.length, 3);
  assert.ok(payloads.every(body => body.messages[0].content === fidelityAuditPrompt));
  assert.deepEqual(attempts.map(({ row }) => row.failureKind), ['output_truncated', 'empty_unconfirmed', 'fidelity_audit_contract']);
});
