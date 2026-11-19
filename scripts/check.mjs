import { spawnSync } from 'node:child_process';
import { checkout, checkSnapshot, publishCheckReceipt } from '../src/real-preflight.mjs';
import { checkRulerChange } from './check-ruler.mjs';

function snapshot() { try { return checkSnapshot(); } catch { return null; } }
const before = snapshot();
checkRulerChange();
const boundary = spawnSync(process.execPath,['scripts/check-boundaries.mjs'],{cwd:checkout,stdio:'inherit'});
if (boundary.status !== 0) process.exit(1);
const result = spawnSync(process.execPath,['--test','--test-reporter=tap'],{cwd:checkout,encoding:'utf8',maxBuffer:8*1024*1024});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exit(1);
const passed = Number(result.stdout.match(/^# pass (\d+)\s*$/m)?.[1]);
if (!Number.isSafeInteger(passed) || passed < 1) throw new Error('missing passing test count');
if (before?.clean && publishCheckReceipt(before.head,passed)) console.log(`Check receipt: runs/_receipts/check-${before.head}.json (${passed} passed)`);
else console.log('Check passed; no receipt because the checkout was not clean at the same HEAD throughout the check.');
