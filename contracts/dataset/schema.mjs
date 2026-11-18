import { nonblank, record, requireThat } from '../core/schema.mjs';

export const revision = 'd9a673dc7c32d45df6c08a05e70d276da9e8a164';
export function readTask(rows, id) {
  requireThat(Array.isArray(rows), 'expected a dataset array');
  const matches = rows.filter(row => row.id === id);
  requireThat(matches.length === 1, `expected one dataset row for ${id}`);
  const task = matches[0];
  const info = task.user_scenario?.instructions;
  requireThat(nonblank(task.user_scenario?.persona) && ['task_instructions', 'reason_for_call', 'known_info', 'unknown_info'].every(key => nonblank(info?.[key])) && record(info.student_model), `invalid dialogue input for ${id}`);
  return task;
}

const reference = { 'S0-01': 43 };
export function checkOriginalAnswer(taskId, messages) {
  const expected = reference[taskId];
  if (expected === undefined) return null;
  const mismatches = [];
  for (let i = 1; i < messages.length; i++) {
    const [learner, teacher] = [messages[i - 1], messages[i]];
    if (learner.role !== 'learner' || teacher.role !== 'teacher') continue;
    const proposed = Number(learner.text.match(/\btotal sum\b[^.!?\n]{0,100}\bdistinct\b[^.!?\n]{0,100}(?:\b(?:is|be)\b|=)\s*(\d+)(?=\s*[.!?]|\s*$)/i)?.[1]);
    const confirmation = teacher.text.match(/\btotal\s+(\d+)\s+(?:all\s+)?checks?\s+out\b/i);
    const variant = /\b(?:variant|suppose|constant[ -]term)\b/i;
    if (confirmation && proposed === Number(confirmation[1]) && proposed !== expected && !variant.test(learner.text + teacher.text.slice(0, confirmation.index))) {
      mismatches.push({ proposed, confirmationId: teacher.id });
    }
  }
  return { expected, mismatches };
}
