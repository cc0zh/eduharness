import assert from 'node:assert/strict';
import test from 'node:test';

const probe = await import('../config/judge-bakeoff-probe.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});
const { splitJudgeCandidates } = await import('../config/judge-bakeoff.mjs');

test('A-D probes only change the registered provider parameters and keep each cap at 64', () => {
  assert.ok(probe, 'the finite 403 probe configuration must exist');
  for (const [candidate, endpoint, temperature] of [
    ['haiku', 'anthropic', null], ['gemini', 'google-ai-studio', 0],
  ]) {
    const [a, b, c, d] = probe.probeSteps.map(step => probe.make403Probe(candidate, step));
    const pinned = { only: [endpoint], order: [endpoint], allow_fallbacks: false, require_parameters: true };
    assert.deepEqual(a.route.routing, pinned);
    assert.equal(a.route.maxTokensField, 'max_completion_tokens');
    assert.equal(a.route.responseFormat, 'json_schema');
    assert.deepEqual(a.route.temperature, temperature);
    assert.deepEqual(b.route.routing, a.route.routing);
    assert.equal(b.route.maxTokensField, 'max_tokens');
    assert.equal(b.route.responseFormat, a.route.responseFormat);
    assert.deepEqual(c.route.routing, { ...pinned, require_parameters: false });
    assert.equal(c.route.maxTokensField, 'max_tokens');
    assert.equal(c.route.responseFormat, null);
    assert.deepEqual(d.route.routing, { allow_fallbacks: false, require_parameters: false });
    assert.equal(d.route.maxTokensField, 'max_tokens');
    assert.equal(d.route.responseFormat, null);
    for (const variant of [a, b, c, d]) {
      assert.equal(variant.policy.judge.maxTokens, 64);
      assert.equal(variant.policy.maxAttemptsPerCall, 1);
      assert.equal(variant.policy.judge.reasoning.effort, 'low');
      assert.equal(variant.route.id, splitJudgeCandidates[candidate].route.id);
    }
  }
});
