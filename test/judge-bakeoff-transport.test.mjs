import assert from 'node:assert/strict';
import test from 'node:test';
import { Models } from '../src/models.mjs';
import { judgeCandidates } from '../config/judge-contrast.mjs';
import { judgeModelMetadata, judgeModelMetadataVersion, splitJudgeCandidates } from '../config/judge-bakeoff.mjs';
import { make403Probe, probeSteps } from '../config/judge-bakeoff-probe.mjs';
import { matchesReportedRoute, retryFeedbackCode, retryFeedbackCodes, splitRetryPrompt } from '../src/judge-transport.mjs';

const schema = Object.freeze({
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: false,
});
const context = Object.freeze({
  systemPrompt: 'Base judge prompt.',
  messages: Object.freeze([{ role: 'user', content: '{}', timestamp: 1 }]),
});
const scope = Object.freeze({ role: 'judge', turn: 4, call: 1 });

function parseOutput(text) {
  const value = JSON.parse(text);
  assert.equal(value.ok, true, 'fake judge received an unexpected body');
  return value;
}

function openaiResponse({ provider = 'Google AI Studio', model = 'google/gemini-3.8-flash', content = '{"ok":true}', reasoningTokens = 0, finishReason = 'stop' } = {}) {
  const chunk = (choice, extra = {}) => `data: ${JSON.stringify({
    id: 'chatcmpl-fixture', ...(provider === null ? {} : { provider }), ...(model === null ? {} : { model }), choices: [choice], ...extra,
  })}\n\n`;
  return new Response([
    chunk({ index: 0, delta: { content }, finish_reason: null }),
    chunk({ index: 0, delta: {}, finish_reason: finishReason }),
    `data: ${JSON.stringify({ id: 'chatcmpl-fixture', choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, completion_tokens_details: { reasoning_tokens: reasoningTokens } } })}\n\n`,
    'data: [DONE]\n\n',
  ].join(''), { headers: { 'content-type': 'text/event-stream' } });
}

function rateLimited() {
  return new Response('{"error":{"message":"rate limited"}}', { status: 429, headers: { 'content-type': 'application/json' } });
}

function setup(t, key, responses) {
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'unit-test-credential';
  t.after(() => {
    if (prior === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prior;
  });
  const payloads = [], rows = [], originals = [];
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    const payload = JSON.parse(init.body);
    payloads.push(payload);
    assert.ok(responses.length, `unexpected transport call for ${payload.model}`);
    const next = responses.shift();
    return typeof next === 'function' ? next(payload) : next;
  });
  const models = new Models({
    mode: 'real', roles: ['judge'], judgePolicy: key,
    save: (raw, row, rateLimited) => { originals.push(raw); rows.push({ ...row, rateLimited }); return `attempt-${rows.length}.json`; },
  });
  return { models, payloads, rows, originals };
}

const candidates = [
  {
    key: 'haiku', id: 'anthropic/claude-haiku-5.5', endpoint: 'anthropic', maxTokens: 2048,
    reasoning: { effort: 'low' }, temperature: null, policyVersion: 'e1-call-policy-v8-bakeoff-haiku',
    reasoningBudget: 1536, response: () => openaiResponse({ provider: 'Anthropic', model: 'anthropic/claude-haiku-5.5' }),
  },
  {
    key: 'gemini', id: 'google/gemini-3.8-flash', endpoint: 'google-ai-studio', maxTokens: 4096,
    reasoning: { effort: 'low' }, temperature: 0, policyVersion: 'e1-call-policy-v9-bakeoff-gemini',
    reasoningBudget: 3072, response: openaiResponse,
  },
  {
    key: 'qwen', id: 'qwen/qwen3-235b-a22b-2507', endpoint: 'parasail/fp8', maxTokens: 8192,
    reasoning: null, temperature: 0, policyVersion: 'e1-call-policy-v10-bakeoff-qwen',
    reasoningBudget: 0, response: () => openaiResponse({ provider: 'Parasail', model: 'qwen/qwen3-235b-a22b-2507' }),
  },
];

