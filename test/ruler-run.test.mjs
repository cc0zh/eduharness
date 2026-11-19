import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const objectHash = value => sha256(JSON.stringify(value));

function fixture(t) {
  const scratch = resolve('.tmp/scratch/ruler-run');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(resolve(scratch, 'run-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invoke = (...args) => spawnSync(process.execPath, ['src/cli.mjs', '--run-root', root, ...args], { encoding: 'utf8' });
  const cli = (...args) => invoke('--scenario', 'ruler-expand', ...args);
  const bytes = path => readFileSync(resolve(root, path));
  const json = path => JSON.parse(bytes(path));
  return { root, invoke, cli, bytes, json };
}

function failCellWrites(root, targets, ...args) {
  const preload = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { basename, dirname } from 'node:path';
    const original = fs.writeFileSync;
    const targets = ${JSON.stringify(targets)};
    fs.writeFileSync = function(path, ...args) {
      if (typeof path === 'string' && basename(path) === 'transcript.json' && targets.includes(basename(dirname(dirname(path))))) {
        throw new Error('cell write fault');
      }
      return original.call(this, path, ...args);
    };
    syncBuiltinESMExports();
  `;
  return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'src/cli.mjs', '--run-root', root, '--scenario', 'ruler-expand', '--phase', 'train', ...args], { encoding: 'utf8' });
}

test('ruler-expand estimates generation and judge-only within the approved training ceilings', t => {
  const { cli } = fixture(t);
  for (const [flags, scenario, typicalCalls, maxCalls, maxOutputTokens] of [
    [['--generate-only'], 'ruler-expand', 120, 396, 1881216],
    [['--judge-only', 'source'], 'ruler-expand-judge-only', 15, 45, 2949120],
  ]) {
    const call = cli('--mode', 'real', '--phase', 'train', '--estimate-only', ...flags);
    assert.equal(call.status, 0, call.stderr);
    assert.deepEqual(JSON.parse(call.stdout), { scenario, typicalCalls, maxCalls, maxOutputTokens });
  }
});

test('the training CLI rejects the unfrozen test phase and arbitrary task selection before a request', t => {
  const { cli, bytes, json } = fixture(t);
  const frozen = cli('--mode', 'real', '--confirm-cost', '--phase', 'test', '--generate-only', '--id', 'blocked');
  assert.equal(frozen.status, 2, frozen.stderr);
  assert.match(JSON.parse(frozen.stdout).failure.detail, /test.*(freez|froz)/i);
  assert.equal(bytes('_receipts/blocked.requests.jsonl').length, 0);
  assert.equal(json('_receipts/blocked.process.json').requestCount, 0);
  const arbitrary = cli('--phase', 'train', '--generate-only', '--task', 'S0-12');
  assert.equal(arbitrary.status, 2, arbitrary.stderr);
  assert.equal(JSON.parse(arbitrary.stdout).failure.kind, 'invalid_input');
});

test('training generation freezes 15 tasks and judge-only keeps scores off stdout', t => {
  const { root, invoke, cli, bytes, json } = fixture(t);
  const train = (...args) => cli('--phase', 'train', ...args);
  const generate = train('--generate-only', '--id', 'source');
  assert.equal(generate.status, 0, generate.stderr);
  const gen = JSON.parse(generate.stdout);
  const manifest = json('source/manifest.json');
  assert.equal(manifest.scenario, 'ruler-expand');
  assert.equal(manifest.phase, 'train');
  assert.equal(manifest.mode, 'offline');
  assert.match(manifest.identity.dataset.trainSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.budget, { typicalCalls: 120, maxCalls: 396, maxOutputTokens: 1881216 });
  const conditions = ['normal', 'answer_dump', 'lecture', 'sycophant_close', 'no_teach'];
  assert.equal(manifest.planned.length, 15);
  assert.equal(new Set(manifest.planned.map(row => row.taskId)).size, 15);
  assert.deepEqual(manifest.planned.map(row => row.condition), Array.from({ length: 15 }, (_, i) => conditions[(i + 4) % 5]));
  assert.ok(gen.cells.every(cell => cell.status === 'execution_success' && !cell.scored && !cell.validTotal));
  const { frozen, identityId, manifestSha256, resultSha256 } = json('_receipts/source.json');
  assert.equal(identityId, manifest.identityId);
  assert.equal(manifestSha256, sha256(bytes('source/manifest.json')));
  assert.equal(resultSha256, sha256(bytes('source/result.json')));
  assert.equal(json('_receipts/source.process.json').evaluationSha256, sha256(bytes('_receipts/source.json')));
  assert.deepEqual(frozen.map(({ taskId, condition }) => ({ taskId, condition })), manifest.planned);
  assert.equal(invoke('--verify-run', 'source').status, 0);
  const openings = new Set();
  for (const { taskId, condition, path, transcriptSha256, messageIds } of frozen) {
    assert.equal(path, `${taskId}/${condition}/transcript.json`);
    const dir = `source/${taskId}/${condition}`;
    const messages = json(`source/${path}`);
    assert.equal(transcriptSha256, sha256(bytes(`source/${path}`)));
    assert.deepEqual(messageIds, messages.map(m => m.id));
    assert.equal(messages.length, 9);
    openings.add(messages[0].text);
    const telemetry = json(`${dir}/telemetry.json`);
    assert.ok(telemetry.length >= 8);
    for (const row of telemetry) {
      assert.equal(row.taskId, taskId);
      assert.equal(row.condition, condition);
      assert.equal(row.pid, manifest.writer.pid);
      assert.notEqual(row.role, 'judge');
      assert.ok(existsSync(resolve(root, 'source', row.attemptPath)));
    }
    assert.equal(existsSync(resolve(root, dir, 'judge.json')), false);
  }
  assert.equal(openings.size, 15);

  const judge = train('--judge-only', 'source', '--id', 'score');
  assert.equal(judge.status, 0, judge.stderr);
  const result = JSON.parse(judge.stdout);
  assert.equal(result.scenario, 'ruler-expand-judge-only');
  assert.equal(result.cells.length, 15);
  assert.ok(result.cells.every(cell => cell.status === 'execution_success' && cell.scored && cell.validTotal));
  assert.doesNotMatch(judge.stdout, /"(?:total|directAnswer|score|groups|reason|failure)"\s*:/);
  assert.ok(json('score/result.json').cells.every(cell => Number.isInteger(cell.total)));
  const graded = json('_receipts/score.json').graded;
  assert.equal(graded.length, 15);
  assert.deepEqual(graded.map(({ taskId, condition }) => ({ taskId, condition })), manifest.planned);
  for (const { taskId, condition, messageIds } of frozen) {
    const dir = `score/${taskId}/${condition}`;
    const judged = json(`${dir}/judge.json`);
    const evidence = graded.find(record => record.taskId === taskId);
    assert.equal(evidence.path, `${taskId}/${condition}/judge.json`);
    assert.equal(evidence.sha256, sha256(bytes(`${dir}/judge.json`)));
    assert.deepEqual(judged.binding.messageIds, messageIds);
    assert.equal(judged.binding.taskId, taskId);
    assert.equal(judged.binding.condition, condition);
    assert.ok(Object.values(judged.groups).some(group => Object.values(group).some(row => Number.isInteger(row.score))));
    const telemetry = json(`${dir}/telemetry.json`);
    assert.deepEqual(telemetry.map(row => row.role), ['judge']);
    const { binding } = json(`score/${telemetry[0].attemptPath}`);
    assert.equal(binding.taskId, taskId);
    assert.equal(binding.condition, condition);
  }

  const last = frozen.at(-1);
  const lastGrade = resolve(root, 'score', graded.at(-1).path);
  const originalGrade = readFileSync(lastGrade);
  rmSync(lastGrade);
  const missingGrade = invoke('--verify-run', 'score');
  assert.equal(missingGrade.status, 1, missingGrade.stdout);
  assert.ok(JSON.parse(missingGrade.stdout).missing.some(name => name.includes('judge.json')));
  writeFileSync(lastGrade, originalGrade);
  const path = resolve(root, 'source', last.path);
  const original = readFileSync(path);
  for (const [id, changed] of [
    ['hash-change', Buffer.concat([original, Buffer.from('\n')])],
    ['out-of-order', JSON.stringify(json(`source/${last.path}`).reverse())],
    ['truncated', original.subarray(0, 20)],
    ['empty', ''],
    ['extra-text', Buffer.concat([original, Buffer.from('extra')])],
  ]) {
    writeFileSync(path, changed);
    const verification = invoke('--verify-run', 'source');
    assert.equal(verification.status, 1, verification.stdout);
    assert.ok(JSON.parse(verification.stdout).invalid.some(name => name.includes('transcript.json')));
    const rejected = train('--judge-only', 'source', '--id', id);
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.equal(JSON.parse(rejected.stdout).failure.kind, 'invalid_input');
    assert.equal(existsSync(resolve(root, id)), false);
    assert.equal(json(`_receipts/${id}.process.json`).requestCount, 0);
    writeFileSync(path, original);
  }
  const receiptPath = resolve(root, '_receipts/source.json');
  const processPath = resolve(root, '_receipts/source.process.json');
  const originalReceipt = readFileSync(receiptPath);
  const originalProcess = readFileSync(processPath);
  const reversed = JSON.parse(original).reverse();
  writeFileSync(path, JSON.stringify(reversed));
  const reanchored = JSON.parse(originalReceipt);
  Object.assign(reanchored.frozen.at(-1), {
    transcriptSha256: sha256(readFileSync(path)),
    messageIds: reversed.map(row => row.id),
  });
  writeFileSync(receiptPath, JSON.stringify(reanchored));
  writeFileSync(processPath, JSON.stringify({ ...JSON.parse(originalProcess), evaluationSha256: sha256(readFileSync(receiptPath)) }));
  const badChronology = train('--judge-only', 'source', '--id', 'bad-chronology');
  assert.equal(badChronology.status, 1, badChronology.stderr);
  assert.match(badChronology.stderr, /message chronology mismatch/);
  assert.equal(existsSync(resolve(root, 'bad-chronology')), false);
  writeFileSync(path, original);
  writeFileSync(receiptPath, originalReceipt);
  writeFileSync(processPath, originalProcess);

  const badMode = train('--mode', 'real', '--confirm-cost', '--judge-only', 'source', '--id', 'bad-mode');
  assert.equal(badMode.status, 1, badMode.stderr);
  assert.match(badMode.stderr, /mode mismatch/);
  assert.equal(json('_receipts/bad-mode.process.json').requestCount, 0);

  writeFileSync(receiptPath, Buffer.concat([readFileSync(receiptPath), Buffer.from('\n')]));
  assert.equal(invoke('--verify-run', 'source').status, 1);
  const rejected = train('--judge-only', 'source', '--id', 'bad-receipt');
  assert.equal(rejected.status, 1, rejected.stderr);
  assert.match(rejected.stderr, /process receipt|evaluation receipt/i);
});

test('a shared generation budget stops at the first unaffordable attempt and retains completed dialogues', t => {
  const { root, cli, json } = fixture(t);
  const call = cli('--phase', 'train', '--generate-only', '--id', 'limited', '--max-requested-output-tokens', '37568');
  assert.equal(call.status, 1, call.stderr);
  const result = json('limited/result.json');
  assert.equal(result.cells.length, 2);
  assert.equal(result.cells[0].status, 'execution_success');
  assert.equal(result.cells[1].failure.kind, 'budget_exhausted');
  const [complete, failed, unstarted] = json('limited/manifest.json').planned;
  assert.equal(json('_receipts/limited.json').frozen.length, 1);
  assert.deepEqual(json(`limited/${failed.taskId}/${failed.condition}/telemetry.json`), []);
  assert.equal(existsSync(resolve(root, 'limited', unstarted.taskId)), false);
  const scored = cli('--phase', 'train', '--judge-only', 'limited', '--id', 'partial-score');
  assert.equal(scored.status, 1, scored.stderr);
  assert.equal(json(`partial-score/${complete.taskId}/${complete.condition}/telemetry.json`)[0].role, 'judge');
  assert.equal(json('partial-score/result.json').cells[0].validTotal, true);
});

test('four failed cells stop generation and block scoring even when another cell froze', t => {
  const { root, cli, json } = fixture(t);
  const { train } = JSON.parse(readFileSync('data/ruler-expand-v1.json', 'utf8'));
  const targets = [0, 2, 3, 4].map(i => train[i]);
  const call = failCellWrites(root, targets, '--id', 'failures', '--generate-only');
  assert.equal(call.status, 1, call.stderr);
  const result = json('failures/result.json');
  assert.deepEqual(result.cells.map(row => row.taskId), train.slice(0, 5));
  assert.deepEqual(result.cells.filter(row => row.failure).map(row => [row.taskId, row.failure.kind]), targets.map(id => [id, 'artifact_io']));
  assert.deepEqual(json('_receipts/failures.json').frozen.map(row => row.taskId), [train[1]]);
  assert.equal(existsSync(resolve(root, 'failures', train[5])), false);
  const judge = cli('--phase', 'train', '--judge-only', 'failures', '--id', 'already-stopped');
  assert.equal(judge.status, 1, judge.stderr);
  assert.equal(JSON.parse(judge.stdout).failure?.kind, 'invalid_input');
  assert.match(judge.stderr, /four distinct failed/i);
  assert.equal(existsSync(resolve(root, 'already-stopped')), false);
});

test('scoring stops at the fourth distinct failure across generation and scoring', t => {
  const { root, json } = fixture(t);
  const { train } = JSON.parse(readFileSync('data/ruler-expand-v1.json', 'utf8'));
  const generate = failCellWrites(root, [train[0], train[2]], '--id', 'source', '--generate-only');
  assert.equal(generate.status, 1, generate.stderr);
  assert.equal(json('source/result.json').cells.length, 15);
  assert.equal(json('_receipts/source.json').frozen.length, 13);

  const score = failCellWrites(root, [train[1], train[4]], '--id', 'score', '--judge-only', 'source');
  assert.equal(score.status, 1, score.stderr);
  assert.deepEqual(json('score/result.json').cells.map(row => [row.taskId, row.status]), [
    [train[1], 'infra_failure'], [train[3], 'execution_success'], [train[4], 'infra_failure'],
  ]);
  assert.equal(existsSync(resolve(root, 'score', train[5])), false);
});

test('real scoring rejects a verified generation source stopped by its budget', t => {
  const { root, cli, json } = fixture(t);
  const generate = cli('--phase', 'train', '--generate-only', '--id', 'source', '--max-attempts', '8');
  assert.equal(generate.status, 1, generate.stderr);
  assert.equal(json('source/result.json').cells.at(-1).failure.kind, 'budget_exhausted');

  const write = (path, row) => {
    const bytes = JSON.stringify(row);
    writeFileSync(resolve(root, path), bytes);
    return sha256(bytes);
  };
  const start = json('_receipts/source.start.json');
  const processReceipt = json('_receipts/source.process.json');
  const evaluation = json('_receipts/source.json');
  const manifest = json('source/manifest.json');
  const result = json('source/result.json');
  for (const row of [start, evaluation, manifest, result, start.parameters.values]) row.mode = 'real';
  start.clean = true;
  manifest.identityId = objectHash({ mode: manifest.mode, scenario: manifest.scenario, identity: manifest.identity });
  evaluation.identityId = manifest.identityId;
  evaluation.manifestSha256 = write('source/manifest.json', manifest);
  evaluation.resultSha256 = write('source/result.json', result);
  processReceipt.startHash = write('_receipts/source.start.json', start);
  processReceipt.evaluationSha256 = write('_receipts/source.json', evaluation);
  write('_receipts/source.process.json', processReceipt);

  const denyFetch = '--import=data:text/javascript,globalThis.fetch%20%3D%20()%20%3D%3E%20%7B%20throw%20Error(%22network%20disabled%22)%3B%20%7D';
  const score = spawnSync(process.execPath, [denyFetch, 'src/cli.mjs', '--run-root', root, '--scenario', 'ruler-expand', '--phase', 'train', '--mode', 'real', '--confirm-cost', '--id', 'blocked-score', '--judge-only', 'source'], {
    encoding: 'utf8', env: { ...process.env, OPENROUTER_API_KEY: 'unused-fixture' },
  });
  assert.equal(score.status, 1, score.stderr);
  assert.equal(JSON.parse(score.stdout).failure?.kind, 'invalid_input');
  assert.match(score.stderr, /budget-stopped generation/i);
  assert.equal(json('_receipts/blocked-score.process.json').requestCount, 0);
  assert.equal(existsSync(resolve(root, 'blocked-score')), false);
});
