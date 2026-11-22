import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { ProxyAgent } from 'undici';
import { Models } from '../src/models.mjs';
import { resolveOpenRouterProxySource } from '../src/openrouter-proxy.mjs';
import { captureProviderResponse } from '../src/provider-response-diagnostics.mjs';

const PROXY_ENV_NAMES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

function applyEnv(t, env) {
  const prior = {};
  for (const [name, value] of Object.entries(env)) {
    prior[name] = Object.hasOwn(process.env, name) ? process.env[name] : undefined;
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  t.after(() => {
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

function openaiResponse({ provider = 'Anthropic', model = 'anthropic/claude-haiku-5.5', content = '{"ok":true}' } = {}) {
  const chunk = choice => `data: ${JSON.stringify({ id: 'chatcmpl-fixture', provider, model, choices: [choice] })}\n\n`;
  return new Response([
    chunk({ index: 0, delta: { content }, finish_reason: null }),
    chunk({ index: 0, delta: {}, finish_reason: 'stop' }),
    `data: ${JSON.stringify({ id: 'chatcmpl-fixture', choices: [], usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8, completion_tokens_details: { reasoning_tokens: 0 } } })}\n\n`,
    'data: [DONE]\n\n',
  ].join(''), { headers: { 'content-type': 'text/event-stream' } });
}

function parseOutput(text) {
  const value = JSON.parse(text);
  assert.equal(value.ok, true);
  return value;
}

const schema = Object.freeze({
  type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false,
});
const context = Object.freeze({
  systemPrompt: 'Judge prompt.',
  messages: Object.freeze([{ role: 'user', content: '{}', timestamp: 1 }]),
});
const scope = Object.freeze({ role: 'judge', turn: 1, call: 1 });

function mockedModels(t, { proxySource, responses, env, judgePolicy = 'haiku', probeStep }) {
  applyEnv(t, env);
  const seen = [], saved = [];
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    seen.push(init);
    const next = responses.shift();
    if (!next) throw new Error('unexpected transport call');
    return typeof next === 'function' ? next() : next;
  });
  const models = new Models({
    mode: 'real', roles: ['judge'], judgePolicy,
    ...(probeStep ? { judgeProbeStep: probeStep } : {}),
    ...(proxySource ? { judgeProxySource: proxySource } : {}),
    save: (raw, meter) => { saved.push({ raw, meter }); return `attempt-${saved.length}.json`; },
  });
  return { models, seen, saved };
}

test('resolveOpenRouterProxySource picks HTTPS_PROXY then HTTP_PROXY and reports the actual variable name', () => {
  assert.deepEqual(resolveOpenRouterProxySource({ HTTPS_PROXY: 'http://h:1', HTTP_PROXY: 'http://p:2' }),
    { source: 'HTTPS_PROXY', proxy: 'http://h:1' });
  assert.deepEqual(resolveOpenRouterProxySource({ https_proxy: 'http://hl:1', http_proxy: 'http://pl:2' }),
    { source: 'https_proxy', proxy: 'http://hl:1' });
  assert.deepEqual(resolveOpenRouterProxySource({ HTTP_PROXY: 'http://p:2' }), { source: 'HTTP_PROXY', proxy: 'http://p:2' });
});

test('resolveOpenRouterProxySource rejects missing, blank, malformed and non-http(s) settings with one static message', () => {
  const staticMessage = /OpenRouter proxy unavailable/;
  assert.throws(() => resolveOpenRouterProxySource({}), staticMessage);
  assert.throws(() => resolveOpenRouterProxySource({ HTTPS_PROXY: '   ' }), staticMessage);
  assert.throws(() => resolveOpenRouterProxySource({ HTTPS_PROXY: 'not a url' }), staticMessage);
  assert.throws(() => resolveOpenRouterProxySource({ HTTPS_PROXY: 'ftp://proxy:21' }), staticMessage);
  assert.throws(() => resolveOpenRouterProxySource({ HTTPS_PROXY: 'http://p:1', NODE_TLS_REJECT_UNAUTHORIZED: '0' }), staticMessage);
});

test('the default judge transport ignores proxy env and sends no dispatcher', async t => {
  const { models, seen, saved } = mockedModels(t, {
    env: { OPENROUTER_API_KEY: 'sk-or-v1-defaultkey1234567890', HTTPS_PROXY: 'http://127.0.0.1:9' },
    responses: [() => openaiResponse()],
  });
  assert.deepEqual((await models.complete(scope, context, parseOutput, schema)).value, { ok: true });
  assert.equal(seen.length, 1);
  assert.equal(Object.hasOwn(seen[0], 'dispatcher'), false);
  assert.equal(Object.hasOwn(saved[0].raw, 'proxied'), false);
  assert.equal(Object.hasOwn(saved[0].raw, 'proxySource'), false);
  assert.equal(Object.hasOwn(saved[0].meter, 'proxied'), false);
  assert.equal(Object.hasOwn(saved[0].meter, 'proxySource'), false);
});

test('an explicit judgeProxySource passes an isolated ProxyAgent dispatcher and tags the attempt without leaking secrets', async t => {
  const key = 'sk-or-v1-explicitkey1234567890';
  const { models, seen, saved } = mockedModels(t, {
    proxySource: 'HTTPS_PROXY',
    env: { OPENROUTER_API_KEY: key, HTTPS_PROXY: 'http://proxyuser:proxypass@127.0.0.1:9' },
    responses: [() => openaiResponse()],
  });
  assert.deepEqual((await models.complete(scope, context, parseOutput, schema)).value, { ok: true });
  assert.equal(seen.length, 1);
  assert.ok(seen[0].dispatcher instanceof ProxyAgent, 'proxy requests must carry an explicit ProxyAgent dispatcher');
  assert.equal(saved[0].raw.proxied, true);
  assert.equal(saved[0].raw.proxySource, 'HTTPS_PROXY');
  assert.equal(saved[0].meter.proxied, true);
  assert.equal(saved[0].meter.proxySource, 'HTTPS_PROXY');
  const serialized = JSON.stringify(saved[0]);
  assert.doesNotMatch(serialized, /explicitkey|proxyuser|proxypass|127\.0\.0\.1:9/);
});

test('a missing proxy at construction fails closed instead of opening a direct request', async t => {
  applyEnv(t, {
    OPENROUTER_API_KEY: 'sk-or-v1-closedkey1234567890',
    HTTPS_PROXY: undefined, https_proxy: undefined, HTTP_PROXY: undefined, http_proxy: undefined,
  });
  let fetched = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetched++; return openaiResponse(); });
  assert.throws(() => new Models({
    mode: 'real', roles: ['judge'], judgePolicy: 'haiku', judgeProxySource: 'HTTPS_PROXY',
    save: () => 'a.json',
  }), error => error.failure?.kind === 'configuration');
  assert.equal(fetched, 0);
});

