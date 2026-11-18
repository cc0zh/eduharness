import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const cli = resolve('src/cli.mjs');
const sentinel = 'test-only-credential-not-for-network';

for (const [name, inherited, missing, unreadable] of [
  ['loads .env before validating the two keys', {}, 'OPENROUTER_API_KEY'],
  ['preserves a process variable even when it is empty', { DEEPSEEK_API_KEY: '' }, 'DEEPSEEK_API_KEY'],
  ['does not read .env when both process variables are set', { DEEPSEEK_API_KEY: '', OPENROUTER_API_KEY: sentinel }, 'DEEPSEEK_API_KEY', true],
]) {
  test(name, t => {
    mkdirSync('.tmp/scratch/credentials', { recursive: true });
    const cwd = mkdtempSync(resolve('.tmp/scratch/credentials/check-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    if (unreadable) mkdirSync(resolve(cwd, '.env'));
    else writeFileSync(resolve(cwd, '.env'), `DEEPSEEK_API_KEY=${sentinel}\n`);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(DEEPSEEK_API_KEY|OPENROUTER_API_KEY)$/i.test(key)));
    const run = spawnSync(process.execPath, [cli, '--mode', 'real', '--confirm-cost', '--id', 'credentials-test'], { cwd, env: { ...env, ...inherited }, encoding: 'utf8', timeout: 5000 });
    assert.equal(run.status, 1);
    const result = JSON.parse(run.stdout);
    assert.equal(result.cells[0].failure.kind, 'configuration');
    assert.equal(result.cells[0].failure.detail, `missing ${missing}`);
    assert.match(run.stderr, new RegExp(missing));
    assert.ok(!`${run.stdout}${run.stderr}`.includes(sentinel));
  });
}