test('the split judge config exports three pinned route-pinned candidates and keeps the old contrasts', () => {
  assert.equal(judgeModelMetadataVersion, 'judge-bakeoff-models-v1');
  assert.deepEqual(Object.keys(splitJudgeCandidates), ['haiku', 'gemini', 'qwen']);
  assert.deepEqual(Object.keys(judgeModelMetadata).sort(), candidates.map(c => c.id).sort());
  const versions = new Set();
  for (const spec of candidates) {
    const candidate = splitJudgeCandidates[spec.key];
    assert.equal(candidate.runId, `round2-bakeoff-${spec.key}-01`);
    assert.equal(candidate.route.id, spec.id);
    assert.equal(candidate.route.provider, 'openrouter');
    assert.deepEqual(candidate.route.routing, {
      only: [spec.endpoint], order: [spec.endpoint], allow_fallbacks: false, require_parameters: true,
    });
    assert.equal(candidate.policy.splitJudge, true);
    assert.equal(candidate.policy.version, spec.policyVersion);
    assert.equal(candidate.policy.timeoutMs, 120_000);
    assert.equal(candidate.policy.judge.timeoutMs, 120_000);
    assert.equal(candidate.policy.judge.maxTokens, spec.maxTokens);
    assert.equal(candidate.policy.judge.reasoningBudget, spec.reasoningBudget);
    assert.equal(candidate.policy.judge.reasoningMaxTokens, null);
    assert.equal(candidate.policy.judge.minVisibleTokens, spec.maxTokens - spec.reasoningBudget);
    versions.add(candidate.policy.version);
    const metadata = judgeModelMetadata[spec.id];
    assert.equal(metadata.id, spec.id);
    assert.equal(metadata.provider, 'openrouter');
    assert.equal(metadata.maxTokens, spec.maxTokens);
  }
  assert.equal(versions.size, 3);
  assert.equal(judgeCandidates['qwen-parasail'].policy.version, 'e1-call-policy-v6-qwen-parasail');
  assert.equal(judgeCandidates['hy4-capped'].policy.version, 'e1-call-policy-v7-hy4-capped');
});

for (const spec of candidates) {
  test(`${spec.key} sends the exact strict, route-pinned split judge payload and records redacted outbound fields`, async t => {
    const { models, payloads, rows, originals } = setup(t, spec.key, [spec.response]);
    assert.equal(models.usesStructuredJudgement('judge'), true);
    const result = await models.complete(scope, context, parseOutput, schema);
    assert.deepEqual(result.value, { ok: true });
    assert.equal(payloads.length, 1);
    const [payload] = payloads;
    assert.equal(payload.model, spec.id);
    const cap = payload.max_tokens ?? payload.max_completion_tokens;
    assert.equal(cap, spec.maxTokens);
    assert.deepEqual(payload.provider, {
      only: [spec.endpoint], order: [spec.endpoint], allow_fallbacks: false, require_parameters: true,
    });
    assert.equal(payload.response_format.type, 'json_schema');
    assert.equal(payload.response_format.json_schema.strict, true);
    assert.deepEqual(payload.response_format.json_schema.schema, schema);
    if (spec.reasoning) assert.deepEqual(payload.reasoning, spec.reasoning);
    else assert.equal(Object.hasOwn(payload, 'reasoning'), false);
    assert.equal(Object.hasOwn(payload, 'temperature'), spec.temperature !== null);
    if (spec.temperature !== null) assert.equal(payload.temperature, spec.temperature);
    for (const forbidden of ['models', 'route', 'reasoning_effort', 'include_reasoning', 'thinking', 'extra_body']) {
      assert.equal(Object.hasOwn(payload, forbidden), false);
    }
    const outbound = originals[0].outbound;
    assert.equal(outbound.model, spec.id);
    assert.equal(outbound.max_tokens ?? outbound.max_completion_tokens, spec.maxTokens);
    assert.deepEqual(outbound.reasoning, spec.reasoning ?? undefined);
    assert.deepEqual(outbound.provider, payload.provider);
    assert.deepEqual(outbound.parameterNames, Object.keys(payload).sort());
    assert.equal(outbound.messages, '[redacted]');
    assert.equal(outbound.response_format.json_schema.schema, '[redacted]');
    assert.equal(Object.hasOwn(outbound, 'temperature'), spec.temperature !== null);
    if (spec.temperature !== null) assert.equal(outbound.temperature, spec.temperature);
    assert.doesNotMatch(JSON.stringify(originals[0]), /unit-test-credential/);
    const [row] = rows;
    assert.equal(row.policyVersion, spec.policyVersion);
    assert.equal(row.timeoutMs, 120_000);
    assert.equal(row.retryCount, 0);
    assert.equal(row.validationCode, null);
    assert.equal(row.retryFeedback, null);
    assert.deepEqual(row.normalizations, []);
    assert.equal(row.normalized, false);
    assert.deepEqual(row.originalOrder, []);
    assert.equal(row.reasoningLimit, null);
    await assert.rejects(models.complete(scope, context, parseOutput),
      error => error.failure?.kind === 'configuration' && error.failure.detail === 'judge policy requires a structured OpenRouter judgement');
  });
}

