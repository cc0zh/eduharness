import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { hash } from '../contracts/core/schema.mjs';
import { binaryQuestions } from '../contracts/judge/binary.mjs';

const scratch = resolve(process.env.RUNNER_EVIDENCE_DIR ?? '.tmp/scratch/runner-concurrency');
const variantOrder = ['normal', 'answer_dump', 'lecture', 'sycophant_close', 'no_teach'];
const planned = [1, 2, 3].flatMap(n => variantOrder.map(variant => `r${n}/${variant}`));

function fixture(t) {
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'offline-'));
  if (!process.env.RUNNER_EVIDENCE_DIR) t.after(() => rmSync(root, { force: true, recursive: true }));
  const nodeArgs = ['--import', './test-support/runner-faux.mjs', 'src/cli.mjs', '--mode=offline', '--run-root', root];
  const invoke = (extra, env = {}) => spawnSync(process.execPath, [...nodeArgs, ...extra], { env: { ...process.env, ...env }, encoding: 'utf8' });
  const file = path => join(root, path);
  const json = path => JSON.parse(readFileSync(file(path)));
  const args = ['--scenario', 'S1-binary', '--judge-only', 'source'];
  const evalRun = (id, flags = [], env) => invoke([...args, '--id', id, ...flags], env);
  const verify = id => {
    const check = spawnSync(process.execPath, ['src/cli.mjs', '--run-root', root, '--verify-run', id], { encoding: 'utf8' });
    return { status: check.status, ...JSON.parse(check.stdout) };
  };
  const source = invoke(['--scenario', 'E2', '--id', 'source']);
  assert.equal(source.status, 0, source.stderr);
  const sourceManifest = readFileSync(file('source/manifest.json'));
  const row = values => `| ${values.join(' | ')} |`;
  const registration = [
    `源 run ID \`source\`，manifest SHA256 \`${hash(sourceManifest)}\`，源身份 \`${JSON.parse(sourceManifest).identityId}\`。`,
    ...variantOrder.map(variant => row([variant, `\`${hash(readFileSync(file(`source/${variant}/transcript.json`)))}\``])),
    '## 构造预期答案', row(['条件', ...Object.keys(binaryQuestions)]), row(Array(20).fill('---')),
    ...variantOrder.map(variant => row([variant, ...Array(19).fill('不定')])),
  ].join('\n');
  writeFileSync(file('fixture-registration.md'), registration);
  const register = (bytes = registration) => ['--preregistration', file('fixture-registration.md'), '--preregistration-sha256', hash(bytes)];
  const journal = (id, processIndex = 1) => readFileSync(file(`_receipts/${id}${processIndex === 1 ? '' : `.p${processIndex}`}.requests.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const summary = (label, result) => {
    if (process.env.RUNNER_EVIDENCE_DIR) {
      writeFileSync(file(`${label}.json`), JSON.stringify(result, null, 2) + '\n');
      t.diagnostic(`${label}: ${root}`);
    }
  };
  return { root, nodeArgs, args, file, json, invoke, evalRun, verify, registration, register, journal, summary };
}

async function interrupted(t, f, id, flags) {
  const child = spawn(process.execPath, [...f.nodeArgs, ...f.args, '--id', id, ...flags], {
    env: { ...process.env, RUNNER_FAUX_PROBE: 'crash' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const exited = once(child, 'exit');
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const ready = await Promise.race([once(child, 'message'), exited.then(() => [])]);
  assert.equal(ready[0], 'second cell in flight', stderr);
  const live = f.evalRun(id, [...flags, '--resume']);
  assert.notEqual(live.status, 0);
  assert.match(live.stderr, /active|still running/);
  assert.equal(existsSync(f.file(`_receipts/${id}.p2.start.json`)), false);
  assert.equal(child.kill('SIGKILL'), true);
  await exited;
  assert.equal(f.verify(id).conclusion, 'unfinished');
}

test('a SIGKILL and same-ID resume preserve the original low ruling and pay even for the interrupted attempt', { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const flags = f.register();
  await interrupted(t, f, 'resume', flags);
  const first = f.file('resume/_processes/1/r1/normal/judge.json');
  const original = readFileSync(first);
  assert.equal(JSON.parse(original).verdict.scoring.points, 0);
  const resume = f.evalRun('resume', [...flags, '--resume', '--concurrency', '3']);
  assert.equal(resume.status, 0, resume.stderr);
  assert.deepEqual(readFileSync(f.file('resume/r1/normal/judge.json')), original);
  assert.deepEqual(readFileSync(first), original);
  assert.deepEqual(JSON.parse(resume.stdout).cells.map(c => `${c.repetition}/${c.id}`), planned);
  const proof = f.verify('resume');
  assert.equal(proof.verified, true, JSON.stringify(proof));
  assert.equal(proof.status, 0);
  assert.deepEqual(proof.processes.map(p => [p.processIndex, p.interrupted, p.cells.length]), [[1, true, 1], [2, false, 14]]);
  assert.equal(proof.budget.attempts, 16);
  assert.equal(proof.budget.requestedOutputTokens, 16 * 65_536);
  assert.equal(proof.requestCount, 0);
  assert.ok(!f.journal('resume', 2).some(e => e.type === 'reserve' && e.callId.includes('r1:normal:')));
  f.summary('resume-proof', proof);
  const report = spawnSync(process.execPath, ['scripts/s1-binary-report.mjs', 'resume', f.root], { encoding: 'utf8' });
  assert.equal(report.status, 0, report.stderr);
  assert.equal(f.json('resume/s1-binary-summary.json').usage.attempts, 16);
  const raw = f.file('resume/_processes/1/r1/normal/calls/judge-4-1-1.json');
  const rawBytes = readFileSync(raw);
  try {
    appendFileSync(raw, '\n');
    assert.match(f.verify('resume').invalid.join(' '), /r1:normal:judge:4:1:1/);
  } finally { writeFileSync(raw, rawBytes); }
});

test('resume refuses changed HEAD, source, identity or preregistration without opening a new process', t => {
  const f = fixture(t);
  const launch = f.evalRun('pinned', [...f.register(), '--max-attempts', '2']);
  assert.equal(launch.status, 1, launch.stderr);
  const base = [...f.register(), '--resume', '--max-attempts', '2'];
  for (const [hint, flags, env] of [
    [/HEAD/, base, { RUNNER_HEAD_DRIFT: '1' }],
    [/source.*s1-binary|source.*hash/i, base, { RUNNER_SOURCE_DRIFT: '1' }],
    [/identity|limits|budget/i, [...base, '--max-attempts', '3']],
  ]) {
    const rejected = f.evalRun('pinned', flags, env);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, hint);
  }
  const changed = f.registration + '\n';
  writeFileSync(f.file('fixture-registration.md'), changed);
  const rejected = f.evalRun('pinned', [...f.register(changed), '--resume', '--max-attempts', '2']);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /preregistration.*(?:changed|mismatch|differs)/i);
  assert.equal(existsSync(f.file('_receipts/pinned.p2.start.json')), false);
});

async function killAt(t, f, id, probe, flags = []) {
  const child = spawn(process.execPath, [...f.nodeArgs, ...f.args, '--id', id, ...flags], {
    env: { ...process.env, RUNNER_FAUX_PROBE: probe }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const exited = once(child, 'exit');
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  assert.equal((await Promise.race([once(child, 'message'), exited.then(() => [])]))[0], 'crash point', stderr);
  assert.equal(child.kill('SIGKILL'), true);
  await exited;
}

test('resume can recover an original identity when the process was killed immediately after claiming the ID', { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const flags = f.register();
  await killAt(t, f, 'early', 'kill-after-start', flags);
  const before = f.verify('early');
  assert.equal(before.conclusion, 'unfinished');
  assert.equal(before.budget?.attempts, 0);
  assert.equal(existsSync(f.file('early/manifest.json')), false);
  const drift = f.evalRun('early', [...flags, '--resume'], { RUNNER_SOURCE_DRIFT: '1' });
  assert.match(drift.stderr, /source hash differs/);
  assert.equal(existsSync(f.file('_receipts/early.p2.start.json')), false);
  const resumed = f.evalRun('early', [...flags, '--resume']);
  assert.equal(resumed.status, 0, resumed.stderr);
  const proof = f.verify('early');
  assert.equal(proof.verified, true, JSON.stringify(proof));
  assert.deepEqual(proof.processes.map(p => p.cells.length), [0, 15]);
});

test('a kill at the successful judge settlement cannot reopen that judgement', { timeout: 15_000 }, async t => {
  const f = fixture(t);
  await killAt(t, f, 'settlement', 'kill-after-settlement');
  const before = f.verify('settlement');
  assert.equal(before.conclusion, 'unfinished');
  assert.deepEqual(before.processes[0].cells, ['r1/normal']);
  const resumed = f.evalRun('settlement', ['--resume']);
  assert.equal(resumed.status, 0, resumed.stderr);
  const verified = f.verify('settlement');
  assert.equal(verified.verified, true);
  assert.equal(verified.budget.attempts, 15);
  assert.deepEqual(verified.processes.map(p => p.cells.length), [1, 14]);
});

test('verification cannot downgrade a new-format run with missing original directories and malformed manifest', t => {
  const f = fixture(t);
  const bytes = readFileSync(f.file('source/manifest.json'));
  rmSync(f.file('source/_processes'), { recursive: true });
  rmSync(f.file('_receipts/source.p1.evaluation.json'));
  writeFileSync(f.file('source/manifest.json'), bytes.subarray(0, 30));
  const proof = f.verify('source');
  assert.equal(proof.status, 1);
  assert.equal(proof.conclusion, 'invalid');
  assert.equal(proof.invalid.length, 1);
});

test('resume spends only the original balance and still cannot rerun a successful cell', { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const flags = ['--max-attempts', '15', '--max-requested-output-tokens', String(15 * 65_536)];
  await interrupted(t, f, 'balance', flags);
  const resumed = f.evalRun('balance', [...flags, '--resume', '--concurrency', '3']);
  assert.equal(resumed.status, 1, resumed.stderr);
  const proof = f.verify('balance');
  assert.equal(proof.verified, true, JSON.stringify(proof));
  assert.equal(proof.budget.attempts, 15);
  assert.equal(proof.budget.requestedOutputTokens, 15 * 65_536);
  assert.equal(proof.processes[1].stop.kind, 'budget_exhausted');
  assert.equal(JSON.parse(resumed.stdout).cells.filter(c => c.validTotal).length, 14);
  f.summary('balance-proof', proof);
});

test('concurrency=3 enforces the attempts and token caps while active calls settle', t => {
  const f = fixture(t);
  for (const [id, flag, cap] of [['calls', '--max-attempts', '2'], ['tokens', '--max-requested-output-tokens', String(2 * 65_536)]]) {
    const run = f.evalRun(id, ['--concurrency', '3', flag, cap], { RUNNER_FAUX_PROBE: 'delays' });
    assert.equal(run.status, 1, run.stderr);
    const proof = f.verify(id);
    assert.equal(proof.verified, true, JSON.stringify(proof));
    assert.equal(proof.budget.attempts, 2);
    assert.equal(proof.budget.requestedOutputTokens, 2 * 65_536);
    assert.equal(proof.peakInFlight, 2);
    assert.equal(proof.processes[0].stop.kind, 'budget_exhausted');
    assert.deepEqual(JSON.parse(run.stdout).cells.map(c => [`${c.repetition}/${c.id}`, c.validTotal]), [
      ['r1/normal', true], ['r1/answer_dump', true], ['r1/lecture', false],
    ]);
    f.summary(`${id}-proof`, proof);
  }
});

test('concurrent E2 generation keeps each cell serial and replays all five rulings in plan order', t => {
  const f = fixture(t);
  const result = f.invoke(['--scenario', 'E2', '--id', 'e2-concurrent', '--concurrency', '3']);
  assert.equal(result.status, 0, result.stderr);
  const proof = f.verify('e2-concurrent');
  assert.equal(proof.verified, true, JSON.stringify(proof));
  assert.equal(proof.peakInFlight, 3);
  assert.deepEqual(JSON.parse(result.stdout).cells.map(row => row.id), variantOrder);
  for (const id of variantOrder) {
    const ledger = f.json(`e2-concurrent/${id}/telemetry.json`);
    assert.ok(ledger.slice(1).every((row, i) => ledger[i].turn <= row.turn));
    assert.equal(ledger.at(-1).role, 'judge');
  }
});

test('a faux 429 reduces 3 to 2, costs budget, and leaves two ordinary recovery retries available', t => {
  const f = fixture(t);
  const run = f.evalRun('rate', ['--concurrency=3'], { RUNNER_FAUX_PROBE: 'rate' });
  assert.equal(run.status, 0, run.stderr);
  const proof = f.verify('rate');
  assert.equal(proof.verified, true, JSON.stringify(proof));
  assert.equal(proof.peakInFlight, 3);
  assert.equal(proof.budget.attempts, 18);
  assert.deepEqual(proof.processes[0].downshifts.map(p => [p.from, p.to, p.callId]), [[3, 2, 'r1:normal:judge:4:1:1']]);
  const events = f.journal('rate');
  const after = events.findIndex(e => e.downshift?.to === 2);
  assert.ok(after >= 0);
  assert.ok(events.slice(after + 1).filter(e => e.type === 'reserve').every(e => e.inFlight <= 2));
  assert.deepEqual(JSON.parse(run.stdout).cells.map(c => `${c.repetition}/${c.id}`), planned);
  f.summary('rate-proof', proof);
});

test('third ordinary failure stops new attempts but keeps other in-flight originals and can resume failures', t => {
  const f = fixture(t);
  const run = f.evalRun('stop', ['--concurrency=3'], { RUNNER_FAUX_PROBE: 'stop' });
  assert.equal(run.status, 1, run.stderr);
  const proof = f.verify('stop');
  assert.equal(proof.verified, true, JSON.stringify(proof));
  assert.equal(proof.budget.attempts, 5);
  assert.equal(proof.peakInFlight, 3);
  assert.equal(proof.processes[0].stop.kind, 'call_retries_exhausted');
  assert.match(proof.processes[0].stop.callId, /r1:normal:judge:4:1:3$/);
  const cells = JSON.parse(run.stdout).cells;
  assert.deepEqual(cells.map(c => [c.id, c.validTotal]), [['normal', false], ['answer_dump', true], ['lecture', false]]);
  const preserved = readFileSync(f.file('stop/r1/answer_dump/judge.json'));
  const resumed = f.evalRun('stop', ['--resume']);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.deepEqual(readFileSync(f.file('stop/r1/answer_dump/judge.json')), preserved);
  const after = f.verify('stop');
  assert.equal(after.verified, true, JSON.stringify(after));
  assert.equal(after.budget.attempts, 19);
  assert.equal(after.processes[1].cells.length, 14);
});

test('a complete run with a failed direction check does not redraw on resume', t => {
  const f = fixture(t);
  const first = f.evalRun('low', [], { RUNNER_FAUX_PROBE: 'low' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).assessment.passed, false);
  const proof = f.verify('low');
  assert.equal(proof.verified, true, JSON.stringify(proof));
  assert.equal(proof.budget.attempts, 15);
  assert.equal(f.json('low/r1/normal/judge.json').verdict.scoring.rate, 0);
  const resumed = f.evalRun('low', ['--resume']);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.deepEqual(JSON.parse(resumed.stdout), JSON.parse(first.stdout));
  assert.equal(f.verify('low').budget.attempts, 15);
});

test('CLI accepts concurrency only in the inclusive range 1..5 and requires an explicit resume ID', t => {
  const f = fixture(t);
  for (const value of ['0', '6', '-1', '1.5', 'NaN']) {
    const bad = f.evalRun('invalid', ['--concurrency=' + value]);
    assert.equal(bad.status, 2, bad.stderr);
    assert.match(bad.stderr, /invalid --concurrency.*1.*5/);
  }
  const noId = spawnSync(process.execPath, [...f.nodeArgs, ...f.args, '--resume'], { encoding: 'utf8' });
  assert.equal(noId.status, 2, noId.stderr);
  assert.match(noId.stderr, /--resume.*--id/);
});
