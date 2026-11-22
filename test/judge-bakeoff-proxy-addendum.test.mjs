import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { splitJudgeCandidates } from '../config/judge-bakeoff.mjs';
import { hash } from '../contracts/core/schema.mjs';
import { deriveBakeoffProxyAddendum } from '../src/judge-bakeoff.mjs';
import { contrastRegistration } from '../src/judge-contrast-plan.mjs';
import { bakeoffBudget, originalBakeoffRegistrationSha256, proxyBakeoffRunIds } from '../src/judge-bakeoff-plan.mjs';
import { verifySplitTransport } from '../src/split-judge-replay.mjs';

test('the proxy addendum preserves the parent prose, queue, budgets, and Qwen candidate', () => {
  const candidates = Object.fromEntries(Object.entries(splitJudgeCandidates).map(([key, { runId, route, policy }]) => {
    const cap = bakeoffBudget(policy);
    return [key, { runId, route, policy, limits: { maxAttempts: cap.maxCalls, maxRequestedOutputTokens: cap.maxOutputTokens } }];
  }));
  const queue = [{ id: 'r1/normal', transcriptSha256: '1'.repeat(64) }];
  const stop = { providerFailures: 3, consecutiveFailedCells: 3, failedCells: 4 };
  const parent = { ruler: 'e1-binary-v3', candidates, sources: { original: 'old' }, queue, stop };
  const prose = '# Original\n\n## 采用线\n\n- (a) Original line.\n\n## 两层停线\n\nOriginal stop.\n';
  const original = Buffer.from(`${prose}\n## 机器清单\n\n\`\`\`json\n${JSON.stringify(parent)}\n\`\`\`\n`);
  const sources = { current: 'new' };
  const { plan, bytes } = deriveBakeoffProxyAddendum(original, sources, 'HTTPS_PROXY');
  assert.ok(bytes.toString('utf8').includes(prose));
  assert.deepEqual(contrastRegistration(bytes.toString('utf8')), plan);
  assert.deepEqual({ sources: plan.sources, queue: plan.queue, stop: plan.stop }, { sources, queue, stop });
  assert.equal(plan.parentRegistrationSha256, hash(original));
  assert.deepEqual(plan.judgeTransport, { proxied: true, proxySource: 'HTTPS_PROXY' });
  assert.deepEqual(plan.candidates.qwen, parent.candidates.qwen);
  for (const key of ['haiku', 'gemini']) {
    assert.deepEqual(plan.candidates[key], { ...parent.candidates[key], runId: proxyBakeoffRunIds[key] });
  }
  assert.throws(() => deriveBakeoffProxyAddendum(original, sources, 'http://proxy.invalid'), /proxy source/);
});

test('split replay requires matching proxy evidence in both attempt and telemetry, but accepts historical originals', () => {
  const transport = { proxied: true, proxySource: 'HTTPS_PROXY' };
  assert.doesNotThrow(() => verifySplitTransport({ judgeTransport: transport, parentRegistrationSha256: originalBakeoffRegistrationSha256 }, transport, transport, 'fixture'));
  assert.doesNotThrow(() => verifySplitTransport({}, {}, {}, 'historical'));
  assert.throws(() => verifySplitTransport({ judgeTransport: transport }, transport, {}, 'fixture'), /proxy evidence/);
  assert.throws(() => verifySplitTransport({}, transport, transport, 'fixture'), /proxy evidence/);
});

test('the CLI refuses proxy estimates for Qwen, non-bakeoff scenarios and resume', t => {
  const parent = '.tmp/scratch/judge-bakeoff';
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'proxy-addendum-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [id, params] of Object.entries({
    qwen: ['--scenario', 'S1-judge-bakeoff', '--judge-policy', 'qwen'],
    e1: ['--scenario', 'E1'],
    resume: ['--scenario', 'S1-judge-bakeoff', '--judge-policy', 'haiku', '--resume'],
  })) {
    const result = spawnSync(process.execPath, ['src/cli.mjs', '--mode', 'real', '--estimate-only',
      '--proxy-from-env', '--run-root', root, '--id', id, ...params], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /--proxy-from-env.*Haiku.*Gemini.*resume/);
  }
});
