import { routes } from '../config/e1.mjs';
import { runId } from '../contracts/artifacts/schema.mjs';
import { exact, hash, requireThat } from '../contracts/core/schema.mjs';
import { source } from './run.mjs';

export const freezeFile = 'contracts/judge/ruler-freeze.json';
const rulerSources = ['contracts/judge/schema.mjs', 'src/judge.mjs', 'config/e1.mjs'];
const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isCommit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function loadRulerFreeze(reference) {
  requireThat(isCommit(reference), 'test phase is blocked without the frozen ruler decision (--freeze <full commit>)');
  try {
    const bytes = source(freezeFile);
    const lock = JSON.parse(bytes);
    requireThat(exact(lock, ['decisionCommit', 'sourceCommit', 'training', 'identity', 'splitSha256', 'testSha256', 'protocolSha256']), 'invalid record shape');
    requireThat(lock.decisionCommit === reference && isCommit(lock.sourceCommit), 'decision or source commit mismatch');
    const { training, identity } = lock;
    requireThat(exact(training, ['runId', 'identityId', 'manifestSha256', 'receiptSha256']) && runId(training.runId) === training.runId, 'invalid training provenance');
    requireThat([training.identityId, training.manifestSha256, training.receiptSha256, lock.splitSha256, lock.testSha256, lock.protocolSha256].every(isDigest), 'invalid reference digest');
    requireThat(exact(identity, ['ruler', 'judgeOutputContract', 'version', 'policyVersion', 'judgeRoute', 'sources']) && exact(identity.sources, rulerSources) && Object.values(identity.sources).every(isDigest), 'invalid ruler identity');
    return { ...lock, recordSha256: hash(bytes) };
  } catch (error) {
    throw new Error(`test phase freeze record rejected: ${error.message}`);
  }
}

export function requireFrozenIdentity(freeze, identity) {
  const expected = freeze.identity;
  for (const key of ['ruler', 'judgeOutputContract', 'version']) {
    requireThat(identity[key] === expected[key], `test phase freeze ${key} mismatch`);
  }
  requireThat(identity.policy.version === expected.policyVersion, 'test phase freeze policy mismatch');
  const { provider, id, responseFormat } = routes.judge;
  requireThat(exact(expected.judgeRoute, ['provider', 'id', 'responseFormat']) && expected.judgeRoute.provider === provider && expected.judgeRoute.id === id && expected.judgeRoute.responseFormat === responseFormat, 'test phase freeze judge route mismatch');
  for (const path of rulerSources) requireThat(identity.sources[path] === expected.sources[path], `test phase freeze source mismatch: ${path}`);
  requireThat(identity.sources[freezeFile] === freeze.recordSha256, 'test phase freeze record changed after admission');
}
