import { policy } from './e1.mjs';

export const conflictingReasoningKeys = Object.freeze(['reasoning_effort', 'include_reasoning', 'thinking', 'extra_body']);
const { maxTokens, minVisibleTokens, timeoutMs } = policy.judge;
export const reasoningOffPolicy = Object.freeze({
  ...policy, version: 'e1-call-policy-v5-reasoning-off',
  judge: Object.freeze({ maxTokens, minVisibleTokens, timeoutMs, reasoning: Object.freeze({ enabled: false }) }),
});
