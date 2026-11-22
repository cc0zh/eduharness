import { exact, nonblank, requireThat } from '../core/schema.mjs';

const keys = ['initialBlocker', 'progress', 'choice', 'execution'];
const states = ['blocked', 'not_ready', 'ready', 'chosen', 'executed', 'unknown'];
export const needsProgress = state => ['ready', 'chosen', 'executed'].includes(state);

export function validateObservation(value, window) {
  requireThat(exact(value, ['state', ...keys]) && states.includes(value.state), 'invalid observation fields or state');
  const { state, initialBlocker, progress, choice, execution } = value;
  for (const key of keys) {
    const ref = value[key];
    if (ref === null) continue;
    const msg = window[ref?.n - 1];
    requireThat(exact(ref, ['n', 'quote']) && Number.isSafeInteger(ref.n) && msg?.role === 'learner'
      && nonblank(ref.quote) && ref.quote.length <= 160 && msg.text.includes(ref.quote), `invalid ${key} learner citation`);
  }
  const latest = window.length;
  if (needsProgress(state)) requireThat(progress?.n === latest && (!initialBlocker || initialBlocker.n < latest), 'missing fresh learner progress');
  else requireThat(!progress && !choice && !execution, 'progress cannot override a non-ready state');
  if (state === 'blocked') requireThat(initialBlocker, 'blocked state requires a learner citation');
  if (state === 'unknown') requireThat(!initialBlocker, 'unknown state cannot assert a blocker');
  if (state === 'chosen' || state === 'executed') requireThat(choice, 'missing learner choice');
  else requireThat(!choice, 'choice requires a chosen or executed state');
  if (state === 'executed') requireThat(execution?.n === latest && [latest, latest - 2].includes(choice.n), 'execution must bind to the current or preceding learner choice');
  else requireThat(!execution, 'execution requires an executed state');
  return value;
}
