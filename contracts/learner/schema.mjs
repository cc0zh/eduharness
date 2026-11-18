import { exact, nonblank, requireThat } from '../core/schema.mjs';

export const learnerFormat = 'Return one JSON object with exactly one key, "text", a nonempty student utterance. Do not use fences, analysis, notes, or extra text.';
export function parseLearner(text) {
  const value = JSON.parse(text);
  requireThat(exact(value, ['text']) && nonblank(value.text), 'expected a nonempty learner text');
  return value;
}