test('explicit proxy requests CONNECT through the loopback proxy and never fall open on transport failure', async t => {
  const connects = [];
  const proxy = createServer((_request, response) => {
    assert.fail('a proxied judge request must not hit the proxy as a direct HTTP request');
    response.end();
  });
  proxy.on('connect', (request, socket) => {
    connects.push(request.url);
    socket.end('HTTP/1.1 502 proxy stop\r\nContent-Length: 0\r\n\r\n');
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  t.after(() => proxy.close());

  applyEnv(t, {
    OPENROUTER_API_KEY: 'sk-or-v1-loopbackkey1234567890',
    HTTPS_PROXY: `http://127.0.0.1:${proxy.address().port}`,
    NODE_TLS_REJECT_UNAUTHORIZED: undefined,
  });
  const saved = [];
  const models = new Models({
    mode: 'real', roles: ['judge'], judgePolicy: 'haiku', judgeProbeStep: 'A', judgeProxySource: 'HTTPS_PROXY',
    save: (raw, meter) => { saved.push({ raw, meter }); return 'attempt-1.json'; },
  });
  await assert.rejects(models.complete(scope, context, parseOutput, schema));
  assert.ok(connects.length >= 1, 'the request must be tunnelled through the proxy');
  assert.ok(connects.every(target => target === 'openrouter.ai:443'), `unexpected CONNECT targets ${JSON.stringify(connects)}`);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].meter.failureKind, 'provider_failure');
  assert.equal(saved[0].raw.proxied, true);
  assert.equal(saved[0].raw.proxySource, 'HTTPS_PROXY');
});

