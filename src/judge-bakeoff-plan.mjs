import { exact, hash, requireThat } from '../contracts/core/schema.mjs';
import { splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { contrastFolders } from './judge-contrast-plan.mjs';
import { splitMaxAttempts } from './split-judge-state.mjs';

export const judgeBakeoffScenario = 'S1-judge-bakeoff';
export const judgeFreezeScenario = 'S1-judge-freeze';
export const bakeoffConcurrency = 4;
export const freezeArchiveSize = 36;
export const freezeSlotCount = 15 + freezeArchiveSize;
export const judgeFreezeRunId = key => `round2-binary-v3-freeze-${key}-01`;
export const judgeFreezeV4Scenario = 'S1-judge-freeze-v4';
export const judgeFreezeV4RunId = 'round2-binary-v4-freeze-gemini-01';
export const judgeFreezeV4ParentSha256 = 'e489892180d863f725976bfccb97793c141e7fcc81f199429a32f6a44da40c1b';
export const judgeFreezeV4ProbePurpose = 'side-evidence';
export const judgeFreezeV4SlotCount = freezeSlotCount + 9;
export const judgeFreezeV4A2Case = 'A2-identity-test-denied';
export const originalBakeoffRegistrationSha256 = '46395637d0dfc7e4a382117f6818f4dc7ecec9848a4c312a0d533f5e021d8114';
export const proxyBakeoffRunIds = Object.freeze({
  haiku: 'round2-bakeoff-haiku-proxy-01',
  gemini: 'round2-bakeoff-gemini-proxy-01',
});

export const judgeFreezeV4JudgingFiles = ['package-lock.json', 'config/e1.mjs', 'config/judge-bakeoff.mjs', 'contracts/judge/binary.mjs',
  'contracts/judge/binary-v3.mjs', 'contracts/judge/binary-v4.mjs', 'src/binary-judge-v3.mjs', 'src/models.mjs', 'src/judge-transport.mjs',
  'src/openrouter-proxy.mjs', 'src/provider-response-diagnostics.mjs', 'src/split-judge-state.mjs', 'src/split-judge-replay.mjs'];

export function judgeFreezeV4Fingerprint({ ruler, judgeOutputContract, policy, routes, judgeTransport, sources }) {
  const judgingSources = Object.fromEntries(judgeFreezeV4JudgingFiles.map(path => [path, sources?.[path]]));
  requireThat(Object.values(judgingSources).every(value => /^[a-f0-9]{64}$/.test(value)), 'missing v4 judging source digest');
  return hash({ ruler, judgeOutputContract, policy, routes, judgeTransport, sources: judgingSources });
}

export function validateBakeoffProxyIdentity({ scenario, identity, id, mode }) {
  const v4 = scenario === judgeFreezeV4Scenario;
  const freeze = v4 || scenario === judgeFreezeScenario;
  if (!freeze && identity.judgeTransport === undefined && identity.parentRegistrationSha256 === undefined) return;
  const transport = identity.judgeTransport;
  const candidate = proxyBakeoffRunIds[identity.judgePolicy];
  const winner = identity.freeze;
  const registered = v4 ? judgeFreezeV4RunId : freeze ? judgeFreezeRunId(identity.judgePolicy) : candidate;
  requireThat(mode === 'real' && candidate && (freeze ? exact(winner, ['runId', 'identityId', 'registrationSha256', 'judgeFingerprint'])
    && winner.runId === candidate && [winner.identityId, winner.registrationSha256, winner.judgeFingerprint].every(value => /^[a-f0-9]{64}$/.test(value))
    && identity.parentRegistrationSha256 === (v4 ? judgeFreezeV4ParentSha256 : winner.registrationSha256)
    : scenario === judgeBakeoffScenario && identity.parentRegistrationSha256 === originalBakeoffRegistrationSha256)
    && identity.registeredId === registered && id === registered
    && /^[a-f0-9]{64}$/.test(identity.preregistrationSha256) && identity.preregistrationSha256 !== identity.parentRegistrationSha256
    && exact(transport, ['proxied', 'proxySource']) && transport.proxied === true
    && /^(HTTPS_PROXY|HTTP_PROXY|https_proxy|http_proxy)$/.test(transport.proxySource), 'invalid proxy bakeoff identity');
  if (v4) requireThat(identity.judgePolicy === 'gemini' && identity.judgeFingerprint === judgeFreezeV4Fingerprint(identity)
    && identity.judgeFingerprint !== winner.judgeFingerprint, 'invalid v4 judging fingerprint');
}

export function bakeoffBudget(policy) {
  const typicalCalls = contrastFolders.length * splitDimensions.length;
  const maxCalls = typicalCalls * splitMaxAttempts;
  return { typicalCalls, maxCalls, maxOutputTokens: maxCalls * policy.judge.maxTokens };
}

export function judgeFreezeBudget(policy, slots = freezeSlotCount) {
  const typicalCalls = slots * splitDimensions.length;
  const maxCalls = typicalCalls + 8;
  return { typicalCalls, maxCalls, maxOutputTokens: maxCalls * policy.judge.maxTokens };
}
