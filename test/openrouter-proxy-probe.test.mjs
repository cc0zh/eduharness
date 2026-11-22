import assert from 'node:assert/strict';
import http, { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { renderProxyReport, runProxyProbe, redactProxyResult, selectProxySource } from '../scripts/openrouter-proxy-probe.mjs';

function fixtureRoot(t) {
  const parent = resolve('.tmp/scratch/judge-bakeoff');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'proxy-probe-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('missing proxy or cost confirmation stops before any fetch', async (t) => {
  let fetchCount = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetchCount++; throw Error('network must not run'); });
  await assert.rejects(runProxyProbe({ env: {} }), /proxy address required/);
  await assert.rejects(runProxyProbe({ proxy: 'http://127.0.0.1:1', runRoot: fixtureRoot(t) }), /--confirm-cost/);
  assert.equal(fetchCount, 0);
});

test('proxy selection prefers explicit argument, then HTTPS_PROXY, then HTTP_PROXY without revealing values', () => {
  assert.deepEqual(selectProxySource('http://arg-user:arg-pass@arg.test:8080', {
    HTTPS_PROXY: 'http://https-user:https-pass@https.test:8443', HTTP_PROXY: 'http://http.test:8080',
  }), { source: 'argument', proxy: 'http://arg-user:arg-pass@arg.test:8080' });
  assert.deepEqual(selectProxySource(undefined, {
    HTTPS_PROXY: 'http://https-user:https-pass@https.test:8443', HTTP_PROXY: 'http://http.test:8080',
  }), { source: 'HTTPS_PROXY', proxy: 'http://https-user:https-pass@https.test:8443' });
  assert.deepEqual(selectProxySource(undefined, { HTTP_PROXY: 'http://http-user:http-pass@http.test:8080' }),
    { source: 'HTTP_PROXY', proxy: 'http://http-user:http-pass@http.test:8080' });
  assert.deepEqual(selectProxySource(undefined, {}), { source: null, proxy: null });
});

test('all HTTP requests use CONNECT through the configured proxy and stop within the call cap', {
  skip: typeof http.setGlobalProxyFromEnv !== 'function',
}, async t => {
  const server = createServer((request, response) => {
    assert.fail(`unexpected direct request ${request.method} ${request.url}`);
  });
  const targets = [];
  server.on('connect', (request, socket) => {
    targets.push(request.url);
    socket.end('HTTP/1.1 502 test proxy stop\r\nContent-Length: 0\r\n\r\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  t.after(http.setGlobalProxyFromEnv({ HTTPS_PROXY: 'http://127.0.0.1:1', HTTP_PROXY: 'http://127.0.0.1:1' }));
  const proxy = `http://127.0.0.1:${server.address().port}`;
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'unit-test-credential';
  t.after(() => { if (prior === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prior; });
  const result = await runProxyProbe({ proxy, env: { NO_PROXY: '*' }, runRoot: fixtureRoot(t), confirmCost: true });
  assert.deepEqual(targets, ['ipapi.co:443', 'openrouter.ai:443', 'openrouter.ai:443']);
  assert.equal(result.proxyUsed, true);
  assert.equal(result.geoRequests, 1);
  assert.equal(result.openRouterRequests, 2);
  assert.equal(result.reservedRequests, 2);
  assert.equal(result.requestedOutputTokens, 128);
  assert.ok(result.openRouterRequests <= 4);
  assert.equal(result.region.region.status, 'unavailable');
  assert.equal(result.region.region.countryCode, null);
  assert.equal(JSON.stringify(result).includes('203.0.113.9'), false);
});

test('only country and sanitized diagnostics survive write, even if headers echo the exact key', {
  skip: typeof http.setGlobalProxyFromEnv !== 'function',
}, async t => {
  const prior = process.env.OPENROUTER_API_KEY;
  const key = 'synthetic-unmarked-key-42';
  process.env.OPENROUTER_API_KEY = key;
  t.after(() => { if (prior === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prior; });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) return Response.json({ country_code: 'GB', country_name: key, ip: '198.51.100.27' });
    return new Response(JSON.stringify({ error: { message: `denied ${key} from 198.51.100.27` } }), {
      status: 403, headers: { authorization: `Bearer ${key}`, 'x-openrouter-error-origin': 'client', 'x-request-id': key },
    });
  });
  const result = await runProxyProbe({ proxy: 'http://127.0.0.1:1', runRoot: fixtureRoot(t), confirmCost: true });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].init.redirect, 'manual');
  assert.equal(result.region.region.countryCode, 'GB');
  for (const [i, candidate] of result.candidates.entries()) {
    const { init } = requests[i + 1];
    const body = JSON.parse(init.body);
    assert.equal(body.max_completion_tokens, 64);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(body.provider.only, [i === 0 ? 'anthropic' : 'google-ai-studio']);
    const saved = readFileSync(join(result.runDir, candidate.attemptPath), 'utf8');
    assert.doesNotMatch(saved, /synthetic-unmarked-key-42|198\.51\.100\.27|"authorization"/i);
    assert.equal(candidate.providerResponse.headers['x-openrouter-error-origin'], 'client');
    assert.equal(candidate.httpStatus, 403);
  }
});

