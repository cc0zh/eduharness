import { exact, requireThat } from '../contracts/core/schema.mjs';
import { splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { contrastFolders } from './judge-contrast-plan.mjs';
import { splitMaxAttempts } from './split-judge-state.mjs';

export const judgeBakeoffScenario = 'S1-judge-bakeoff';
export const bakeoffConcurrency = 4;
export const originalBakeoffRegistrationSha256 = '46395637d0dfc7e4a382117f6818f4dc7ecec9848a4c312a0d533f5e021d8114';
export const proxyBakeoffRunIds = Object.freeze({
  haiku: 'round2-bakeoff-haiku-proxy-01',
  gemini: 'round2-bakeoff-gemini-proxy-01',
});

export function validateBakeoffProxyIdentity({ scenario, identity, id, mode }) {
  if (identity.judgeTransport === undefined && identity.parentRegistrationSha256 === undefined) return;
  const transport = identity.judgeTransport;
  requireThat(mode === 'real' && scenario === judgeBakeoffScenario
    && identity.parentRegistrationSha256 === originalBakeoffRegistrationSha256
    && identity.registeredId === proxyBakeoffRunIds[identity.judgePolicy] && id === identity.registeredId
    && /^[a-f0-9]{64}$/.test(identity.preregistrationSha256) && identity.preregistrationSha256 !== identity.parentRegistrationSha256
    && exact(transport, ['proxied', 'proxySource']) && transport.proxied === true
    && /^(HTTPS_PROXY|HTTP_PROXY|https_proxy|http_proxy)$/.test(transport.proxySource), 'invalid proxy bakeoff identity');
}

export function bakeoffBudget(policy) {
  const typicalCalls = contrastFolders.length * splitDimensions.length;
  const maxCalls = typicalCalls * splitMaxAttempts;
  return { typicalCalls, maxCalls, maxOutputTokens: maxCalls * policy.judge.maxTokens };
}
