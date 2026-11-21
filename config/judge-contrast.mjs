import { policy, routes } from './e1.mjs';

function pinnedProvider(endpoint) {
  const endpoints = Object.freeze([endpoint]);
  return Object.freeze({ only: endpoints, order: endpoints, allow_fallbacks: false, require_parameters: true });
}

export const judgeCandidates = Object.freeze({
  'qwen-parasail': Object.freeze({
    runId: 'round2-qwen-judge-01', slug: 'qwen-judge',
    label: 'Qwen3 235B Instruct 2507 / Parasail FP8',
    route: Object.freeze({ ...routes.judge, id: 'qwen/qwen3-235b-a22b-2507', routing: pinnedProvider('parasail/fp8') }),
    policy: Object.freeze({ ...policy, version: 'e1-call-policy-v6-qwen-parasail', retriesPerKind: 2,
      judge: Object.freeze({ ...policy.judge, maxTokens: 8_192, reasoningMaxTokens: null }) }),
  }),
  'hy4-capped': Object.freeze({
    runId: 'round2-hy4-capped-01', slug: 'hy4-capped',
    label: 'HY4 Flash / Tencent FP8, reasoning on, capped output',
    route: Object.freeze({ ...routes.judge, routing: pinnedProvider('tencent/fp8') }),
    policy: Object.freeze({ ...policy, version: 'e1-call-policy-v7-hy4-capped', retriesPerKind: 2,
      judge: Object.freeze({ ...policy.judge, maxTokens: 32_768 }) }),
  }),
});
