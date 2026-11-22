import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

function fixture(t) {
  const parent = resolve('.tmp/scratch/judge-bakeoff');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'offline-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path => join(root, path);
  const json = path => JSON.parse(readFileSync(file(path)));
  const run = (id, probe, ...flags) => spawnSync(process.execPath, ['test-support/split-batch-fixture.mjs', root, id, probe, ...flags], { encoding: 'utf8' });
  const verify = id => {
    const checked = spawnSync(process.execPath, ['src/cli.mjs', '--run-root', root, '--verify-run', id], { encoding: 'utf8' });
    return JSON.parse(checked.stdout);
  };
  const journal = (id, processIndex) => readFileSync(file(`_receipts/${id}${processIndex === 1 ? '' : `.p${processIndex}`}.requests.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);
  return { file, json, run, verify, journal };
}

test('six independent dimension settlements preserve cross failure and stop sending the exhausted cell', t => {
  const f = fixture(t);
  const run = f.run('cross', 'cross');
  assert.equal(run.status, 1, run.stderr);
  const { cells, crossDimensionFailures } = JSON.parse(run.stdout);
  assert.equal(cells.length, 18);
  assert.equal(crossDimensionFailures, 1);
  assert.equal(cells[0].failure.kind, 'judge_partial_failure');
  assert.equal(cells[0].failure.crossDimension.code, 'S3_P1');
  const reserves = f.journal('cross', 1).filter(event => event.type === 'reserve');
  assert.deepEqual(reserves.filter(e => e.folder === 'r1/normal').map(e => [e.scope.call, e.scope.attempt]), [[1,1], [2,1], [3,1], [4,1], [5,1], [6,1]]);
  assert.deepEqual(reserves.filter(e => e.folder === 'r1/answer_dump').map(e => [e.scope.call, e.scope.attempt]), [[1,1], [1,2], [1,3]]);
  const proof = f.verify('cross');
  assert.equal(proof.verified, true, JSON.stringify(proof));
});

test('a kill at the first successful dimension resumes at the next dimension and verifies the original attempt', t => {
  const f = fixture(t);
  const first = f.run('resume', 'interrupt');
  assert.notEqual(first.status, 0, first.stderr);
  assert.equal(first.stdout, '', first.stderr);
  const before = f.verify('resume');
  assert.equal(before.conclusion, 'unfinished', JSON.stringify(before));
  const raw = 'resume/_processes/1/r1/normal/calls/judge-4-1-1.json';
  const original = readFileSync(f.file(raw));
  const resumed = f.run('resume', 'interrupt', '--resume');
  assert.equal(resumed.status, 0, resumed.stderr);
  const replay = f.verify('resume');
  assert.equal(replay.verified, true, JSON.stringify(replay));
  assert.equal(replay.budget.attempts, 108);
  const attempts = f.journal('resume', 2).filter(e => e.type === 'reserve' && e.folder === 'r1/normal');
  assert.deepEqual(attempts.map(e => [e.scope.call, e.scope.attempt]), [[2,1], [3,1], [4,1], [5,1], [6,1]]);
  assert.deepEqual(readFileSync(f.file(raw)), original);
  assert.equal(Object.values(f.json('resume/r1/normal/judge.json').binding.dimensions)[0].processIndex, 1);
  appendFileSync(f.file(raw), '\n');
  assert.match(f.verify('resume').invalid.join(' '), /r1:normal:judge:4:1:1/);
});

test('a provider streak stops new admissions and verifies the already-started cells at concurrency four', t => {
  const f = fixture(t);
  const run = f.run('provider-stop', 'provider-stop');
  assert.equal(run.status, 1, run.stderr);
  assert.equal(JSON.parse(run.stdout).stop.kind, 'consecutive_provider_failures');
  const journal = f.journal('provider-stop', 1);
  const stop = journal.findIndex(e => e.stop?.kind === 'consecutive_provider_failures');
  assert.ok(stop > 0);
  assert.equal(journal.slice(0, stop).filter(e => e.type === 'settle').length, 2);
  assert.ok(journal.slice(stop + 1).every(e => !['reserve', 'cell_start'].includes(e.type)));
  const proof = f.verify('provider-stop');
  assert.equal(proof.verified, true, JSON.stringify(proof));
  assert.equal(proof.peakInFlight, 4);
});
