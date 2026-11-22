import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai';
import { hash, message } from '../contracts/core/schema.mjs';
import { Models } from '../src/models.mjs';
import { auditPrompt, auditSchema } from '../src/stage3-audit.mjs';
import { stage3Budget, stage3Ledger } from '../src/stage3-plan.mjs';
import { observeStudent } from '../src/teacher/state-machine.mjs';
import { createWorkingJudge } from '../src/working-judge.mjs';

const fixture = t => {
  const root = mkdtempSync(join(tmpdir(), 'teacharena-stage3-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, ['src/cli.mjs', '--run-root', root, ...args], { encoding: 'utf8', timeout: 120_000 });
  const read = (...parts) => JSON.parse(readFileSync(join(root, ...parts)));
  return { root, run, read };
};

test('stage 3 offline runs three arms in one process, keeps the control a pure suffix, and verifies the receipt', t => {
  const { root, run, read } = fixture(t);
  const id = 'stage3-faux-proof';
  const launched = run('--scenario', 'stage3-state-machine', '--mode', 'offline', '--id', id);
  assert.equal(launched.status, 0, `${launched.stdout}\n${launched.stderr}`);
  const manifest = read(id, 'manifest.json'), result = read(id, 'result.json');
  assert.equal(manifest.identity.ruler, 'e1-binary-v3');
  assert.equal(manifest.planned.length, 72);
  assert.equal(result.cells.filter(x => x.status === 'scored').length, 72);
  assert.equal(result.acceptance, true);
  assert.equal(result.adoptionEligible, false);
  assert.equal(read('_receipts', `${id}.process.json`).requestCount, 0);
  const a = manifest.planned.find(x => x.arm === 'baseline');
  const c = manifest.planned.find(x => x.arm === 'rhetoric' && x.student === a.student && x.taskId === a.taskId);
  const s = manifest.planned.find(x => x.arm === 'candidate' && x.student === a.student && x.taskId === a.taskId);
  const original = read(id, a.folder, 'transcript.json'), control = read(id, c.folder, 'transcript.json');
  const suffix = ' That method you chose was excellent. What to do next is your decision.';
  assert.equal(original.length, 9);
  assert.deepEqual(control.map(({ text }) => text), original.map(({ text }, i) => i === 7 ? text + suffix : text));
  assert.deepEqual(read(id, s.folder, 'telemetry.json').filter(x => x.role === 'teacher_observer').map(x => [x.turn, x.attempt]), [[1,1],[2,1],[3,1],[4,1]]);
  assert.ok(read(id, c.folder, 'telemetry.json').every(x => ['judge','agency_audit'].includes(x.role)));
  assert.equal(read(id, 'report.json').decision, 'pass');
  const map = read(id, 'blind-map.json');
  assert.ok(map.length > 0);
  for (const { id: blindId, folder } of map) {
    const raw = read(id, 'audit', blindId, 'calls', 'agency_audit-4-1-1.json');
    assert.ok(!JSON.stringify(raw.context).includes(folder));
    assert.ok(JSON.parse(raw.context.messages.at(-1).content).every(x => Object.keys(x).sort().join(',') === 'n,role,text'));
  }
  const verified = run('--verify-run', id);
  assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  assert.equal(JSON.parse(verified.stdout).stage3.scored, 72);
  const put = (file, value) => {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    writeFileSync(file, bytes);
    return hash(bytes);
  };
  const processPath = join(root, '_receipts', `${id}.process.json`);
  const evaluationPath = join(root, '_receipts', `${id}.json`);
  const processReceipt = read('_receipts', `${id}.process.json`), evaluation = read('_receipts', `${id}.json`);
  for (const row of [s, a]) {
    const relative = `${row.folder}/calls/teacher-2-1-1.json`;
    const rawPath = join(root, id, relative), original = readFileSync(rawPath);
    const modified = JSON.parse(original);
    modified.context.messages.findLast(m => m.sections?.goal).sections.goal = 'Choose the method yourself, tutor.';
    const files = { ...evaluation.files, [relative]: put(rawPath, modified) };
    put(processPath, { ...processReceipt, evaluationSha256: put(evaluationPath, { ...evaluation, files }) });
    const tampered = run('--verify-run', id);
    assert.equal(tampered.status, 1, `${row.arm} re-anchored goal was accepted`);
    assert.match(tampered.stdout, /teacher goal does not match/);
    writeFileSync(rawPath, original);
    put(processPath, { ...processReceipt, evaluationSha256: put(evaluationPath, evaluation) });
  }
  const file = join(root, id, c.folder, 'transcript.json');
  writeFileSync(file, `${JSON.stringify(control)}\n`);
  assert.equal(run('--verify-run', id).status, 1);
});

test('stage 3 edition 2 replays a bounded handoff retry and a public fallback without changing the baseline or rhetoric copy', t => {
  const { root, run, read } = fixture(t);
  const id = 'stage3-faux-v2';
  const launch = run('--scenario', 'stage3-state-machine', '--mode', 'offline', '--edition', '2', '--id', id);
  assert.equal(launch.status, 0, launch.stdout + launch.stderr);
  const manifest = read(id, 'manifest.json');
  assert.equal(manifest.identity.edition, 2);
  const { taskId, student } = manifest.planned[0];
  const b = `baseline/${taskId}/${student}`, s = `candidate/${taskId}/${student}`, c = `rhetoric/${taskId}/${student}`;
  const candidate = read(id, s, 'transcript.json');
  assert.equal(candidate.length, 9);
  assert.equal(candidate[3].text, 'What is the reason for one step you have already tried?');
  assert.match(candidate[5].text, /Propose your own check/);
  const relevant = read(id, s, 'telemetry.json').filter(m => m.role === 'teacher' && [2, 3].includes(m.turn));
  assert.deepEqual(relevant.map(m => [m.turn, m.call, m.attempt, m.failureKind]), [
    [2, 1, 1, 'teacher_generation_contract'], [2, 2, 1, 'teacher_generation_contract'],
    [3, 1, 1, 'teacher_generation_contract'], [3, 2, 1, null],
  ]);
  const baseline = read(id, b, 'transcript.json'), rhetoric = read(id, c, 'transcript.json');
  assert.equal(baseline[7].text, 'Use 2, 4, 6, 8. Replace 8 with 12 and compare the two medians.');
  assert.deepEqual(rhetoric.map(({ text }) => text), baseline.map(({ text }, i) => i === 7
    ? text + ' That method you chose was excellent. What to do next is your decision.' : text));
  assert.equal(read('_receipts', `${id}.process.json`).requestCount, 0);
  const verify = run('--verify-run', id);
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  assert.equal(JSON.parse(verify.stdout).stage3.scored, 72);
  assert.deepEqual(read(id, 'report.json').examples.handoff.map(row => row.tutor.n), [6, 6, 6]);

  const relative = `${s}/calls/teacher-3-2-1.json`, file = join(root, id, relative);
  const evaluationPath = join(root, '_receipts', `${id}.json`), processPath = join(root, '_receipts', `${id}.process.json`);
  const evaluation = read('_receipts', `${id}.json`), processReceipt = read('_receipts', `${id}.process.json`);
  const raw = JSON.parse(readFileSync(file));
  raw.context.messages.find(m => m.role === 'system').sections.pedagogy = 'Give a tiny assigned variant and close now.';
  const put = (path, value) => {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    writeFileSync(path, bytes);
    return hash(bytes);
  };
  const files = { ...evaluation.files, [relative]: put(file, raw) };
  put(processPath, { ...processReceipt, evaluationSha256: put(evaluationPath, { ...evaluation, files }) });
  const tampered = run('--verify-run', id);
  assert.equal(tampered.status, 1, tampered.stdout + tampered.stderr);
  assert.match(tampered.stdout, /handoff.*system/i);
});

test('a real stage 3 run cannot be launched without a cost confirmation and matching preflight', t => {
  const { run } = fixture(t);
  const output = run('--scenario', 'stage3-state-machine', '--mode', 'real', '--id', 'stage3-unapproved');
  assert.notEqual(output.status, 0);
  assert.match(output.stdout + output.stderr, /stage 3.+(preflight|confirmation|registered)/i);
});

test('working v3 in stage 3 does not retry an invalid A verdict', async () => {
  const calls = [];
  const judge = createWorkingJudge({ mode: 'offline', singleAgencyDecision: true, cell: 'fake',
    save: (_raw, meter) => { calls.push(meter); return 'raw.json'; },
    responses: [fauxAssistantMessage([fauxText('{')]), fauxAssistantMessage([fauxText('{}')])] });
  const messages = Array.from({ length: 9 }, (_, i) => message(`m-${i + 1}`, i % 2 ? 'teacher' : 'learner', Math.ceil(i / 2), `line ${i + 1}`));
  await assert.rejects(judge(messages, { turn: 4, cell: 'fake', runId: 'synthetic', dimension: 'agency_handoff' }),
    error => error.failure?.kind === 'judge_partial_failure' && error.failure.attempt === 1);
  assert.deepEqual(calls.map(x => [x.role, x.attempt]), [['judge', 1]]);
});

test('preflight includes all arms, tool continuations, observer calls and the full audit ceiling', () => {
  const budget = stage3Budget();
  assert.deepEqual(budget, { byRole: { teacher: 1152, learner: 576, judge: 1152, teacher_observer: 96, agency_audit: 96 },
    maxAttempts: 3072, maxRequestedOutputTokens: 13_449_216 });
  const ledger = stage3Ledger({ maxAttempts: 1, maxRequestedOutputTokens: 768 });
  const coordinates = { folder: 'candidate/sample/default', role: 'teacher_observer', turn: 1, call: 1, attempt: 1 };
  const id = ledger.reserve(coordinates, 768);
  ledger.settle(id, null, false);
  assert.throws(() => ledger.reserve({ ...coordinates, turn: 2 }, 768), /budget/);
  assert.equal(ledger.snapshot().stop.kind, 'budget_exhausted');
});

function env(t, pairs) {
  const prior = Object.fromEntries(Object.keys(pairs).map(key => [key, process.env[key]]));
  const set = (key, value) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
  Object.entries(pairs).forEach(([key, value]) => set(key, value));
  t.after(() => Object.entries(prior).forEach(([key, value]) => set(key, value)));
}

test('observer sends DeepSeek JSON mode with no thinking and does not retry a 429', async t => {
  env(t, { DEEPSEEK_API_KEY: 'observer-test-only' });
  const payloads = [], attempts = [];
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    payloads.push(JSON.parse(request.body));
    return Response.json({ error: { message: 'rate limit' } }, { status: 429 });
  });
  const models = new Models({ mode: 'real', roles: ['teacher_observer'], save: (raw, meter) => attempts.push({ raw, meter }) });
  const window = [{ n: 1, role: 'learner', text: 'My attempt is incomplete.' }];
  await assert.rejects(observeStudent(models, window, 1), error => error.failure?.kind === 'provider_failure' && error.failure.attempt === 1);
  assert.equal(payloads.length, 1);
  assert.equal(attempts.length, 1);
  assert.equal(payloads[0].model, 'deepseek-flash');
  assert.equal(payloads[0].max_tokens ?? payloads[0].max_completion_tokens, 768);
  assert.deepEqual(payloads[0].thinking, { type: 'disabled' });
  assert.deepEqual(payloads[0].response_format, { type: 'json_object' });
  assert.deepEqual(JSON.parse(payloads[0].messages.at(-1).content), window);
});

