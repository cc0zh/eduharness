import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const preflight = new URL('../src/real-preflight.mjs', import.meta.url);
const models = new URL('../src/models.mjs', import.meta.url);
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
    const check = `import {loadCredentials} from ${JSON.stringify(preflight.href)}; import {Models} from ${JSON.stringify(models.href)}; try { loadCredentials(); new Models({mode:'real'}); } catch (e) { console.error(e.message); console.log(JSON.stringify(e.failure)); process.exitCode=1; }`;
    const run = spawnSync(process.execPath, ['--input-type=module','-e',check], { cwd, env: { ...env, ...inherited }, encoding: 'utf8', timeout: 5000 });
    assert.equal(run.status, 1);
    const result = JSON.parse(run.stdout);
    assert.equal(result.kind, 'configuration');
    assert.equal(result.detail, `missing ${missing}`);
    assert.match(run.stderr, new RegExp(missing));
    assert.ok(!`${run.stdout}${run.stderr}`.includes(sentinel));
  });
}
