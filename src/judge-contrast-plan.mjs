import { s1Path, s1Plan } from './s1-binary-plan.mjs';

export const judgeContrastScenario = 'S1-judge-contrast';
export const timeoutInputs = ['A2-assigned-multiplier', 'R0-still-learner-origin', 'R1-student-score-cards'];
export const contrastFolders = [...s1Plan.map(s1Path), ...timeoutInputs];

export function contrastBudget(policy) {
  const typicalCalls = contrastFolders.length;
  const maxCalls = typicalCalls + 8;
  return { typicalCalls, maxCalls, maxOutputTokens: maxCalls * policy.judge.maxTokens };
}

export function contrastRegistration(markdown) {
  const block = /^## 机器清单\r?\n\r?\n```json\r?\n([\s\S]*?)\r?\n```\s*$/m.exec(markdown);
  if (!block) throw Error('judge contrast preregistration has no machine plan');
  return JSON.parse(block[1]);
}