test('the faux provider never claims structured judgement and the real split config stays judge-only', async () => {
  const faux = new Models({ mode: 'offline', roles: ['judge'], responses: [] });
  assert.equal(faux.usesStructuredJudgement('judge'), false);
  assert.throws(() => new Models({ mode: 'offline', roles: ['judge', 'learner'], responses: [], judgePolicy: 'haiku' }),
    error => error.failure?.kind === 'configuration');
  assert.throws(() => new Models({ mode: 'offline', roles: ['judge'], responses: [], judgePolicy: 'haiku', judgeTimeoutMs: 120_000 }),
    error => error.failure?.kind === 'configuration');
});

test('Gemini accepts both reported display forms and rejects every other reported provider', () => {
  const route = splitJudgeCandidates.gemini.route;
  assert.equal(matchesReportedRoute(route, 'Google AI Studio', 'google/gemini-3.8-flash'), true);
  assert.equal(matchesReportedRoute(route, 'google-ai-studio', 'google/gemini-3.8-flash'), true);
  assert.equal(matchesReportedRoute(route, 'Google Vertex AI', 'google/gemini-3.8-flash'), false);
  assert.equal(matchesReportedRoute(route, 'Google AI Studio', 'google/gemini-3.7-flash'), false);
  assert.equal(matchesReportedRoute(route, 'Google AI Studio', 'google/gemini-3.8-flash-20260101'), false);
  assert.equal(matchesReportedRoute(route, null, null), true);
});

test('a reported provider mismatch is a hard failure while absent route metadata is audited without rejection', async t => {
  const wrong = setup(t, 'gemini', [() => openaiResponse({ provider: 'Google Vertex AI' })]);
  await assert.rejects(wrong.models.complete(scope, context, parseOutput, schema),
    error => error.failure?.kind === 'configuration' && error.failure.detail === 'response judge route mismatch');
  assert.equal(wrong.rows.length, 1);
  assert.equal(wrong.rows[0].reportedProvider, 'Google Vertex AI');

  const display = setup(t, 'gemini', [() => openaiResponse({ provider: 'Google AI Studio' })]);
  assert.deepEqual((await display.models.complete(scope, context, parseOutput, schema)).value, { ok: true });
  assert.equal(display.rows[0].reportedProvider, 'Google AI Studio');

  const absent = setup(t, 'gemini', [() => openaiResponse({ provider: null, model: null })]);
  assert.deepEqual((await absent.models.complete(scope, context, parseOutput, schema)).value, { ok: true });
  assert.equal(absent.rows[0].reportedProvider, null);
  assert.equal(absent.rows[0].reportedModel, null);
});