test('result redaction removes key, authorization, and full IP values', () => {
  const value = redactProxyResult({ proxy: 'http://user:pass@proxy.test:8080', ip: '203.0.113.9', countryCode: 'GB',
    headers: { authorization: 'Bearer secret-token', 'x-openrouter-request-id': 'safe-id' }, body: 'api_key=secret-key' });
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /203\.0\.113\.9|user:pass|secret-token|secret-key/);
  assert.equal(value.countryCode, 'GB');
  assert.equal(value.ip, '[REDACTED]');
  assert.equal(value.headers['x-openrouter-request-id'], 'safe-id');
});

test('result redaction removes full IPv4 and IPv6 addresses from any diagnostic string, header, or body', () => {
  const value = redactProxyResult({
    note: 'egress seen from 203.0.113.9 before retry',
    vendor: { message: 'upstream rejected request from 198.51.100.24:443' },
    headers: { 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '198.51.100.24', server: 'edge-198.51.100.24.proxy.test' },
    body: '{"detail":"v6 egress 2001:db8:85a3::8a2e:370:7334 and 2001:0db8:0000:0000:0000:ff00:0042:8329"}\n{"detail":"link local fe80::1 and compressed 2a00:1450:4001:80b::200e"}',
    list: ['client 203.0.113.9', 'client 2001:db8::1'],
  });
  const serialized = JSON.stringify(value);
  for (const leaked of ['203.0.113.9', '198.51.100.24', '2001:db8:85a3::8a2e:370:7334',
    '2001:0db8:0000:0000:0000:ff00:0042:8329', 'fe80::1', '2a00:1450:4001:80b::200e', '2001:db8::1']) {
    assert.equal(serialized.includes(leaked), false, `leaked IP ${leaked} in ${serialized}`);
  }
  assert.ok(serialized.includes('[IP REDACTED]'), 'redaction must mark removed IPs');
  assert.ok(serialized.includes('before retry'), 'surrounding diagnostic text must survive');
  assert.equal(value.headers.server, 'edge-[IP REDACTED].proxy.test');
});

test('probe report includes the country, sanitized response body and diagnostic headers without IP', () => {
  const report = renderProxyReport({
    id: 'proxy-probe-example', proxy: { protocol: 'http:', hostname: 'proxy.test', port: '8080' }, proxyUsed: true,
    region: { statusCode: 200, region: { countryCode: 'GB', country: 'United Kingdom', status: 'available' } },
    geoRequests: 1, openRouterRequests: 2, reservedRequests: 2,
    candidates: [{ candidate: 'haiku', model: 'anthropic/claude-haiku-5.5', httpStatus: 403, accepted: false,
      reportedProvider: null, reportedModel: null, attemptPath: 'haiku-A.json',
      providerResponse: { status: 403, headers: { 'x-openrouter-error-origin': 'client' },
        body: '{"error":{"message":"Denied from 203.0.113.9"}}', bodyTruncated: false },
      failure: { detail: 'denied 203.0.113.9' } },
    { candidate: 'gemini', model: 'google/gemini-3.8-flash', httpStatus: 200, accepted: true,
      reportedProvider: 'Google AI Studio', reportedModel: 'google/gemini-3.8-flash', attemptPath: 'gemini-A.json',
      providerResponse: { status: 200, headers: {}, body: '{"ok":true}', bodyTruncated: false }, failure: null }],
  });
  assert.match(report, /United Kingdom/);
  assert.match(report, /x-openrouter-error-origin/);
  assert.match(report, /Denied from \[IP REDACTED\]/);
  assert.doesNotMatch(report, /203\.0\.113\.9/);
  assert.match(report, /本次代理出口：\*\*部分通过\*\*/);
});

test('proxy transport failures are inconclusive, not an OpenRouter denial', () => {
  const report = renderProxyReport({ proxy: { source: 'HTTPS_PROXY' }, id: 'fixture',
    region: { statusCode: null }, candidates: [{ candidate: 'haiku', httpStatus: null, accepted: false }],
    openRouterRequests: 1, geoRequests: 1 });
  assert.match(report, /本次代理出口：\*\*未能验证\*\*/);
});
