import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const decision = 'e34d8c767ada4a31de5c58016d07d87c2b231ffb';
const { test: holdout } = JSON.parse(readFileSync('data/ruler-expand-v1.json'));
const conditions = ['answer_dump', 'lecture', 'sycophant_close', 'no_teach'];
const assigned = holdout.map((taskId, i) => ({ taskId, condition: conditions[i % 4] }));
const trainingIdentity = '2091ec93bf769195672752a836574761244bd7ea1630461e7534416a5bcea7c8';

function fixture(t) {
  const scratch = resolve('.tmp/scratch/ruler-run');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(resolve(scratch, 'holdout-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invoke = (args, preload = '') => spawnSync(process.execPath, [
    `--import=data:text/javascript,${encodeURIComponent(`globalThis.fetch = () => { throw Error('network disabled for test'); };\n${preload}`)}`,
    'src/cli.mjs', '--run-root', root, ...args,
  ], { encoding: 'utf8' });
  const cli = (args, preload) => invoke(['--scenario', 'ruler-expand', '--phase', 'test', ...args], preload);
  const run = (id, flags = [], preload) => cli(['--id', id, '--freeze', decision, ...flags], preload);
  const file = path => resolve(root, path);
  const json = path => JSON.parse(readFileSync(file(path)));
  return { cli, invoke, run, file, json };
}

test('the registered freeze admits only the locked holdout and returns a distinct test identity in preflight', t => {
  const { run, json } = fixture(t);
  const estimate = run('estimate', ['--mode', 'real', '--estimate-only']);
  assert.equal(estimate.status, 0, estimate.stderr);
  const estimateJson = JSON.parse(estimate.stdout);
  assert.equal(estimateJson.typicalCalls, 450);
  assert.equal(estimateJson.maxCalls, 1650);
  assert.equal(estimateJson.maxOutputTokens, 17054400);
  assert.equal(estimateJson.testSha256, '5ba6f198751577c5a622c2c8d748cf2072f566b28001c5ca52524b356b24a3c8');
  assert.deepEqual(estimateJson.sentinelTasks, ['S0-71', 'S0-97', 'S0-73', 'S0-70']);
  assert.match(estimateJson.identityId, /^[a-f\d]{64}$/);
  assert.notEqual(estimateJson.identityId, trainingIdentity);
  assert.equal(json('_receipts/estimate.process.json').requestCount, 0);
  const select = run('select', ['--estimate-only', '--task', 'S0-82']);
  assert.equal(select.status, 2);
  const generate = run('generate', ['--estimate-only', '--generate-only']);
  assert.equal(generate.status, 2);
});