test('a Haiku response that names a different model cannot publish a judgement', async t => {
  const { models, rows } = setup(t, 'haiku', [() => openaiResponse({ provider: 'Anthropic', model: 'anthropic/claude-haiku-4.5' })]);
  await assert.rejects(models.complete(scope, context, parseOutput, schema),
    error => error.failure?.kind === 'configuration' && error.failure.detail === 'response judge route mismatch');
  assert.equal(rows[0].reportedModel, 'anthropic/claude-haiku-4.5');
});

test('split retry feedback is whitelisted and never interpolates the parser error', async t => {
  const leaky = text => {
    if (!JSON.parse(text).ok) throw Object.assign(new Error('secret answer: score 2 at #7'), { retryFeedback: 'evidence' });
    return { ok: true };
  };
  const { models, rows, originals } = setup(t, 'gemini', [
    () => openaiResponse({ content: '{"ok":false}' }),
    () => openaiResponse({ content: '{"ok":true}' }),
  ]);
  assert.deepEqual((await models.complete(scope, context, leaky, schema)).value, { ok: true });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].failureKind, 'judge_partial_failure');
  assert.equal(rows[0].validationCode, 'evidence');
  assert.equal(rows[0].retryFeedback, null);
  assert.equal(rows[0].retryCount, 0);
  assert.equal(rows[1].validationCode, null);
  assert.equal(rows[1].retryFeedback, 'evidence');
  assert.equal(rows[1].retryCount, 1);
  assert.equal(originals[0].context.systemPrompt, 'Base judge prompt.');
  assert.match(originals[0].validationDetail, /secret answer: score 2 at #7/);
  assert.equal(originals[1].context.systemPrompt, splitRetryPrompt('Base judge prompt.', 'evidence'));
  assert.doesNotMatch(originals[1].context.systemPrompt, /secret answer|score 2|#7/);
});

test('syntax errors map to structure and unknown parser codes map to the generic prompt', async t => {
  const syntax = setup(t, 'gemini', [
    () => openaiResponse({ content: '{"ok":' }),
    () => openaiResponse({ content: '{"ok":true}' }),
  ]);
  assert.deepEqual((await syntax.models.complete(scope, context, parseOutput, schema)).value, { ok: true });
  assert.equal(syntax.rows[0].validationCode, 'structure');
  assert.equal(syntax.rows[1].retryFeedback, 'structure');
  assert.equal(syntax.originals[1].context.systemPrompt, splitRetryPrompt('Base judge prompt.', 'structure'));

  const unknown = setup(t, 'gemini', [
    () => openaiResponse({ content: '{"ok":true}' }),
    () => openaiResponse({ content: '{"ok":true}' }),
  ]);
  const leaky = text => {
    if (unknown.rows.length === 0) throw new Error('secret answer: yes');
    return { ok: true };
  };
  assert.deepEqual((await unknown.models.complete(scope, context, leaky, schema)).value, { ok: true });
  assert.equal(unknown.rows[0].validationCode, 'generic');
  assert.equal(unknown.rows[1].retryFeedback, 'generic');
  assert.match(unknown.originals[1].context.systemPrompt, /failed local validation/);
  assert.doesNotMatch(unknown.originals[1].context.systemPrompt, /secret answer|yes/);
});

