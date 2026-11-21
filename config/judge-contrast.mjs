import { policy, routes } from './e1.mjs';

const qwenProvider = Object.freeze({
  only: Object.freeze(['parasail/fp8']), order: Object.freeze(['parasail/fp8']),
  allow_fallbacks: false, require_parameters: true,
});

export const judgeCandidates = Object.freeze({
  'qwen-parasail': Object.freeze({
    runId: 'round2-qwen-judge-01', slug: 'qwen-judge',
    label: 'Qwen3 235B Instruct 2507 / Parasail FP8',
    route: Object.freeze({ ...routes.judge, id: 'qwen/qwen3-235b-a22b-2507', routing: qwenProvider }),
    policy: Object.freeze({ ...policy, version: 'e1-call-policy-v6-qwen-parasail', retriesPerKind: 2,
      judge: Object.freeze({ ...policy.judge, maxTokens: 8_192, reasoningMaxTokens: null }) }),
  }),
});