test('a non-2xx proxied response saves key, Authorization and proxy credentials redacted but keeps error metadata', async t => {
  const key = 'sk-or-v1-redactedkey1234567890';
  const body = JSON.stringify({ error: { code: 'geo_restricted', type: 'upstream_error',
    message: `denied ${key} via proxyuser:proxypass` } });
  const { models, seen, saved } = mockedModels(t, {
    proxySource: 'HTTPS_PROXY',
    probeStep: 'A',
    env: { OPENROUTER_API_KEY: key, HTTPS_PROXY: 'http://proxyuser:proxypass@127.0.0.1:9' },
    responses: [() => new Response(body, { status: 403, headers: {
      authorization: `Bearer ${key}`, 'x-openrouter-error-origin': 'client', 'x-request-id': 'rid-safe',
    } })],
  });
  await assert.rejects(models.complete(scope, context, parseOutput, schema));
  assert.ok(seen.at(-1).dispatcher instanceof ProxyAgent);
  const response = saved.at(-1).raw.providerResponse;
  assert.equal(response.status, 403);
  const serialized = JSON.stringify(response);
  assert.doesNotMatch(serialized, /redactedkey|proxyuser|proxypass|Bearer/);
  assert.equal(response.headers['x-openrouter-error-origin'], 'client');
  assert.equal(response.headers['x-request-id'], 'rid-safe');
  assert.doesNotMatch(serialized, /authorization/i);
  assert.match(response.body, /geo_restricted/);
  assert.match(response.body, /upstream_error/);
});

test('a malformed 2xx judgement cannot echo credentials into original response or validation detail', async t => {
  const key = 'arbitrary-openrouter-secret';
  const { models, saved } = mockedModels(t, {
    proxySource: 'HTTPS_PROXY', probeStep: 'A',
    env: { OPENROUTER_API_KEY: key, HTTPS_PROXY: 'http://proxyuser:proxypass@127.0.0.1:9' },
    responses: [openaiResponse({ content: `Forbidden ${key} and proxypass` })],
  });
  await assert.rejects(models.complete(scope, context, parseOutput, schema));
  assert.equal(saved[0].meter.failureKind, 'judge_partial_failure');
  assert.doesNotMatch(JSON.stringify(saved[0]), /arbitrary-openrouter-secret|proxypass/);
  assert.match(JSON.stringify(saved[0].raw.response), /\[REDACTED\]/);
});

test('diagnostic capture sanitizes explicit secrets across blank, truncated and trailing-JSON bodies', async () => {
  const key = 'sk-or-v1-abcdefgh12345678';
  const secrets = [key, 'proxyuser', 'proxypass', 'http://proxyuser:proxypass@proxy.test:8080'];
  const cases = [
    { body: '', expect: null },
    { body: '{"error":{"code":"x"', expect: /code/ },
    { body: `{"error":{"code":"geo_restricted"}} trailing ${key}`, expect: /geo_restricted/ },
  ];
  for (const { body, expect } of cases) {
    const response = new Response(body, { status: 403, headers: {
      authorization: `Bearer ${key}`, 'x-request-id': 'safe',
    } });
    const captured = await captureProviderResponse(response, { secrets });
    assert.equal(captured.status, 403);
    assert.equal(captured.headers.authorization, undefined);
    assert.equal(captured.headers['x-request-id'], 'safe');
    const serialized = JSON.stringify(captured);
    assert.doesNotMatch(serialized, /abcdefgh12345678|proxyuser|proxypass/);
    if (expect) assert.match(captured.body, expect);
  }
});