test('blind review is a single strict Haiku request through its pinned proxy', async t => {
  env(t, { OPENROUTER_API_KEY: 'audit-test-only', HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: undefined, NODE_TLS_REJECT_UNAUTHORIZED: undefined });
  const payloads = [], dispatchers = [], meters = [];
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    payloads.push(JSON.parse(request.body));
    dispatchers.push(request.dispatcher);
    return Response.json({ error: { message: 'rate limit' } }, { status: 429 });
  });
  const models = new Models({ mode: 'real', roles: ['agency_audit'], save: (_raw, meter) => meters.push(meter) });
  t.after(() => models.close());
  await assert.rejects(models.complete({ role: 'agency_audit', turn: 4, call: 1 }, {
    systemPrompt: auditPrompt, messages: [{ role: 'user', content: '[]', timestamp: 1 }],
  }, JSON.parse, auditSchema), error => error.failure?.kind === 'provider_failure' && error.failure.attempt === 1);
  assert.equal(payloads.length, 1);
  assert.ok(dispatchers[0]);
  const body = payloads[0];
  assert.equal(body.model, 'anthropic/claude-haiku-5.5');
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.max_tokens ?? body.max_completion_tokens, 2048);
  assert.deepEqual(body.provider, { only: ['anthropic'], order: ['anthropic'], allow_fallbacks: false, require_parameters: true });
  assert.deepEqual(body.response_format, { type: 'json_schema', json_schema: { name: 'teacharena_agency_audit', strict: true, schema: JSON.parse(JSON.stringify(auditSchema)) } });
  assert.equal(meters[0].proxySource, 'HTTPS_PROXY');
});