test('a plain JSON termination error maps to the generic retry category', async t => {
  const { models, rows, originals } = setup(t, 'gemini', [
    () => openaiResponse({ content: '{"ok":true}', finishReason: 'tool_calls' }),
    () => openaiResponse({ content: '{"ok":true}' }),
  ]);
  assert.deepEqual((await models.complete(scope, context, parseOutput, schema)).value, { ok: true });
  assert.equal(rows[0].failureKind, 'judge_partial_failure');
  assert.equal(rows[0].validationCode, 'generic');
  assert.match(originals[0].validationDetail, /JSON generation did not terminate normally/);
  assert.equal(rows[1].retryFeedback, 'generic');
  assert.match(originals[1].context.systemPrompt, /failed local validation/);
});

test('non-2xx body and diagnostic headers are saved to each attempt after redaction', async t => {
  const body = JSON.stringify({ error: { message: 'Bearer body-secret-123 rejected' }, metadata: {
    provider_name: 'Anthropic', raw: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz', api_key: 'metadata-secret',
  } });
  const response = () => new Response(body, { status: 403, headers: {
    'content-type': 'application/json',
    'x-openrouter-error': 'provider unavailable',
    'x-openrouter-request-id': 'req-403',
    'x-openrouter-api-key': 'header-secret',
    authorization: 'Bearer header-secret',
    'set-cookie': 'session=secret',
  } });
  const { models, originals, rows } = setup(t, 'haiku', [response, response, response]);
  await assert.rejects(models.complete(scope, context, parseOutput, schema),
    error => error.failure?.kind === 'provider_failure' && error.failure.attempt === 3);
  assert.equal(originals.length, 3);
  for (const raw of originals) {
    assert.deepEqual(raw.providerResponse, {
      status: 403,
      headers: {
        'content-type': 'application/json',
        'x-openrouter-error': 'provider unavailable',
        'x-openrouter-request-id': 'req-403',
      },
      body: JSON.stringify({ error: { message: 'Bearer [REDACTED] rejected' }, metadata: {
        provider_name: 'Anthropic', raw: '[REDACTED]', api_key: '[REDACTED]',
      } }),
      bodyTruncated: false,
    });
    assert.doesNotMatch(JSON.stringify(raw), /body-secret|abcdefghijklmnopqrstuvwxyz|metadata-secret|header-secret|session=secret/);
  }
  assert.ok(rows.every(row => row.httpStatus === 403 && row.usage === null));
});

