import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { startRunReceipt, trackedFetch } from '../src/run-receipts.mjs';

const cli = (...args) => spawnSync(process.execPath, ['src/cli.mjs', ...args], { encoding: 'utf8' });
const childProbe = `
  import { installRunReceiptHandlers, startRunReceipt } from './src/run-receipts.mjs';
  const recorder = startRunReceipt({ root: process.argv[1], id: process.argv[2], mode: 'offline', argv: [] });
  installRunReceiptHandlers(recorder);
  process.on('message', action => {
    if (action === 'throw') throw new Error('fixture exception');
    process.emit(action);
  });
  process.send('ready');
`;

async function readyChild(t, root, id) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', childProbe, root, id], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const exited = once(child, 'exit');
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await Promise.race([
    once(child, 'message', { signal: AbortSignal.timeout(5000) }),
    exited.then(() => { throw Error('child exited before ready'); }),
  ]);
  return { child, exited };
}

test('every CLI run leaves a verifiable process receipt beside its startup record', t => {
  const root = mkdtempSync(resolve('.tmp/scratch/run-receipts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = cli('--run-root', root, '--id', 'success');
  assert.equal(run.status, 0, run.stderr);

  const startPath = resolve(root, '_receipts/success.start.json');
  const receiptPath = resolve(root, '_receipts/success.process.json');
  assert.equal(existsSync(startPath), true, 'startup record missing');
  assert.equal(existsSync(receiptPath), true, 'process receipt missing');
  const start = JSON.parse(readFileSync(startPath, 'utf8'));
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(start.runId, 'success');
  assert.equal(start.mode, 'offline');
  assert.equal(start.head.length, 40);
  assert.equal(typeof start.clean, 'boolean');
  assert.equal(typeof start.pid, 'number');
  assert.ok(start.startedAt);
  assert.equal(receipt.runId, 'success');
  assert.equal(receipt.head, start.head);
  assert.equal(receipt.exitCode, run.status);
  assert.equal(receipt.requestCount, 0);
  assert.equal(receipt.acceptance, true);

  const verified = cli('--run-root', root, '--verify-run', 'success');
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).verified, true);
});

