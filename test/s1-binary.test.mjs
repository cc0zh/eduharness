import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const cells = ['normal', 'answer_dump', 'lecture', 'sycophant_close', 'no_teach'];
const repetitions = ['r1', 'r2', 'r3'];
const questions = 'M0 M1 M2 M3 S0 S1 S2 S3 A1 A2 P0 P1 P2 P3 R0 R1 R2 V1 V2'.split(' ');

function fixture(t) {
  const scratch = resolve('.tmp/scratch/binary-ruler');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'batch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invoke = (...args) => spawnSync(process.execPath, ['src/cli.mjs', '--run-root', root, ...args], { encoding: 'utf8' });
  const cli = (...args) => invoke('--scenario', 'S1-binary', '--judge-only', 'source', ...args);
  const file = path => join(root, path);
  const json = path => JSON.parse(readFileSync(file(path)));
  return { invoke, cli, file, json };
}

test('S1 preflight enforces the judge-only scope and reports the whole serial batch ceiling', t => {
  const { invoke, cli, file, json } = fixture(t);
  const source = invoke('--scenario', 'E2', '--id', 'source');
  assert.equal(source.status, 0, source.stderr);
  const estimate = cli('--estimate-only', '--id', 'estimate');
  assert.equal(estimate.status, 0, estimate.stderr);
  const values = JSON.parse(estimate.stdout);
  assert.deepEqual([values.typicalCalls, values.maxCalls, values.maxOutputTokens], [15, 45, 2949120]);
  assert.deepEqual(values.source.cells.map(row => row.cell), cells);
  assert.equal(readFileSync(file('_receipts/estimate.requests.jsonl')).length, 0);
  const wrongRealSource = cli('--mode', 'real', '--estimate-only', '--id', 'wrong');
  assert.equal(wrongRealSource.status, 2);
  assert.match(wrongRealSource.stderr, /e2-real-20261119-06/);
  for (const [id, args] of [
    ['missing-source', ['--scenario', 'S1-binary']],
    ['frozen', ['--scenario', 'S1-binary', '--judge-only', 'source', '--phase', 'test', '--freeze', 'e34d8c767ada4a31de5c58016d07d87c2b231ffb']],
    ['arbitrary', ['--scenario', 'S1-binary', '--judge-only', 'source', '--judge-cell', 'normal']],
  ]) {
    const denied = invoke(...args, '--estimate-only', '--id', id);
    assert.equal(denied.status, 2, denied.stderr);
    assert.equal(json(`_receipts/${id}.process.json`).requestCount, 0);
  }
});

