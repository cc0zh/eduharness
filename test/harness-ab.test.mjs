import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { hash } from '../contracts/core/schema.mjs';

const draw = ['S0-76', 'S0-43', 'S0-63', 'S0-62', 'S0-51', 'S0-48', 'S0-70', 'S0-60', 'S0-73', 'S0-20'];
const freeze = 'e34d8c767ada4a31de5c58016d07d87c2b231ffb';
const preregistration = 'bdc17d6a32e46df8664d338cc6b976bc3adb41b348cf914114d011da32037967';
const rhetoric = ' I let you work it out and verify it yourself, so you have mastered it.';

function fixture(t) {
  const scratch = resolve('.tmp/scratch/harness-ab');
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, 'fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = side => join(dir, side);
  const invoke = (...args) => spawnSync(process.execPath, ['src/cli.mjs', ...args], { encoding: 'utf8' });
  const run = (side, ...args) => invoke('--scenario', 'ruler-expand', '--phase', 'ab', '--freeze', freeze, '--harness', side,
    '--run-root', root(side), '--id', side, ...(side === 'rhetoric' ? ['--judge-only', 'baseline', '--source-root', root('baseline')] : []), ...args);
  const read = (side, path) => JSON.parse(readFileSync(join(root(side), path)));
  return { root, invoke, run, read };
}