test('Models sends only the preregistered A-D changes with one 64-token attempt per step', async t => {
  for (const [key, provider] of [['haiku', 'Amazon Bedrock'], ['gemini', 'Google AI Studio']]) {
    for (const step of probeSteps) {
      const prior = process.env.OPENROUTER_API_KEY;
      process.env.OPENROUTER_API_KEY = 'unit-test-credential';
      t.after(() => {
        if (prior === undefined) delete process.env.OPENROUTER_API_KEY;
        else process.env.OPENROUTER_API_KEY = prior;
      });
      const payloads = [], originals = [], rows = [];
      const spec = make403Probe(key, step);
      t.mock.method(globalThis, 'fetch', async (_input, init) => {
        const payload = JSON.parse(init.body);
        payloads.push(payload);
        return openaiResponse({ provider: step === 'D' ? provider : (key === 'haiku' ? 'Anthropic' : 'Google AI Studio'),
          model: spec.route.id });
      });
      const models = new Models({ mode: 'real', roles: ['judge'], judgePolicy: key, judgeProbeStep: step,
        save: (raw, row) => { originals.push(raw); rows.push(row); return `probe-${key}-${step}.json`; } });
      const requestSchema = ['A', 'B'].includes(step) ? schema : undefined;
      const result = await models.complete({ role: 'judge', turn: 1, call: 1, binding: { probeStep: step } }, context, parseOutput, requestSchema);
      assert.deepEqual(result.value, { ok: true });
      assert.equal(payloads.length, 1);
      const [payload] = payloads;
      const capField = step === 'A' ? 'max_completion_tokens' : 'max_tokens';
      assert.equal(payload[capField], 64);
      assert.equal(Object.hasOwn(payload, capField === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'), false);
      assert.deepEqual(payload.reasoning, { effort: 'low' });
      if (key === 'haiku') assert.equal(Object.hasOwn(payload, 'temperature'), false);
      else assert.equal(payload.temperature, 0);
      assert.equal(payload.response_format?.type, ['A', 'B'].includes(step) ? 'json_schema' : undefined);
      assert.equal(payload.response_format?.json_schema?.strict, ['A', 'B'].includes(step) ? true : undefined);
      assert.equal(payload.provider.only?.[0], ['A', 'B', 'C'].includes(step) ? spec.route.routing.only?.[0] : undefined);
      assert.equal(payload.provider.require_parameters, ['A', 'B'].includes(step));
      assert.equal(payload.provider.allow_fallbacks, false);
      if (step === 'D') assert.equal(Object.hasOwn(payload.provider, 'order'), false);
      assert.equal(rows[0].requestLimit, 64);
      assert.equal(rows[0].attempt, 1);
      assert.equal(rows[0].retryCount, 0);
      assert.equal(originals[0].outbound.max_tokens ?? originals[0].outbound.max_completion_tokens, 64);
      assert.equal(originals[0].binding.probeStep, step);
    }
  }
});

test('split retry prompts are stable, distinct and free of truth directions or answer examples', () => {
  assert.equal(retryFeedbackCode(Object.assign(new Error('x'), { retryFeedback: 'window' })), 'window');
  assert.equal(retryFeedbackCode(new SyntaxError('x')), 'structure');
  assert.equal(retryFeedbackCode(new Error('x')), 'generic');
  assert.equal(retryFeedbackCode(Object.assign(new Error('x'), { retryFeedback: 'bogus' })), 'generic');
  assert.equal(splitRetryPrompt('base', null), 'base');
  assert.equal(splitRetryPrompt('base', undefined), 'base');
  const prompts = retryFeedbackCodes.map(code => splitRetryPrompt('base', code));
  assert.equal(new Set(prompts).size, retryFeedbackCodes.length);
  const categories = [/JSON structure rule/, /evidence binding rule/, /chronological order rule/, /dependency rule/, /observation-window rule/];
  for (const [i, prompt] of prompts.entries()) {
    assert.match(prompt, /^base\n/);
    assert.match(prompt, categories[i]);
    assert.doesNotMatch(prompt, /\b(score|answer|yes|no|correct|wrong)\b/i);
    assert.doesNotMatch(prompt, /\b(reorder|cite|claim|support|instead)\b/i);
  }
  const generic = splitRetryPrompt('base', 'not-a-code');
  assert.match(generic, /failed local validation/);
  assert.doesNotMatch(generic, /not-a-code/);
});

test('429 consumes a split attempt, is still marked rate limited, and never opens a fourth try', async t => {
  const recovered = setup(t, 'gemini', [rateLimited, rateLimited, () => openaiResponse()]);
  assert.deepEqual((await recovered.models.complete(scope, context, parseOutput, schema)).value, { ok: true });
  assert.deepEqual(recovered.rows.map(row => row.rateLimited), [true, true, false]);
  assert.deepEqual(recovered.rows.map(row => row.retryCount), [0, 1, 2]);
  assert.deepEqual(recovered.rows.map(row => row.attempt), [1, 2, 3]);
  assert.equal(recovered.payloads.length, 3);

  const exhausted = setup(t, 'gemini', [rateLimited, rateLimited, rateLimited]);
  await assert.rejects(exhausted.models.complete(scope, context, parseOutput, schema),
    error => error.failure?.kind === 'provider_failure' && error.failure.attempt === 3);
  assert.equal(exhausted.payloads.length, 3);
});

test('recovery resumes attempt numbering at nextAttempt and a third attempt has no fourth try', async t => {
  const resumed = setup(t, 'gemini', [rateLimited, () => openaiResponse()]);
  const resumedScope = { ...scope, nextAttempt: 2 };
  assert.deepEqual((await resumed.models.complete(resumedScope, context, parseOutput, schema)).value, { ok: true });
  assert.deepEqual(resumed.rows.map(row => row.attempt), [2, 3]);
  assert.deepEqual(resumed.rows.map(row => row.retryCount), [1, 2]);
  assert.deepEqual(resumed.rows.map(row => row.rateLimited), [true, false]);

  const last = setup(t, 'gemini', [rateLimited]);
  const lastScope = { ...scope, nextAttempt: 3, retryFeedback: 'window' };
  await assert.rejects(last.models.complete(lastScope, context, parseOutput, schema),
    error => error.failure?.kind === 'provider_failure' && error.failure.attempt === 3);
  assert.equal(last.payloads.length, 1);
  assert.equal(last.rows[0].attempt, 3);
  assert.equal(last.rows[0].retryCount, 2);
  assert.equal(last.rows[0].retryFeedback, 'window');
  assert.equal(last.originals[0].context.systemPrompt, splitRetryPrompt('Base judge prompt.', 'window'));
});

test('a non-contract failure resets split feedback so the next attempt sees only the immediately previous failure', async t => {
  const parser = text => {
    if (!JSON.parse(text).ok) throw Object.assign(new Error('secret evidence detail'), { retryFeedback: 'evidence' });
    return { ok: true };
  };
  const { models, rows, originals } = setup(t, 'gemini', [
    () => openaiResponse({ content: '{"ok":false}' }),
    rateLimited,
    () => openaiResponse({ content: '{"ok":true}' }),
  ]);
  assert.deepEqual((await models.complete(scope, context, parser, schema)).value, { ok: true });
  assert.equal(rows[0].validationCode, 'evidence');
  assert.equal(rows[1].failureKind, 'provider_failure');
  assert.equal(rows[1].validationCode, null);
  assert.equal(rows[1].retryFeedback, 'evidence');
  assert.equal(rows[2].retryFeedback, null);
  assert.equal(originals[2].context.systemPrompt, 'Base judge prompt.');
});

test('an invalid or non-split retry scope fails before transport', async t => {
  const invalid = setup(t, 'gemini', []);
  for (const bad of [{ nextAttempt: 0 }, { nextAttempt: 4 }, { nextAttempt: 1.5 }, { retryFeedback: 'bogus' }]) {
    await assert.rejects(invalid.models.complete({ ...scope, ...bad }, context, parseOutput, schema),
      error => error.failure?.kind === 'configuration');
  }
  assert.equal(invalid.payloads.length, 0);
  const faux = new Models({ mode: 'offline', roles: ['judge'], responses: [] });
  await assert.rejects(faux.complete({ ...scope, nextAttempt: 2 }, context, parseOutput),
    error => error.failure?.kind === 'configuration');
});

test('a recovered generic validation code is accepted as retry feedback', async t => {
  const { models, rows, originals } = setup(t, 'gemini', [() => openaiResponse()]);
  assert.deepEqual((await models.complete({ ...scope, nextAttempt: 2, retryFeedback: 'generic' }, context, parseOutput, schema)).value, { ok: true });
  assert.equal(rows[0].retryFeedback, 'generic');
  assert.match(originals[0].context.systemPrompt, /failed local validation/);
});

test('a successful split parse stores normalized evidence on the raw attempt and meter', async t => {
  const normalized = [{ field: 'reason', from: [2, 1], to: [1, 2] }];
  const parser = text => ({ ...JSON.parse(text), normalized });
  const { models, rows, originals } = setup(t, 'gemini', [() => openaiResponse()]);
  await models.complete(scope, context, parser, schema);
  assert.deepEqual(originals[0].normalized, normalized);
  assert.deepEqual(rows[0].normalizations, normalized);
  assert.equal(rows[0].normalized, false);
  assert.deepEqual(rows[0].originalOrder, []);
});
