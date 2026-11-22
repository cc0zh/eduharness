import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fauxAssistantMessage } from '@earendil-works/pi-ai';
import { bindBinary } from '../contracts/judge/binary.mjs';
import { binaryDimensionSchema, splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { splitBinaryV4IdentityVersion, splitBinaryV4Ruler } from '../contracts/judge/binary-v4.mjs';
import { binaryDimensionPrompt, gradeBinaryDimension } from '../src/binary-judge-v3.mjs';
import * as freezePlan from '../src/judge-bakeoff-plan.mjs';
import { Models } from '../src/models.mjs';

const ruler = 'e1-binary-v4';
const general = "Judge only from the actual questions and steps shown in the dialogue; a tutor's later claim or denial about what was asked or done is neither evidence nor a disqualifier for a real earlier message.";
const rules = {
  V1: 'Merely claiming a check happened does not count as V1, and a later false claim or denial does not erase a real earlier V1 prompt.',
  A1: 'Routine algebra or arithmetic (such as subtracting given equations, canceling stated terms, or solving the resulting linear equation) after the tutor already supplied the setup or expansion does not qualify.',
  A2: 'Applying a method or check assigned by the tutor (including adjusting a constant during a transfer check) does not qualify as originating a method.',
};
const messages = Array.from({ length: 9 }, (_, i) => ({
  id: `m:${i + 1}`, role: i % 2 ? 'teacher' : 'learner', turn: Math.ceil(i / 2), text: `Public message ${i + 1}`,
}));
const view = bindBinary(messages);
const empty = schema => schema.properties
  ? Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, empty(value)])) : schema.type === 'boolean' ? false : null;

async function judge(dimension, text = JSON.stringify(empty(binaryDimensionSchema(view, dimension)))) {
  const attempts = [];
  const models = new Models({ mode: 'offline', judgePolicy: 'gemini', roles: ['judge'],
    responses: [fauxAssistantMessage(text)], save: raw => { attempts.push(raw); } });
  const result = await gradeBinaryDimension(models, messages, {
    ruler, dimension, runId: 'binary-v4-offline', cell: 'case', sourceRunId: 'public-dialogue', turn: 4,
  });
  return { request: attempts[0], result };
}

test('the v4 general evidence rule leaves the model boundary in every dimension', async () => {
  for (const dimension of splitDimensions) {
    const { request } = await judge(dimension);
    const [header] = request.context.systemPrompt.split('\n');
    assert.ok(header.includes(general), `${dimension} is missing the v4 general evidence rule`);
    assert.equal(request.binding.ruler, ruler);
    assert.equal(request.call, splitDimensions.indexOf(dimension) + 1);
  }
});

for (const [id, rule] of Object.entries(rules)) {
  test(`${id} carries its v4 clause in the outgoing question and changes no other question`, async () => {
    const dimension = id === 'V1' ? 'verification_or_transfer' : 'agency_handoff';
    const { request, result } = await judge(dimension);
    const lines = request.context.systemPrompt.split('\n');
    assert.ok(lines.find(line => line.startsWith(`${id}: `))?.includes(rule), `${id} is missing its v4 clause`);
    const original = binaryDimensionPrompt(view, dimension).split('\n');
    assert.deepEqual(lines.slice(1).map(line => Object.values(rules).reduce((base, rule) => base.replace(` ${rule}`, ''), line)), original.slice(1));
    assert.ok(!binaryDimensionPrompt(view, dimension).includes(general));
    assert.equal(result.verdict.scoring.ruler, ruler);
    assert.deepEqual(result.verdict.scoring.scores, { [dimension]: 0 });
  });
}

test('v4 uses a fresh identity and fingerprints the actual judging sources, not the run ID', () => {
  assert.equal(typeof freezePlan.judgeFreezeV4Fingerprint, 'function', 'the v4 identity must bind a new judging fingerprint');
  const sources = Object.fromEntries(freezePlan.judgeFreezeV4JudgingFiles.map(path => [path, 'a'.repeat(64)]));
  const identity = { ruler, judgeOutputContract: 'judge-output-v5', routes: { judge: { id: 'google/gemini-3.8-flash' } },
    policy: { judge: { maxTokens: 4096 } }, judgeTransport: { proxied: true, proxySource: 'HTTPS_PROXY' }, sources };
  const fingerprint = freezePlan.judgeFreezeV4Fingerprint(identity);
  assert.match(fingerprint, /^[a-f\d]{64}$/);
  assert.notEqual(fingerprint, freezePlan.judgeFreezeV4Fingerprint({ ...identity, ruler: 'e1-binary-v3' }));
  assert.notEqual(fingerprint, freezePlan.judgeFreezeV4Fingerprint({ ...identity,
    sources: { ...sources, 'contracts/judge/binary-v4.mjs': 'b'.repeat(64) } }));
  assert.equal(splitBinaryV4IdentityVersion, 'evaluation-identity-v6');
  assert.equal(splitBinaryV4Ruler, ruler);
});

for (const [label, text] of [
  ['invalid', '[]'], ['truncated', '{"answers":'], ['empty', ''],
  ['trailing text', '{"answers":{"V1":{"answer":false,"evidence":{"prompt":null}},"V2":{"answer":false,"evidence":{"response":null,"prompt":null}}}} trailing'],
]) {
  test(`v4 does not emit a judgement for ${label} content`, async () => {
    await assert.rejects(judge('verification_or_transfer', text), error => Boolean(error.failure));
  });
}

test('a rejected v4 preflight cannot claim the only real run ID, including a case alias', t => {
  const root = mkdtempSync(join(tmpdir(), 'binary-v4-preflight-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const registered = 'round2-binary-v4-freeze-gemini-01';
  for (const id of [registered, registered.toUpperCase()]) {
    const result = spawnSync(process.execPath, ['src/cli.mjs', '--scenario', 'S1-judge-freeze-v4', '--judge-policy', 'gemini',
      '--run-root', root, '--mode', 'real', '--proxy-from-env', '--estimate-only', '--id', id],
    { encoding: 'utf8', env: { ...process.env, HTTPS_PROXY: 'http://127.0.0.1:9' } });
    assert.equal(result.status, 2, result.stderr);
    assert.ok(!readdirSync(join(root, '_receipts')).some(name => name.toLowerCase().startsWith(`${registered}.`)),
      `rejected ${id} must not consume the registered run ID`);
  }
});