test('the baseline is unchanged and the candidate replaces only the third and fourth teacher goals', t => {
  const { run, read } = fixture(t);
  const expectedGoals = [
    'Elicit the misconception.',
    'Offer a targeted hint.',
    'Hand the calculation back.',
    'Ask for independent conceptual verification.',
  ];
  const expectedCandidateGoals = [
    ...expectedGoals.slice(0, 2),
    'Let the learner choose the next method or self-check. Ask them to carry it out and explain why it works or what the result means. Do not supply the method or intermediate steps.',
    'If the learner was stuck with the current representation, switch to a genuinely different representation of the same idea. Ask the learner to use it independently and explain how it maps to the original idea. Do not demonstrate the solution. If there was no such difficulty, ask for independent conceptual verification.',
  ];
  for (const side of ['baseline', 'improved']) {
    const evaluated = run(side);
    assert.equal(evaluated.status, 0, evaluated.stderr);
    const manifest = read(side, `${side}/manifest.json`);
    assert.deepEqual(manifest.planned, draw.map(taskId => ({ taskId, condition: 'normal' })));
    assert.equal(manifest.identity.harness.preregistrationSha256, preregistration);
    const base = `${side}/${draw[0]}/normal`;
    const contexts = [1, 2, 3, 4].map(turn => read(side, `${base}/calls/teacher-${turn}-1-1.json`).context);
    const goals = contexts.map(context => context.messages.filter(message => message.sections?.goal).at(-1)?.sections.goal);
    assert.deepEqual(goals, side === 'baseline' ? expectedGoals : expectedCandidateGoals);
    const messages = read(side, `${base}/transcript.json`);
    assert.deepEqual(messages.map(({ id, role, turn }) => [id, role, turn]), Array.from({ length: 9 }, (_, i) => [
      `${side}:${draw[0]}:normal:m:${i + 1}`, i % 2 ? 'teacher' : 'learner', Math.ceil(i / 2),
    ]));
    const view = JSON.parse(read(side, `${base}/calls/judge-4-1-1.json`).context.messages.at(-1).content);
    assert.equal(view.late_third_start, 7);
    assert.deepEqual(view.messages.map(message => message.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(read(side, `${base}/judge.json`).binding.messageIds, messages.map(message => message.id));
    assert.ok(read(side, `${base}/telemetry.json`).every(row => row.pid === manifest.writer.pid));
  }
  const original = read('baseline', 'baseline/manifest.json');
  const changed = read('improved', 'improved/manifest.json');
  assert.notEqual(original.identityId, changed.identityId);
  const fixed = ({ harness: _harness, ...identity }) => identity;
  assert.deepEqual(fixed(original.identity), fixed(changed.identity));
});

test('rhetoric only appends the registered sentence to the exact baseline teacher #8', t => {
  const { root, run, read, invoke } = fixture(t);
  const base = run('baseline');
  assert.equal(base.status, 0, base.stderr);
  const input = join(root('baseline'), 'baseline', draw[0], 'normal', 'transcript.json');
  const originalBytes = readFileSync(input);
  const control = run('rhetoric');
  assert.equal(control.status, 0, control.stderr);
  assert.deepEqual(readFileSync(input), originalBytes);
  const manifest = read('rhetoric', 'rhetoric/manifest.json');
  assert.notEqual(manifest.identityId, read('baseline', 'baseline/manifest.json').identityId);
  assert.equal(manifest.identity.dialogueSource.runId, 'baseline');
  assert.equal(read('rhetoric', '_receipts/rhetoric.start.json').parameters.values.harness, 'rhetoric');
  for (const taskId of draw) {
    const original = read('baseline', `baseline/${taskId}/normal/transcript.json`);
    const copy = read('rhetoric', `rhetoric/${taskId}/normal/transcript.json`);
    assert.deepEqual(copy, original.map((message, i) => ({ ...message,
      id: `rhetoric:${taskId}:normal:m:${i + 1}`,
      text: i === 7 ? message.text + rhetoric : message.text,
    })));
    const view = JSON.parse(read('rhetoric', `rhetoric/${taskId}/normal/calls/judge-4-1-1.json`).context.messages.at(-1).content);
    assert.equal(view.late_third_start, 7);
    assert.deepEqual(view.messages, copy.map(({ role, text }, i) => ({ n: i + 1, role, text })));
    assert.deepEqual(read('rhetoric', `rhetoric/${taskId}/normal/telemetry.json`).map(row => [row.role, row.pid]), [['judge', manifest.writer.pid]]);
  }
  const verify = side => invoke('--verify-run', side, '--run-root', root(side));
  for (const side of ['baseline', 'rhetoric']) assert.equal(verify(side).status, 0);
  writeFileSync(input, Buffer.concat([originalBytes, Buffer.from(' trailing text')]));
  assert.equal(verify('baseline').status, 1);
  const rejected = run('rhetoric', '--id', 'bad-source');
  assert.equal(rejected.status, 2, rejected.stderr);
  assert.match(rejected.stderr, /baseline|transcript/i);
});

test('A/B admission and real estimates use the locked scope and send no requests', t => {
  const { root, run, read, invoke } = fixture(t);
  for (const [side, typicalCalls, maxCalls, maxOutputTokens] of [
    ['baseline', 90, 390, 3728640], ['improved', 90, 390, 3728640], ['rhetoric', 10, 30, 1966080],
  ]) {
    const estimate = run(side, '--id', 'estimate', '--mode', 'real', '--estimate-only');
    assert.equal(estimate.status, 0, estimate.stderr);
    const output = JSON.parse(estimate.stdout);
    assert.deepEqual([output.typicalCalls, output.maxCalls, output.maxOutputTokens], [typicalCalls, maxCalls, maxOutputTokens]);
    assert.equal(output.harness.side, side);
    assert.deepEqual(output.taskIds, draw);
    assert.equal(read(side, '_receipts/estimate.process.json').requestCount, 0);
  }
  for (const [id, args] of [
    ['missing-cost', ['--mode', 'real']],
    ['bad-freeze', ['--estimate-only', '--freeze', 'wrong']],
    ['bad-side', ['--estimate-only', '--harness', 'other']],
    ['bad-count', ['--estimate-only', '--max-attempts', '391']],
    ['generate-only', ['--estimate-only', '--generate-only']],
    ['replay-improved', ['--estimate-only', '--judge-only', 'source', '--source-root', root('baseline')]],
  ]) {
    const denied = run('baseline', '--id', id, ...args);
    assert.equal(denied.status, 2, denied.stderr);
    assert.equal(read('baseline', `_receipts/${id}.process.json`).requestCount, 0);
  }
  const noSource = invoke('--scenario', 'ruler-expand', '--phase', 'ab', '--harness', 'rhetoric', '--freeze', freeze,
    '--id', 'no-source', '--run-root', root('rhetoric'), '--estimate-only');
  assert.equal(noSource.status, 2);
  const shared = run('rhetoric', '--id', 'shared', '--source-root', root('rhetoric'));
  assert.equal(shared.status, 2, shared.stderr);
  assert.match(shared.stderr, /root/i);
});

test('cross-root comparison keeps failed and unstarted pairs and rejects identity drift', t => {
  const { root, run, read } = fixture(t);
  for (const side of ['baseline', 'improved', 'rhetoric']) {
    const call = run(side);
    assert.equal(call.status, 0, call.stderr);
  }
  const limited = run('improved', '--id', 'limited', '--max-attempts', '13');
  assert.equal(limited.status, 1, limited.stderr);
  assert.equal(JSON.parse(limited.stdout).stop, 'budget_exhausted');

  const compare = (id = 'improved', ...extra) => spawnSync(process.execPath, ['scripts/harness-ab-compare.mjs',
    '--baseline-root', root('baseline'), '--baseline-id', 'baseline', '--improved-root', root('improved'), '--improved-id', id,
    '--rhetoric-root', root('rhetoric'), '--rhetoric-id', 'rhetoric', ...extra], { encoding: 'utf8' });
  const call = compare();
  assert.equal(call.status, 0, call.stderr);
  const result = JSON.parse(call.stdout);
  assert.equal(result.mode, 'offline');
  assert.deepEqual(result.tasks.map(row => row.taskId), draw);
  assert.deepEqual(result.auditTaskIds, draw.slice(0, 5));
  assert.equal(result.sides.rhetoric.requestCount, 0);
  assert.equal(result.sides.rhetoric.pid, read('rhetoric', '_receipts/rhetoric.start.json').pid);
  assert.equal(result.comparisons.rhetoric.meetsScoreExpectation, true);
  for (const comparison of Object.values(result.comparisons)) {
    assert.deepEqual(comparison.metrics.total, { planned: 10, n: 10, families: 9, mean: 0, ci95: [0, 0] });
  }
  assert.notEqual(compare('limited').status, 0, 'generation sides must use identical limits');
  assert.notEqual(compare('improved', '--rhetoric-root', root('baseline')).status, 0);

  function rewriteSide(side, change) {
    const out = (path, data) => {
      const bytes = `${JSON.stringify(data)}\n`;
      writeFileSync(join(root(side), path), bytes);
      return hash(bytes);
    };
    const evaluation = read(side, `_receipts/${side}.json`);
    const manifest = read(side, `${side}/manifest.json`);
    const result = read(side, `${side}/result.json`);
    const processReceipt = read(side, `_receipts/${side}.process.json`);
    change({ manifest, result, evaluation, processReceipt });
    manifest.identityId = hash({ mode: manifest.mode, scenario: manifest.scenario, identity: manifest.identity });
    evaluation.identityId = manifest.identityId;
    evaluation.manifestSha256 = out(`${side}/manifest.json`, manifest);
    evaluation.resultSha256 = out(`${side}/result.json`, result);
    processReceipt.evaluationSha256 = out(`_receipts/${side}.json`, evaluation);
    out(`_receipts/${side}.process.json`, processReceipt);
  }

  rewriteSide('improved', ({ result, evaluation, processReceipt }) => {
    const limitedResult = read('improved', 'limited/result.json');
    const failure = limitedResult.cells.at(-1).failure;
    const { taskId, condition } = failure;
    result.cells = [result.cells[0], { taskId, condition, id: condition, recorded: true, status: 'infra_failure', scored: false, validTotal: false, total: null, failure }];
    result.stop = limitedResult.stop;
    result.acceptance = evaluation.acceptance = processReceipt.acceptance = false;
    processReceipt.exitCode = 1;
    evaluation.frozen = evaluation.frozen.slice(0, 1);
    evaluation.graded = evaluation.graded.slice(0, 1);
  });
  const partial = compare();
  assert.equal(partial.status, 0, partial.stderr);
  const partialResult = JSON.parse(partial.stdout);
  assert.deepEqual(partialResult.comparisons.improved.metrics.total, { planned: 10, n: 1, families: 1, mean: 0, ci95: null });
  assert.equal(partialResult.tasks[1].sides.improved.failure.kind, 'budget_exhausted');
  assert.equal(partialResult.tasks[2].sides.improved.status, 'not_run');
  assert.equal(partialResult.tasks[1].delta.improved.agency_handoff, null);

  const stopped = compare('improved', '--rhetoric-root', root('never-started'));
  assert.equal(stopped.status, 0, stopped.stderr);
  const stoppedResult = JSON.parse(stopped.stdout);
  assert.deepEqual(stoppedResult.comparisons.improved, partialResult.comparisons.improved);
  assert.equal(stoppedResult.sides.rhetoric.status, 'not_run');
  assert.equal(stoppedResult.comparisons.rhetoric.meetsScoreExpectation, null);
  assert.ok(stoppedResult.tasks.every(row => row.sides.rhetoric.status === 'not_run' && row.delta.rhetoric.total === null));
  assert.equal(result.sides.rhetoric.requestedOutputTokens, 0);
  assert.equal(result.sides.rhetoric.recordedReservedOutputTokens, 10 * 65536);

  rewriteSide('improved', ({ manifest }) => { manifest.identity.dataset.policySha256 = 'f'.repeat(64); });
  const drift = compare();
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /identity changed/i);
});

test('paired confidence intervals resample whole topic families and report insufficient data', async () => {
  const { pairedEstimate } = await import('../scripts/harness-ab-compare.mjs');
  const estimate = pairedEstimate([{ family: 'a', delta: 2 }, { family: 'a', delta: 2 }, { family: 'b', delta: -1 }], 10);
  assert.deepEqual(estimate, { planned: 10, n: 3, families: 2, mean: 1, ci95: [-1, 2] });
  assert.deepEqual(pairedEstimate([], 10), { planned: 10, n: 0, families: 0, mean: null, ci95: null });
});