test('S1 replays all five dialogues in one process three times with anchored artifacts and a report', t => {
  const { invoke, cli, file, json } = fixture(t);
  const source = invoke('--scenario', 'E2', '--id', 'source');
  assert.equal(source.status, 0, source.stderr);
  const registration = file('preregistration.md');
  const expectations = { answer_dump: { S3: 'Yes', P1: 'Yes', V1: 'No' }, no_teach: { R0: 'No' } };
  const row = parts => `| ${parts.join(' | ')} |`;
  const sourceEstimate = JSON.parse(cli('--estimate-only', '--id', 'source-digests').stdout);
  const registrationBody = [`源 run ID \`source\`。manifest SHA256 \`${sourceEstimate.source.manifestSha256}\`。源身份 \`${sourceEstimate.source.identityId}\`。`,
    ...sourceEstimate.source.cells.map(({ cell, transcriptSha256 }) => row([cell, `\`${transcriptSha256}\``])),
    '## 构造预期答案', row(['条件', ...questions]), row(Array(20).fill('---')),
    ...cells.map(cell => row([cell, ...questions.map(question => expectations[cell]?.[question] ?? '不定')])),
  ].join('\n');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  writeFileSync(registration, registrationBody.replace(sourceEstimate.source.cells[1].transcriptSha256, 'f'.repeat(64)));
  const preflight = (id, digest) => cli('--estimate-only', '--id', id, '--preregistration', registration, '--preregistration-sha256', digest);
  const wrongSource = preflight('estimate-bad-source', hash(readFileSync(registration)));
  assert.equal(wrongSource.status, 2, wrongSource.stderr);
  assert.match(wrongSource.stderr, /preregistration.*source.*answer_dump/i);
  writeFileSync(registration, registrationBody);
  const registrationDigest = hash(readFileSync(registration));
  const wrongDigest = preflight('estimate-bad-reg', '0'.repeat(64));
  assert.equal(wrongDigest.status, 2, wrongDigest.stderr);
  assert.match(wrongDigest.stderr, /preregistration.*digest/i);
  assert.equal(preflight('estimate-good-reg', registrationDigest).status, 0);
  const replay = cli('--id', 'replay', '--preregistration', registration, '--preregistration-sha256', registrationDigest);
  assert.equal(replay.status, 0, replay.stderr);
  const manifest = json('replay/manifest.json');
  const result = json('replay/result.json');
  const start = json('_receipts/replay.start.json');
  const processReceipt = json('_receipts/replay.process.json');
  assert.deepEqual([manifest.identity.ruler, manifest.identity.judgeOutputContract, manifest.identity.version],
    ['e1-binary-v2', 'judge-output-v4', 'evaluation-identity-v4']);
  assert.equal(manifest.identity.preregistrationSha256, registrationDigest);
  assert.equal(manifest.source.ruler, 'e1-numbered-evidence-v3');
  assert.ok(manifest.identity.sources['contracts/judge/binary.mjs']);
  assert.ok(manifest.identity.sources['src/binary-judge.mjs']);
  assert.equal(manifest.writer.pid, start.pid);
  assert.equal(processReceipt.pid, start.pid);
  assert.equal(processReceipt.requestCount, 0);
  assert.deepEqual(result.cells.map(row => [row.repetition, row.id]), repetitions.flatMap(repeat => cells.map(cell => [repeat, cell])));
  assert.equal(result.cells.filter(row => row.validTotal).length, 15);
  for (const repeat of repetitions) for (const cell of cells) {
    const dir = `replay/${repeat}/${cell}`;
    const sourceBytes = readFileSync(file(`source/${cell}/transcript.json`));
    assert.deepEqual(readFileSync(file(`${dir}/transcript.json`)), sourceBytes);
    const judge = json(`${dir}/judge.json`);
    const [entry] = json(`${dir}/telemetry.json`);
    assert.deepEqual([entry.pid, entry.role, entry.repetition, entry.attempt], [start.pid, 'judge', repeat, 1]);
    assert.equal(judge.binding.repetition, repeat);
    assert.equal(judge.binding.sourceRunId, 'source');
    const raw = json(`${dir}/calls/judge-4-1-1.json`);
    assert.doesNotMatch(JSON.stringify(raw.context), /answer_dump|lecture|sycophant_close|no_teach|e1-numbered-evidence-v3|source:m:/);
    const body = JSON.parse(raw.context.messages.at(-1).content);
    assert.deepEqual(Object.keys(body), ['messages']);
    assert.equal(body.messages.length, 9);
  }
  const verify = () => invoke('--verify-run', 'replay');
  const verified = verify();
  assert.equal(verified.status, 0, verified.stdout);
  const report = spawnSync(process.execPath, ['scripts/s1-binary-report.mjs', 'replay', file('')], { encoding: 'utf8' });
  assert.equal(report.status, 0, report.stderr);
  const summary = json('replay/s1-binary-summary.json');
  assert.equal(summary.passed, true);
  assert.equal(json('_receipts/replay.json').passed, true);
  assert.deepEqual(result.assessment, { paired: summary.paired, targetHits: summary.targetHits, ratePasses: summary.ratePasses, passed: true });
  assert.deepEqual(summary.targetHits, { answer_dump: 3, lecture: 3, sycophant_close: 3, no_teach: 3 });
  assert.deepEqual(summary.matrix.total, { tp: 6, fn: 0, fp: 0, tn: 6, missingYes: 0, missingNo: 0 });
  assert.match(readFileSync(file('replay/s1-binary-report.md'), 'utf8'), /Yes prompt=#8/);
  for (const path of ['replay/preregistration.md', 'replay/r1/normal/judge.json', 'replay/r2/lecture/telemetry.json', 'replay/r3/no_teach/calls/judge-4-1-1.json']) {
    const original = readFileSync(file(path));
    appendFileSync(file(path), '\n');
    assert.equal(verify().status, 1, path);
    writeFileSync(file(path), original);
  }
});

test('S1 stops on technical failure and preserves the remaining planned denominator', t => {
  const { invoke, cli, json } = fixture(t);
  assert.equal(invoke('--scenario', 'E2', '--id', 'source').status, 0);
  const replay = cli('--id', 'limited', '--max-attempts', '2');
  assert.equal(replay.status, 1, replay.stderr);
  const result = json('limited/result.json');
  assert.equal(result.acceptance, false);
  assert.equal(result.cells.length, 3);
  assert.equal(result.cells.at(-1).failure.kind, 'budget_exhausted');
  assert.equal(json('limited/manifest.json').planned.length, 15);
  assert.equal(invoke('--verify-run', 'limited').status, 0);
});
