import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('public CLI help flags print common usage without creating files', t => {
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

  for (const flag of ['--help', '-h']) {
    const cwd = mkdtempSync(join(tmpdir(), 'eduharness-cli-help-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));

    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/API_KEY$/i.test(name)));
    const result = spawnSync(process.execPath, [cli, flag], { cwd, encoding: 'utf8', env, timeout: 5000 });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /Usage: node src\/cli\.mjs/);
    assert.match(result.stdout, /Run an offline E1 evaluation[\s\S]*--mode offline --run-root runs --id e1-first/);
    assert.match(result.stdout, /Verify a run receipt[\s\S]*--verify-run e1-first/);
    assert.match(result.stdout, /Export an interactive review report[\s\S]*--export-report e1-first/);
    assert.deepEqual(readdirSync(cwd), []);
  }
});
