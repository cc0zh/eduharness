import { splitJudgeCandidates } from './judge-bakeoff.mjs';

export const fidelityRoute = Object.freeze({ provider: 'openrouter', id: 'qwen/qwen3-235b-a22b-2507', endpoint: 'parasail/fp8', key: 'OPENROUTER_API_KEY' });
export const fidelityPolicy = Object.freeze({ version: 'hard-learner-audit-v4', maxTokens: 4096 });

const { route, policy: winner } = splitJudgeCandidates.gemini;
export const fidelityAuditPolicies = Object.freeze({
  qwen: Object.freeze({ route: fidelityRoute, policy: fidelityPolicy, requiresProxy: false }),
  gemini: Object.freeze({ route, policy: Object.freeze({ ...winner.judge, version: 'hard-learner-audit-v5-gemini' }), requiresProxy: true }),
});
