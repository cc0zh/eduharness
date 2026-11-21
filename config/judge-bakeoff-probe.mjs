import { splitJudgeCandidates } from './judge-bakeoff.mjs';

export const probeSteps = Object.freeze(['A', 'B', 'C', 'D']);
export const probeMaxTokens = 64;
export const probeMaxAttemptsPerStep = 1;

export function make403Probe(candidateKey, step) {
  if (!['haiku', 'gemini'].includes(candidateKey)) throw new TypeError(`unknown 403 probe model ${candidateKey}`);
  if (!probeSteps.includes(step)) throw new TypeError(`unknown 403 probe step ${step}`);
  const candidate = splitJudgeCandidates[candidateKey];
  const route = { ...candidate.route, maxTokensField: step === 'A' ? 'max_completion_tokens' : 'max_tokens' };
  if (step === 'C') {
    route.responseFormat = null;
    route.routing = Object.freeze({ ...route.routing, require_parameters: false });
  } else if (step === 'D') {
    route.responseFormat = null;
    route.routing = Object.freeze({ allow_fallbacks: false, require_parameters: false });
  }
  return Object.freeze({
    candidateKey,
    step,
    route: Object.freeze(route),
    policy: Object.freeze({
      ...candidate.policy,
      version: `${candidate.policy.version}-403-probe-${step.toLowerCase()}`,
      maxAttemptsPerCall: probeMaxAttemptsPerStep,
      judge: Object.freeze({ ...candidate.policy.judge, maxTokens: probeMaxTokens, minVisibleTokens: 1 }),
    }),
  });
}
