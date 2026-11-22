import { policy, routes } from './e1.mjs';

export const judgeModelMetadataVersion = 'judge-bakeoff-models-v1';

export const judgeModelMetadata = Object.freeze({
  'anthropic/claude-haiku-5.5': Object.freeze({
    type: 'chat', id: 'anthropic/claude-haiku-5.5', name: 'Anthropic: Claude Haiku 5.5',
    api: 'openai-completions', baseUrl: 'https://openrouter.ai/api/v1', provider: 'openrouter', reasoning: true,
    thinkingLevelMap: Object.freeze({ off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: null, max: null }),
    input: Object.freeze(['text']), cost: Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
    contextWindow: 1_000_000, maxTokens: 2_048,
    compat: Object.freeze({ supportsDeveloperRole: false, thinkingFormat: 'openrouter', supportsStrictMode: true, sendSessionAffinityHeaders: true }),
  }),
  'google/gemini-3.8-flash': Object.freeze({
    type: 'chat', id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash',
    api: 'openai-completions', baseUrl: 'https://openrouter.ai/api/v1', provider: 'openrouter', reasoning: true,
    thinkingLevelMap: Object.freeze({ off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: null, max: null }),
    input: Object.freeze(['text']), cost: Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
    contextWindow: 1_048_576, maxTokens: 4_096,
    compat: Object.freeze({ supportsDeveloperRole: false, thinkingFormat: 'openrouter', supportsStrictMode: true, sendSessionAffinityHeaders: true }),
  }),
  'qwen/qwen3-235b-a22b-2507': Object.freeze({
    type: 'chat', id: 'qwen/qwen3-235b-a22b-2507', name: 'Qwen: Qwen3 235B A22B Instruct 2507',
    api: 'openai-completions', baseUrl: 'https://openrouter.ai/api/v1', provider: 'openrouter', reasoning: false,
    input: Object.freeze(['text']), cost: Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
    contextWindow: 131_072, maxTokens: 8_192,
    compat: Object.freeze({ supportsDeveloperRole: false, thinkingFormat: 'openrouter', supportsStrictMode: true, sendSessionAffinityHeaders: true }),
  }),
});

function pinnedProvider(endpoint) {
  const endpoints = Object.freeze([endpoint]);
  return Object.freeze({ only: endpoints, order: endpoints, allow_fallbacks: false, require_parameters: true });
}

function candidate({ runId, label, id, endpoint, version, maxTokens, reasoningBudget, reasoning, temperature, providerAliases }) {
  return Object.freeze({
    runId, label,
    route: Object.freeze({
      ...routes.judge, id, routing: pinnedProvider(endpoint), temperature,
      ...(providerAliases && { providerAliases: Object.freeze(providerAliases) }),
    }),
    policy: Object.freeze({
      ...policy, version, splitJudge: true, timeoutMs: 120_000,
      judge: Object.freeze({
        ...policy.judge, maxTokens, minVisibleTokens: maxTokens - reasoningBudget, reasoningBudget, reasoningMaxTokens: null, timeoutMs: 120_000,
        ...(reasoning && { reasoning: Object.freeze(reasoning) }),
      }),
    }),
  });
}

export const splitJudgeCandidates = Object.freeze({
  haiku: candidate({
    runId: 'round2-bakeoff-haiku-01',
    label: 'Claude Haiku 5.5 / Anthropic, adaptive low reasoning',
    id: 'anthropic/claude-haiku-5.5',
    endpoint: 'anthropic',
    version: 'e1-call-policy-v8-bakeoff-haiku',
    maxTokens: 2_048,
    reasoningBudget: 1_536,
    reasoning: { effort: 'low' },
    temperature: null,
  }),
  gemini: candidate({
    runId: 'round2-bakeoff-gemini-01',
    label: 'Gemini 3.8 Flash / Google AI Studio, low reasoning',
    id: 'google/gemini-3.8-flash',
    endpoint: 'google-ai-studio',
    version: 'e1-call-policy-v9-bakeoff-gemini',
    maxTokens: 4_096,
    reasoningBudget: 3_072,
    reasoning: { effort: 'low' },
    temperature: 0,
    providerAliases: ['google-ai-studio', 'google ai studio'],
  }),
  qwen: candidate({
    runId: 'round2-bakeoff-qwen-01',
    label: 'Qwen3 235B Instruct 2507 / Parasail FP8, reasoning omitted',
    id: 'qwen/qwen3-235b-a22b-2507',
    endpoint: 'parasail/fp8',
    version: 'e1-call-policy-v10-bakeoff-qwen',
    maxTokens: 8_192,
    reasoningBudget: 0,
    temperature: 0,
  }),
});
