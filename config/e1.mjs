export const taskId = 'S0-06';
export const rounds = 4;
export const policy = Object.freeze({
  version: 'e1-call-policy-v4', retries: 2, timeoutMs: 120_000,
  teacher: { maxTokens: 5296, thinking: 'low', thinkingBudgets: { low: 4096 }, requestsPerTurn: 2 },
  learner: { maxTokens: 4096, thinking: 'low' },
  judge: { maxTokens: 65_536, reasoningMaxTokens: 16_384, minVisibleTokens: 8_192, timeoutMs: 180_000 },
});
export const routes = {
  teacher: { provider: 'deepseek', id: 'deepseek-flash', key: 'DEEPSEEK_API_KEY' },
  learner: { provider: 'deepseek', id: 'deepseek-flash', key: 'DEEPSEEK_API_KEY' },
  judge: { provider: 'openrouter', id: 'tencent/hy4-flash', key: 'OPENROUTER_API_KEY', responseFormat: 'json_schema' },
};

export const fidelityRoute = Object.freeze({ provider: 'openrouter', id: 'qwen/qwen3-235b-a22b-2507', endpoint: 'parasail/fp8', key: 'OPENROUTER_API_KEY' });
export const fidelityPolicy = Object.freeze({ version: 'hard-learner-audit-v4', maxTokens: 4096 });
