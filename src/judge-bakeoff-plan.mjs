import { splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { contrastFolders } from './judge-contrast-plan.mjs';
import { splitMaxAttempts } from './split-judge-state.mjs';

export const judgeBakeoffScenario = 'S1-judge-bakeoff';
export const bakeoffConcurrency = 4;

export function bakeoffBudget(policy) {
  const typicalCalls = contrastFolders.length * splitDimensions.length;
  const maxCalls = typicalCalls * splitMaxAttempts;
  return { typicalCalls, maxCalls, maxOutputTokens: maxCalls * policy.judge.maxTokens };
}
