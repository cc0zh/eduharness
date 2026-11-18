import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { routes } from '../config/e1.mjs';
import { failure } from '../contracts/core/schema.mjs';

export const checkout = fileURLToPath(new URL('..', import.meta.url));
export function checkSnapshot(root = checkout) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  return { head: git('rev-parse','HEAD'), clean: !git('status','--porcelain','--untracked-files=all') };
}
const receiptPath = (root, head) => join(root, 'runs', '_receipts', `check-${head}.json`);

export function publishCheckReceipt(head, passed, root = checkout) {
  const current = checkSnapshot(root);
  if (!current.clean || current.head !== head || !Number.isSafeInteger(passed) || passed < 1) return false;
  const final = receiptPath(root, head), temp = `${final}.${process.pid}.tmp`;
  mkdirSync(join(root,'runs','_receipts'), {recursive:true});
  writeFileSync(temp, JSON.stringify({head,passed,command:'npm run check',status:'passed',checkedAt:new Date().toISOString()})+'\n',{flag:'wx'});
  renameSync(temp,final);
  return true;
}

export function requireCheckReceipt(root = checkout) {
  let current, receipt;
  try { current = checkSnapshot(root); }
  catch { throw failure('preflight_failed', {}, 'real mode requires a Git checkout'); }
  if (!current.clean) throw failure('preflight_failed', {}, 'real mode requires a clean Git checkout');
  try { receipt = JSON.parse(readFileSync(receiptPath(root,current.head),'utf8')); }
  catch { throw failure('preflight_failed', {}, 'run npm run check on the clean current HEAD before real mode'); }
  if (receipt?.head !== current.head || receipt.command !== 'npm run check' || receipt.status !== 'passed' || !Number.isSafeInteger(receipt.passed) || receipt.passed < 1) throw failure('preflight_failed', {}, 'invalid check receipt for current HEAD');
  return receipt;
}

export function loadCredentials(roles = Object.keys(routes)) {
  const missing = [...new Set(roles.map(role=>routes[role].key))].filter(key => process.env[key] === undefined);
  if (!missing.length) return;
  let values;
  try { values = parseEnv(readFileSync('.env','utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw failure('configuration', {}, 'cannot load .env');
  }
  for (const key of missing) if (Object.hasOwn(values,key)) process.env[key] = values[key];
}
