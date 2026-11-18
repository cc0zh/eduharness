import { nonblank, requireThat } from '../core/schema.mjs';

export const phases = ['diagnose', 'scaffold', 'handoff', 'verify'];
export const internalRole = 'teacharena_internal';
export function publicReply(text) {
  requireThat(nonblank(text) && !/teacharena_internal|<\/?(?:internal|teacher_state|phase)\b/i.test(text), 'empty teacher reply or internal marker');
  return text.trim();
}
