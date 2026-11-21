import assert from 'node:assert/strict';
import test from 'node:test';

const diagnostics = await import('../src/provider-response-diagnostics.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});

test('a non-2xx response keeps useful JSON diagnostics and strips credentials', async () => {
  assert.ok(diagnostics, 'provider response diagnostics must exist');
  const body = {
    error: { message: 'Authorization: Bearer bearer-secret-123; key=key-secret-456' },
    metadata: {
      provider_name: 'Anthropic',
      raw: 'denied; sk-or-v1-abcdefghijklmnopqrstuvwxyz; AIza0123456789abcdefghijklmnop',
      api_key: 'api-secret-789',
      key: 'nested-key-secret',
    },
  };
  const response = new Response(JSON.stringify(body), { status: 403, headers: {
    'content-type': 'application/json',
    'retry-after': '2',
    'x-openrouter-error': 'provider unavailable',
    'x-openrouter-request-id': 'req-diagnostic-1',
    'x-openrouter-api-key': 'header-secret',
    authorization: 'Bearer header-bearer-secret',
    'set-cookie': 'session=private',
  } });

  const captured = await diagnostics.captureProviderResponse(response);
  assert.equal(captured.status, 403);
  assert.deepEqual(captured.headers, {
    'content-type': 'application/json',
    'retry-after': '2',
    'x-openrouter-error': 'provider unavailable',
    'x-openrouter-request-id': 'req-diagnostic-1',
  });
  assert.deepEqual(JSON.parse(captured.body), {
    error: { message: 'Authorization: Bearer [REDACTED]; key=[REDACTED]' },
    metadata: {
      provider_name: 'Anthropic',
      raw: 'denied; [REDACTED]; [REDACTED]',
      api_key: '[REDACTED]',
      key: '[REDACTED]',
    },
  });
  assert.equal(captured.bodyTruncated, false);
  assert.doesNotMatch(JSON.stringify(captured), /bearer-secret|key-secret|api-secret|header-secret|private/);
  assert.equal(await response.text(), JSON.stringify(body), 'capturing diagnostics must not consume the provider response');
});

test('a large text error body is bounded and marked truncated', async () => {
  assert.ok(diagnostics, 'provider response diagnostics must exist');
  const response = new Response('x'.repeat(256), { status: 403 });
  const captured = await diagnostics.captureProviderResponse(response, { maxBodyBytes: 32 });
  assert.equal(captured.status, 403);
  assert.equal(captured.body, 'x'.repeat(32));
  assert.equal(captured.bodyTruncated, true);
  assert.equal((await response.text()).length, 256);
});

test('an invalid JSON fallback still redacts quoted credential fields', async () => {
  const response = new Response('{"api_key":"short-secret","metadata":{"token":"short-token"}} trailing', { status: 403 });
  const captured = await diagnostics.captureProviderResponse(response);
  assert.doesNotMatch(captured.body, /short-secret|short-token/);
  assert.match(captured.body, /"api_key":"\[REDACTED\]"/);
  assert.match(captured.body, /"token":"\[REDACTED\]"/);
});

test('plain and truncated credential assignments cannot bypass redaction', async () => {
  const fallback = await diagnostics.captureProviderResponse(new Response(
    'authorization: "Bearer short-bearer" api_key: "short-key" trailing text', { status: 403 }));
  assert.doesNotMatch(fallback.body, /short-bearer|short-key/);

  const partial = await diagnostics.captureProviderResponse(new Response(
    '{"api_key":"partial-secret-value-that-keeps-going', { status: 403 }), { maxBodyBytes: 24 });
  assert.equal(partial.bodyTruncated, true);
  assert.doesNotMatch(partial.body, /partial-secret/);
});

test('escaped credentials, header-pair arrays and redaction expansion stay secret and bounded', async () => {
  const escaped = await diagnostics.captureProviderResponse(new Response(
    '{"api_key":"prefix\\"escaped-secret"} trailing', { status: 403 }));
  assert.doesNotMatch(escaped.body, /escaped-secret/);

  const pairs = await diagnostics.captureProviderResponse(new Response(
    JSON.stringify({ headers: [['x-api-key', 'array-secret-value']] }), { status: 403 }));
  assert.doesNotMatch(pairs.body, /array-secret-value/);

  const body = JSON.stringify(Array.from({ length: 900 }, () => ({ api_key: 'x' })));
  assert.ok(Buffer.byteLength(body) < 16_384);
  const expanded = await diagnostics.captureProviderResponse(new Response(body, { status: 403 }));
  assert.equal(Buffer.byteLength(expanded.body) <= 16_384, true);
  assert.equal(expanded.bodyTruncated, true);
});
