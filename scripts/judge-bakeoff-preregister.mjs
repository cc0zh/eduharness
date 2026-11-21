import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hash } from '../contracts/core/schema.mjs';
import { makeBakeoffRegistration } from '../src/judge-bakeoff.mjs';

const path = resolve(process.argv[2] ?? '.tmp/scratch/judge-bakeoff/preregistration.md');
const { bytes, plan } = makeBakeoffRegistration();
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, bytes, { flag: 'wx' });
console.log(JSON.stringify({ path, sha256: hash(bytes), candidates: Object.fromEntries(Object.entries(plan.candidates).map(([key, { runId, limits }]) => [key, { runId, ...limits }])) }));
