import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { hash } from '../contracts/core/schema.mjs';

const script = await import('../scripts/judge-bakeoff-403-probe.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});

test('the probe registration fixes the prompt, A-D order, output cap and total ceiling', () => {
  assert.ok(script, 'the registered 403 probe entry point must exist');
  const plan = script.makeProbePlan({ head: 'a'.repeat(40), checkReceiptSha256: 'b'.repeat(64),
    sources: { 'src/models.mjs': 'c'.repeat(64), 'src/run-receipts.mjs': 'd'.repeat(64) } });
  assert.equal(plan.head, 'a'.repeat(40));
  assert.equal(plan.checkReceiptSha256, 'b'.repeat(64));
  assert.deepEqual(plan.sources, { 'src/models.mjs': 'c'.repeat(64), 'src/run-receipts.mjs': 'd'.repeat(64) });
  assert.deepEqual(plan.sequence, ['A', 'B', 'C', 'D']);
  assert.equal(plan.requestShape.prompt, 'Reply with the JSON object {"ok":true}.');
  assert.equal(plan.limits.maxRequests, 12);
  assert.equal(plan.limits.maxTokensPerRequest, 64);
  assert.equal(plan.limits.maxRequestedOutputTokens, 768);
  assert.equal(plan.limits.maxResponseBodyBytes, 16_384);
  assert.ok(script.probeSourceFiles.includes('config/e1.mjs'));
  assert.ok(script.probeSourceFiles.includes('config/judge-contrast.mjs'));
  assert.ok(script.probeSourceFiles.includes('src/run-receipts.mjs'));
  assert.equal(plan.limits.maxAttemptsPerStep, 1);
  assert.equal(plan.limits.plannedRequests, 8);
  assert.deepEqual(Object.keys(plan.candidates), ['haiku', 'gemini']);
  assert.ok(plan.candidates.haiku.steps.every(step => step.maxTokens === 64));
  assert.ok(plan.candidates.gemini.steps.every(step => step.maxTokens === 64));
  assert.equal(plan.candidates.haiku.steps[0].maxTokensField, 'max_completion_tokens');
  assert.equal(plan.candidates.haiku.steps[1].maxTokensField, 'max_tokens');
  assert.equal(plan.candidates.gemini.steps[1].maxTokensField, 'max_tokens');
  assert.equal(plan.candidates.gemini.steps[3].providerPin, null);
  assert.ok(plan.candidates.haiku.steps.every(step => JSON.stringify(step.reasoning) === JSON.stringify({ effort: 'low' })));
  assert.ok(plan.candidates.haiku.steps.every(step => step.temperature === null));
  assert.ok(plan.candidates.gemini.steps.every(step => JSON.stringify(step.reasoning) === JSON.stringify({ effort: 'low' })));
  assert.ok(plan.candidates.gemini.steps.every(step => step.temperature === 0));
  assert.match(JSON.stringify(plan), /low/);
  assert.match(JSON.stringify(plan), /1024-token minimum/i);
  assert.ok(script.probeSourceFiles.includes('config/judge-reasoning-off.mjs'));
});

test('probe registration rejects an altered SHA and changed current bytes before requests', async () => {
  assert.equal(typeof script?.verifyProbeRegistration, 'function');
  const plan = script.makeProbePlan({ head: 'a'.repeat(40), checkReceiptSha256: 'b'.repeat(64), sources: {} });
  const bytes = Buffer.from(script.renderProbePlan(plan));
  const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
  assert.deepEqual(script.verifyProbeRegistration(bytes, sha, bytes), plan);
  assert.throws(() => script.verifyProbeRegistration(bytes, '0'.repeat(64), bytes), /SHA256 mismatch/);
  assert.throws(() => script.verifyProbeRegistration(bytes, sha, Buffer.concat([bytes, Buffer.from('\n')])), /plan, source hashes, HEAD or check receipt changed/);
});

test('probe worker requires explicit cost authorization and an exact plan SHA before creating artifacts', async t => {
  const plan = script.makeProbePlan({ head: 'a'.repeat(40), checkReceiptSha256: 'b'.repeat(64), sources: {} });
  const planSha256 = hash(Buffer.from(script.renderProbePlan(plan)));
  const root = tempRoot(t);
  let fetchCount = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetchCount++; throw Error('unexpected fetch in gate test'); });
  await assert.rejects(script.runProbeCandidate({ candidateKey: 'haiku', root, plan, planSha256 }), /--confirm-cost/);
  await assert.rejects(script.runProbeCandidate({ candidateKey: 'haiku', root, plan, planSha256: '0'.repeat(64), confirmCost: true }), /SHA256 mismatch/);
  await assert.rejects(script.runProbeCandidate({ candidateKey: 'haiku', root, plan, planSha256, confirmCost: true }), /clean checkout|plan, source hashes, HEAD or check receipt changed/);
  assert.deepEqual(readdirSync(root), []);
  assert.equal(fetchCount, 0);
});

test('real probe CLI requires the repository cost authorization flag before reading the plan', () => {
  const result = spawnSync(process.execPath, ['scripts/judge-bakeoff-403-probe.mjs', '--candidate', 'haiku',
    '--plan', 'missing-plan.md', '--plan-sha256', 'a'.repeat(64)], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--confirm-cost/);
});

function tempRoot(t) {
  const parent = resolve('.tmp/scratch/judge-bakeoff');
  const root = mkdtempSync(join(parent, 'probe-run-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