test('holdout denies missing, wrong, malformed and drifted freeze before a request', t => {
  const { run, cli, file, json } = fixture(t);
  const attempt = ['--mode', 'real', '--estimate-only'];
  const absent = cli([...attempt, '--id', 'unfrozen']);
  assert.equal(absent.status, 2);
  assert.match(absent.stderr, /test.*froz|test.*freez/i);
  const wrong = cli([...attempt, '--id', 'wrong', '--freeze', '889fc4bad254f5fcfb813f705643f36bf376ec0e']);
  assert.equal(wrong.status, 2);
  for (const id of ['unfrozen', 'wrong']) assert.equal(json(`_receipts/${id}.process.json`).requestCount, 0);

  for (const [id, needle, replacement] of [
    ['record-absent', 'ruler-freeze.json', null],
    ['record-empty', 'ruler-freeze.json', ''],
    ['record-truncated', 'ruler-freeze.json', '{"decisionCommit":'],
    ['record-extra', 'ruler-freeze.json', '{} extra'],
    ['rubric-drift', '/contracts/judge/schema.mjs', '\n'],
    ['split-drift', '/data/ruler-expand-v1.json', '{}'],
  ]) {
    const deny = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.readFileSync;
      fs.readFileSync = (path, ...args) => {
        if (String(path).replaceAll('\\\\', '/').endsWith(${JSON.stringify(needle)})) {
          const data = ${JSON.stringify(replacement)};
          if (data === null) throw Object.assign(Error('missing'), { code: 'ENOENT' });
          const changed = ${id === 'rubric-drift'} ? Buffer.concat([original(path), Buffer.from(data)]) : Buffer.from(data);
          return args[0] === 'utf8' ? changed.toString('utf8') : changed;
        }
        return original(path, ...args);
      };
      syncBuiltinESMExports();
    `;
    const call = run(id, attempt, deny);
    assert.equal(call.status, 2, `${id}: ${call.stderr}`);
    assert.match(call.stderr, /freez|froz|split/i, id);
    assert.equal(readFileSync(file(`_receipts/${id}.requests.jsonl`)).length, 0);
    assert.equal(json(`_receipts/${id}.process.json`).requestCount, 0);
  }
});

function failCells(targets) {
  return `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { basename, dirname } from 'node:path';
    const original = fs.writeFileSync;
    const targets = ${JSON.stringify(targets)};
    fs.writeFileSync = (path, ...args) => {
      if (typeof path === 'string' && basename(path) === 'transcript.json' && targets.includes(basename(dirname(dirname(path))) + ':' + basename(dirname(path)))) throw Error('cell write fault');
      return original(path, ...args);
    };
    syncBuiltinESMExports();
  `;
}

test('one holdout process scores 50 planned cells in locked order and verifies both kinds of artifacts', t => {
  const { run, invoke, file, json } = fixture(t);
  const batch = run('holdout');
  assert.equal(batch.status, 0, batch.stderr);
  const manifest = json('holdout/manifest.json');
  const result = json('holdout/result.json');
  const expected = [
    ...holdout.map(taskId => ({ taskId, condition: 'normal' })),
    ...assigned.filter(row => row.condition !== 'no_teach'),
    ...assigned.filter(row => row.condition === 'no_teach'),
  ];
  assert.equal(manifest.identity.freeze.decisionCommit, decision);
  assert.equal(manifest.identity.ruler, 'e1-numbered-evidence-v3');
  assert.equal(manifest.identity.judgeOutputContract, 'judge-output-v2');
  assert.notEqual(manifest.identityId, trainingIdentity);
  assert.deepEqual(manifest.planned, expected);
  assert.deepEqual(result.cells.map(({ taskId, condition }) => ({ taskId, condition })), expected);
  assert.ok(result.cells.every(cell => cell.validTotal));
  assert.deepEqual(result.sentinel, { planned: 4, attempted: 4, valid: 4, status: 'passed' });
  assert.doesNotMatch(batch.stdout, /"(?:total|directAnswer|reason)"\s*:/);
  const start = json('_receipts/holdout.start.json');
  assert.equal(start.parameters.values.freeze, decision);
  const { pid } = start;
  assert.equal(manifest.writer.pid, pid);
  const receipt = json('_receipts/holdout.json');
  assert.equal(receipt.frozen.length, 50);
  assert.equal(receipt.graded.length, 50);
  for (const { taskId, condition } of expected) {
    const telemetry = json(`holdout/${taskId}/${condition}/telemetry.json`);
    assert.equal(telemetry.length, 9);
    assert.ok(telemetry.every(row => row.pid === pid));
    assert.equal(telemetry.at(-1).role, 'judge');
  }
  assert.equal(invoke(['--verify-run', 'holdout']).status, 0);
  for (const name of ['transcript.json', 'judge.json']) {
    const path = file(`holdout/${holdout[0]}/normal/${name}`);
    const original = readFileSync(path);
    appendFileSync(path, '\n');
    const verify = invoke(['--verify-run', 'holdout']);
    assert.equal(verify.status, 1, verify.stdout);
    assert.ok(JSON.parse(verify.stdout).invalid.some(label => label.includes(name)));
    writeFileSync(path, original);
  }
});

test('two sentinel failures leave only the last two no_teach cells unstarted', t => {
  const { run, invoke, json } = fixture(t);
  const batch = run('sentinel', [], failCells(['S0-71:no_teach', 'S0-97:no_teach']));
  assert.equal(batch.status, 1, batch.stderr);
  const result = json('sentinel/result.json');
  assert.deepEqual(result.sentinel, { planned: 4, attempted: 4, valid: 2, status: 'insufficient_scores' });
  assert.equal(result.cells.length, 48);
  assert.deepEqual(result.cells.filter(cell => !cell.validTotal).map(cell => cell.taskId), ['S0-71', 'S0-97']);
  assert.equal(invoke(['--verify-run', 'sentinel']).status, 0);
});

test('passing sentinel does not start the rest without the registered remaining ceiling', t => {
  const { run, invoke, json } = fixture(t);
  const batch = run('remaining', ['--max-attempts', '440']);
  assert.equal(batch.status, 1, batch.stderr);
  const result = json('remaining/result.json');
  assert.deepEqual(result.sentinel, { planned: 4, attempted: 4, valid: 4, status: 'insufficient_budget' });
  assert.equal(result.cells.length, 48);
  assert.equal(invoke(['--verify-run', 'remaining']).status, 0);
});

test('the sixth distinct failed question stops the test run without retrying cells', t => {
  const { run, invoke, json } = fixture(t);
  const failed = holdout.slice(0, 6);
  const batch = run('failures', [], failCells(failed.map(taskId => `${taskId}:normal`)));
  assert.equal(batch.status, 1, batch.stderr);
  const result = json('failures/result.json');
  assert.equal(result.stop, 'failure_limit');
  assert.deepEqual(result.cells.map(cell => [cell.taskId, cell.failure?.kind]), failed.map(taskId => [taskId, 'artifact_io']));
  assert.equal(result.sentinel.status, 'not_reached');
  assert.equal(invoke(['--verify-run', 'failures']).status, 0);
});
