import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { hash } from '../contracts/core/schema.mjs';
import { makeBakeoffProxyRegistration, makeBakeoffRegistration } from '../src/judge-bakeoff.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'proxy-from-env': { type: 'boolean' } } });
const proxy = values['proxy-from-env'];
const path = resolve(positionals[0] ?? `.tmp/scratch/judge-bakeoff/preregistration${proxy ? '-addendum-proxy' : ''}.md`);
const { bytes, plan } = proxy
  ? makeBakeoffProxyRegistration((await import('../src/openrouter-proxy.mjs')).resolveOpenRouterProxySource().source)
  : makeBakeoffRegistration();
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, bytes, { flag: 'wx' });
console.log(JSON.stringify({ path, sha256: hash(bytes),
  ...(proxy && { judgeTransport: plan.judgeTransport, parentRegistrationSha256: plan.parentRegistrationSha256, qwen: 'reuse' }),
  candidates: Object.fromEntries(Object.entries(plan.candidates).map(([key, { runId, limits }]) => [key, { runId, ...limits }])) }));