test('CLI input failure receives a process receipt', t => {
  const root = mkdtempSync(resolve('.tmp/scratch/run-receipts-fail-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invalid = cli('--run-root', root, '--id', 'invalid', '--unknown-option=credential-canary');
  assert.equal(invalid.status, 2);
  const receiptPath = resolve(root, '_receipts/invalid.process.json');
  assert.equal(existsSync(receiptPath), true, 'input failure process receipt missing');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.exitCode, 2);
  assert.doesNotMatch(readFileSync(resolve(root, '_receipts/invalid.start.json'), 'utf8'), /credential-canary/);
});

test('a caught execution failure and a pre-request preflight failure both write exit status', t => {
  const root = mkdtempSync(resolve('.tmp/scratch/run-receipts-errors-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const failed = cli('--run-root', root, '--id', 'execution-failure', '--judge-only', 'missing');
  assert.equal(failed.status, 1);
  const receipt = JSON.parse(readFileSync(resolve(root, '_receipts/execution-failure.process.json'), 'utf8'));
  assert.equal(receipt.exitCode, 1);
  assert.equal(receipt.requestCount, 0);

  const preflight = cli('--run-root', root, '--id', 'preflight-failure', '--max-attempts', '0');
  assert.equal(preflight.status, 2);
  const denied = JSON.parse(readFileSync(resolve(root, '_receipts/preflight-failure.process.json'), 'utf8'));
  assert.equal(denied.exitCode, 2);
  assert.equal(denied.requestCount, 0);
});

test('run verification rejects missing receipts and contradictory request counts', t => {
  const root = mkdtempSync(resolve('.tmp/scratch/run-receipts-verify-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const missing = cli('--run-root', root, '--verify-run', 'legacy');
  assert.equal(missing.status, 1);
  assert.deepEqual(JSON.parse(missing.stdout).missing, ['startup record', 'process receipt', 'request log']);

  const run = cli('--run-root', root, '--id', 'estimate', '--mode', 'real', '--estimate-only');
  assert.equal(run.status, 0, run.stderr);
  const receiptPath = resolve(root, '_receipts/estimate.process.json');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  receipt.requestCount = 1;
  writeFileSync(receiptPath, JSON.stringify(receipt));
  const contradicted = cli('--run-root', root, '--verify-run', 'estimate');
  assert.equal(contradicted.status, 1);
  assert.match(JSON.stringify(JSON.parse(contradicted.stdout).invalid), /requestCount differs/);
});

test('an estimate cannot claim a historical run ID', t => {
  const root = mkdtempSync(resolve('.tmp/scratch/run-receipts-legacy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const original = cli('--run-root', root, '--id', 'legacy');
  assert.equal(original.status, 0, original.stderr);
  for (const name of ['start.json', 'requests.jsonl', 'process.json']) rmSync(resolve(root, `_receipts/legacy.${name}`));
  const estimate = cli('--run-root', root, '--id', 'legacy', '--estimate-only');
  assert.equal(estimate.status, 1);
  assert.equal(JSON.parse(estimate.stdout).failure.kind, 'run_conflict');
  assert.equal(existsSync(resolve(root, '_receipts/legacy.start.json')), false);
});

test('each actual fetch attempt is append-logged before and after response or failure', async t => {
  const root = mkdtempSync(resolve('.tmp/scratch/run-receipts-fetch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const recorder = startRunReceipt({ root, id: 'fetch', mode: 'real', argv: ['--mode', 'real', '--id', 'fetch'] });
  const observedAtServer = [];
  const server = createServer((request, response) => {
    observedAtServer.push(readFileSync(recorder.requestPath, 'utf8').trim().split('\n').map(JSON.parse).at(-1).type);
    if (request.url === '/drop') request.socket.destroy();
    else { response.writeHead(201); response.end('ok'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await trackedFetch(globalThis.fetch, recorder, 'fetch:teacher:1:1:1')(`${base}/ok`)).status, 201);
  await assert.rejects(trackedFetch(globalThis.fetch, recorder, 'fetch:teacher:1:1:2')(`${base}/drop`));
  assert.deepEqual(observedAtServer, ['request_start', 'request_start']);
  const lines = readFileSync(recorder.requestPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map(row => row.type), ['request_start', 'request_end', 'request_start', 'request_end']);
  assert.deepEqual(lines.map(row => row.callId), ['fetch:teacher:1:1:1', 'fetch:teacher:1:1:1', 'fetch:teacher:1:1:2', 'fetch:teacher:1:1:2']);
  assert.equal(lines[1].status, 201);
  assert.equal(lines[3].error, 'transport_failure');
  recorder.finish({ exitCode: 1 });
  const verified = cli('--run-root', root, '--verify-run', 'fetch');
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).observedRequestCount, 2);
});

test('SIGINT, SIGTERM, and an uncaught exception write process receipts', async t => {
  const root = mkdtempSync(resolve('.tmp/scratch/run-receipts-signals-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [id, action, expected] of [['interrupted', 'SIGINT', 130], ['terminated', 'SIGTERM', 143], ['exception', 'throw', 1]]) {
    const { child, exited } = await readyChild(t, root, id);
    child.send(action);
    const [code] = await exited;
    assert.equal(code, expected);
    const receipt = JSON.parse(readFileSync(resolve(root, `_receipts/${id}.process.json`), 'utf8'));
    assert.equal(receipt.exitCode, expected);
  }
});

test('a killed process keeps its startup record and verifies as unfinished', async t => {
  const root = mkdtempSync(resolve('.tmp/scratch/run-receipts-killed-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { child, exited } = await readyChild(t, root, 'killed');
  child.kill('SIGKILL');
  await exited;
  const verified = cli('--run-root', root, '--verify-run', 'killed');
  assert.equal(verified.status, 1);
  assert.equal(JSON.parse(verified.stdout).conclusion, 'unfinished');
  assert.deepEqual(JSON.parse(verified.stdout).missing, ['process receipt']);
});
