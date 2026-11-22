import { exact, nonblank, requireThat } from '../core/schema.mjs';

const keys = ['initialBlocker', 'progress', 'choice', 'execution'];
const resolvedKey = 'resolvedBlockers';
const states = ['blocked', 'not_ready', 'ready', 'chosen', 'executed', 'unknown'];
export const needsProgress = state => ['ready', 'chosen', 'executed'].includes(state);
export const matchesBlocker = (first, second) => first.n === second.n
  && (first.quote.includes(second.quote) || second.quote.includes(first.quote));

const learnerRef = (ref, window) => {
  const msg = window[ref?.n - 1];
  return exact(ref, ['n', 'quote']) && Number.isSafeInteger(ref.n) && msg?.role === 'learner'
    && nonblank(ref.quote) && ref.quote.length <= 160 && msg.text.includes(ref.quote);
};

export function validateObservation(value, window, edition = 1) {
  const second = edition === 2;
  requireThat(exact(value, second ? ['state', ...keys, resolvedKey] : ['state', ...keys]) && states.includes(value.state),
    'invalid observation fields or state');
  const { state, initialBlocker, progress, choice, execution } = value;
  const latest = window.length;
  for (const key of keys) {
    const ref = value[key];
    if (ref === null) continue;
    requireThat(learnerRef(ref, window), `invalid ${key} learner citation`);
  }
  if (second) {
    requireThat(Array.isArray(value[resolvedKey]), 'invalid resolvedBlockers list');
    const resolved = value[resolvedKey];
    for (const [index, ref] of resolved.entries()) {
      requireThat(learnerRef(ref, window), `invalid ${resolvedKey} learner citation`);
      requireThat(!index || ref.n > resolved[index - 1].n, 'resolved blockers must be chronological with unique message numbers');
      requireThat(ref.n < latest, 'a resolved blocker must precede the latest learner progress');
    }
  }
  if (needsProgress(state)) {
    const open = initialBlocker && (initialBlocker.n >= latest || second && !value[resolvedKey].some(ref => matchesBlocker(initialBlocker, ref)));
    requireThat(progress?.n === latest && !open, 'missing fresh learner progress');
    if (second) requireThat(!value[resolvedKey].some(ref => window[ref.n - 1].text.includes(progress.quote.trim())),
      'fresh progress must not repeat a cited blocker message');
  } else requireThat(!progress && !choice && !execution, 'progress cannot override a non-ready state');
  if (state === 'blocked') requireThat(initialBlocker, 'blocked state requires a learner citation');
  if (state === 'unknown') requireThat(!initialBlocker, 'unknown state cannot assert a blocker');
  if (second && state === 'not_ready') requireThat(!initialBlocker, 'not_ready cannot assert a blocker');
  if (state === 'chosen' || state === 'executed') requireThat(choice, 'missing learner choice');
  else requireThat(!choice, 'choice requires a chosen or executed state');
  if (state === 'executed') requireThat(execution?.n === latest && [latest, latest - 2].includes(choice.n), 'execution must bind to the current or preceding learner choice');
  else requireThat(!execution, 'execution requires an executed state');
  if (second && !needsProgress(state)) requireThat(value[resolvedKey].length === 0, 'resolved blockers require a ready state');
  return value;
}
