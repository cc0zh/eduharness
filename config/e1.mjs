export const taskId = 'S0-06';
export const rounds = 4;
export const policy = Object.freeze({
  version: 'e1-call-policy-v3', retries: 2, timeoutMs: 120_000,
  teacher: { maxTokens: 5296, thinking: 'low', thinkingBudgets: { low: 4096 }, requestsPerTurn: 2 },
  learner: { maxTokens: 4096, thinking: 'low' },
  judge: { maxTokens: 65_536, thinking: 'low', timeoutMs: 180_000 },
});
export const routes = {
  teacher: { provider: 'deepseek', id: 'deepseek-flash', key: 'DEEPSEEK_API_KEY' },
  learner: { provider: 'deepseek', id: 'deepseek-flash', key: 'DEEPSEEK_API_KEY' },
  judge: { provider: 'openrouter', id: 'tencent/hy4-flash', key: 'OPENROUTER_API_KEY', responseFormat: 'json_schema' },
};
