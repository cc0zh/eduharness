import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { hardLearnerCheckScope } from '../config/hard-learners.mjs';
import { checkout, checkSnapshot, publishCheckReceipt } from '../src/real-preflight.mjs';
import { checkRulerChange } from './check-ruler.mjs';

function snapshot() { try { return checkSnapshot(); } catch { return null; } }
const { values: { scope } } = parseArgs({ options: { scope: { type: 'string' } } });
if (scope !== undefined && scope !== hardLearnerCheckScope) throw Error(`unknown check scope: ${scope}`);
const before = snapshot();
if (!scope) checkRulerChange();
const boundary = spawnSync(process.execPath,['scripts/check-boundaries.mjs'],{cwd:checkout,stdio:'inherit'});
if (boundary.status !== 0) process.exit(1);
if (!scope) {
  const docs = spawnSync(process.execPath,['scripts/check-docs.mjs'],{cwd:checkout,stdio:'inherit'});
  if (docs.status !== 0) process.exit(1);
}
const safeTests = ['contracts/learner/contract.test.mjs', 'test/credentials.test.mjs', 'test/hard-learners.test.mjs', 'test/models.test.mjs', 'test/real-preflight.test.mjs'];
const result = spawnSync(process.execPath,['--test','--test-reporter=tap',...(scope ? safeTests : [])],{cwd:checkout,encoding:'utf8',maxBuffer:8*1024*1024});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) process.stderr.write(`${result.error.stack ?? result.error}\n`);
if (result.status !== 0) {
  // Let buffered TAP output drain before the process exits with the child status.
  process.exitCode = Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
} else {
  const passed = Number(result.stdout.match(/^# pass (\d+)\s*$/m)?.[1]);
  if (!Number.isSafeInteger(passed) || passed < 1) throw new Error('missing passing test count');
  if (before?.clean && publishCheckReceipt(before.head,passed,checkout,scope)) console.log(`Check receipt: runs/_receipts/check-${scope ? `${scope}-` : ''}${before.head}.json (${passed} passed)`);
  else console.log('Check passed; no receipt because the checkout was not clean at the same HEAD throughout the check.');
}
