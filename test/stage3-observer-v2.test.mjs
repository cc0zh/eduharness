import assert from 'node:assert/strict';
import test from 'node:test';
import { fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai';
import { hash } from '../contracts/core/schema.mjs';
import { validateObservation } from '../contracts/teacher/observation.mjs';
import { createStateGate, decideStudentAction, observationPrompt } from '../src/teacher/state-machine.mjs';
import { Models } from '../src/models.mjs';

const ref = (n, quote) => ({ n, quote });
const learner = 'My rule is that the middle travels when the largest number moves.';
const hint = 'Check the rank of the middle position before and after.';
const repeat = 'The middle still travels, I think.';
const hint2 = 'Compare the middle before and after the move.';
const repair = 'The middle position stays third, so my rule was wrong.';
const proof = 'I can test my rule by counting ranks before and after.';
const stale = 'My rule still fails on the third item.';
const blocked = ref(1, 'the middle travels');
const recurring = ref(3, 'The middle still travels');
const repaired = ref(5, 'The middle position stays third');
const windowOf = (...texts) => texts.map((text, i) => ({ n: i + 1, role: i % 2 ? 'teacher' : 'learner', text }));
const five = windowOf(learner, hint, repeat, hint2, repair);
const eleven = windowOf(learner, hint, repeat, hint2, proof, hint, repair, hint2, stale, hint, repair);
const v1Shape = (state, slots = {}) => ({ state, initialBlocker: null, progress: null, choice: null, execution: null, ...slots });
const seen = (state, slots = {}) => ({ ...v1Shape(state), resolvedBlockers: [], ...slots });

test('edition 1 keeps the archived observer prompt and decision artifact shape', () => {
  assert.equal(hash(observationPrompt), 'b94f274c947e267fd86c634c97146c9c66921f237d7853220c3ed3f8df8ca5f6');
  assert.doesNotMatch(observationPrompt, /resolvedBlockers/);
  assert.throws(() => validateObservation({ ...v1Shape('blocked', { initialBlocker: blocked }), resolvedBlockers: [] }, five),
    /invalid observation fields or state/);
  const decision = decideStudentAction(v1Shape('blocked', { initialBlocker: blocked }), five, null);
  assert.deepEqual(Object.keys(decision).sort(), ['action', 'choice', 'execution', 'fallback', 'initialBlocker', 'pending', 'progress', 'state']);
  assert.deepEqual([decision.state, decision.action, decision.fallback, decision.pending], ['blocked', 'correct', null, blocked]);
  const oneAnchor = decideStudentAction(v1Shape('ready', { initialBlocker: recurring, progress: repaired }), five, blocked);
  assert.deepEqual([oneAnchor.state, oneAnchor.action, oneAnchor.fallback, oneAnchor.pending], ['unknown', 'diagnose', 'unresolved_blocker', blocked]);
});

test('edition 2 starts an empty tracker and an observation with no resolutions', async () => {
  const { emptyObservation, initialPending } = await import('../src/teacher/state-machine.mjs');
  assert.deepEqual(initialPending(2), []);
  assert.equal(initialPending(1), null);
  assert.deepEqual(emptyObservation(2), { state: 'unknown', initialBlocker: null, progress: null, choice: null, execution: null, resolvedBlockers: [] });
  assert.equal(Object.hasOwn(emptyObservation(1), 'resolvedBlockers'), false);
});

test('edition 2 adds blockers instead of replacing them and never unlocks on a partial resolution', async () => {
  const { initialPending } = await import('../src/teacher/state-machine.mjs');
  let pending = initialPending(2);
  const step = observation => {
    const decision = decideStudentAction(observation, five, pending, 2);
    pending = decision.pending;
    return decision;
  };
  const first = step(seen('blocked', { initialBlocker: blocked }));
  assert.deepEqual([first.state, first.action, first.pending.map(x => x.n)], ['blocked', 'correct', [1]]);
  const second = step(seen('blocked', { initialBlocker: recurring }));
  assert.deepEqual([second.state, second.action, second.pending.map(x => x.n)], ['blocked', 'correct', [1, 3]]);
  const partial = step(seen('ready', { progress: repaired, resolvedBlockers: [blocked] }));
  assert.deepEqual([partial.state, partial.action, partial.fallback, partial.pending.map(x => x.n)], ['unknown', 'diagnose', 'unresolved_blocker', [1, 3]]);
  assert.deepEqual(partial.resolvedBlockers, []);
  const full = step(seen('ready', { initialBlocker: recurring, progress: repaired, resolvedBlockers: [blocked, recurring] }));
  assert.deepEqual([full.state, full.action, full.fallback, full.pending], ['ready', 'handoff', null, []]);
});

test('edition 2 keeps a tracked blocker through a refused observation and unlocks only with explicit evidence', async () => {
  const { observationPromptFor, observeStudent } = await import('../src/teacher/state-machine.mjs');
  const attempts = [], records = [];
  const save = (raw, meter) => { attempts.push({ raw, meter }); return 'call.json'; };
  const reply = value => fauxAssistantMessage([fauxText(JSON.stringify(value))], { stopReason: 'stop' });
  const observer = new Models({ mode: 'offline', save, roles: ['teacher_observer'], responses: [
    reply(seen('blocked', { initialBlocker: blocked })),
    reply(seen('ready', { progress: ref(2, 'Check the rank') })),
    reply(seen('ready', { initialBlocker: recurring, progress: repaired, resolvedBlockers: [blocked, recurring] })),
  ] });
  const gate = createStateGate((window, turn) => observeStudent(observer, window, turn, 2),
    (kind, data) => records.push({ kind, ...data }), 2);
  const first = await gate([{ role: 'learner', text: learner }], 1);
  const second = await gate([{ role: 'learner', text: learner }, { role: 'teacher', text: hint }, { role: 'learner', text: repeat }], 2);
  const third = await gate([{ role: 'learner', text: learner }, { role: 'teacher', text: hint },
    { role: 'learner', text: repeat }, { role: 'teacher', text: hint2 }, { role: 'learner', text: repair }], 3);
  assert.deepEqual([first.state, first.action, first.pending.map(x => x.n)], ['blocked', 'correct', [1]]);
  assert.deepEqual([second.state, second.action, second.fallback, second.pending.map(x => x.n)], ['unknown', 'diagnose', 'teacher_observation_contract', [1]]);
  assert.deepEqual([third.state, third.action, third.fallback, third.pending], ['ready', 'handoff', null, []]);
  assert.deepEqual(records.map(event => [event.state, event.action]), [['blocked', 'correct'], ['unknown', 'diagnose'], ['ready', 'handoff']]);
  assert.equal(attempts[0].raw.context.systemPrompt, observationPromptFor(2));
  assert.equal(JSON.parse(attempts[2].raw.context.messages.at(-1).content).length, 5);
});

test('edition 2 rejects a wrong reference, a non-verbatim quote, bad chronology, duplicate numbers, and resolutions outside a ready state', () => {
  const ready = slots => seen('ready', { progress: repaired, ...slots });
  assert.throws(() => validateObservation(ready({ resolvedBlockers: [ref(2, 'Check the rank')] }), five, 2),
    /invalid resolvedBlockers learner citation/);
  assert.throws(() => validateObservation(ready({ resolvedBlockers: [ref(3, 'The middle sits much later')] }), five, 2),
    /invalid resolvedBlockers learner citation/);
  assert.throws(() => validateObservation(ready({ resolvedBlockers: [recurring, blocked] }), five, 2),
    /resolved blockers must be chronological/);
  assert.throws(() => validateObservation(ready({ resolvedBlockers: [blocked, blocked] }), five, 2),
    /resolved blockers must be chronological/);
  assert.throws(() => validateObservation(seen('blocked', { initialBlocker: blocked, resolvedBlockers: [recurring] }), five, 2),
    /resolved blockers require a ready state/);
  assert.throws(() => validateObservation(seen('not_ready', { resolvedBlockers: [blocked] }), five, 2),
    /resolved blockers require a ready state/);
  assert.throws(() => validateObservation(seen('unknown', { resolvedBlockers: [blocked] }), five, 2),
    /resolved blockers require a ready state/);
  assert.throws(() => validateObservation({ ...ready({}), resolvedBlockers: null }, five, 2), /invalid resolvedBlockers list/);
});

test('edition 2 requires a re-cited blocker to carry its own resolution', () => {
  assert.throws(() => validateObservation(seen('ready', { initialBlocker: recurring, progress: repaired, resolvedBlockers: [blocked] }), five, 2),
    /missing fresh learner progress/);
  assert.equal(validateObservation(seen('ready', { initialBlocker: recurring, progress: repaired, resolvedBlockers: [blocked, recurring] }), five, 2).state, 'ready');
});

test('a current learner message cannot serve as both fresh progress and an earlier resolved blocker', () => {
  for (const initialBlocker of [repaired, null]) {
    const observation = seen('ready', { initialBlocker, progress: repaired, resolvedBlockers: [repaired] });
    assert.throws(() => validateObservation(observation, five, 2), /resolved blocker.*precede/);
  }
});

test('edition 2 cannot record a no-blocker state while citing an unresolved blocker', () => {
  assert.throws(() => validateObservation(seen('not_ready', { initialBlocker: blocked }), five, 2), /not_ready.*blocker/);
});

test('a different, unrelated clause from the same message cannot discharge a tracked blocker', () => {
  const other = ref(1, 'My rule is that');
  const result = decideStudentAction(seen('ready', { initialBlocker: other, progress: repaired, resolvedBlockers: [other] }), five, [blocked], 2);
  assert.deepEqual([result.action, result.fallback, result.pending], ['diagnose', 'unresolved_blocker', [blocked]]);
  const precise = ref(1, 'the middle travels when the largest number moves');
  const fixed = decideStudentAction(seen('ready', { initialBlocker: precise, progress: repaired, resolvedBlockers: [precise] }), five, [blocked], 2);
  assert.deepEqual([fixed.action, fixed.fallback, fixed.pending], ['handoff', null, []]);
});

test('a fresh quote that only echoes the earlier blocker is not a repair', () => {
  const echoed = windowOf(learner, hint, learner);
  const observation = seen('ready', { initialBlocker: blocked, progress: ref(3, blocked.quote), resolvedBlockers: [blocked] });
  assert.throws(() => validateObservation(observation, echoed, 2), /progress.*repeat.*blocker/);
});

test('edition 2 observer sees only the numbered window under its own verbatim prompt', async () => {
  const { observationPromptFor, observeStudent } = await import('../src/teacher/state-machine.mjs');
  const attempts = [];
  const observer = new Models({ mode: 'offline', save: raw => { attempts.push(raw); return 'call.json'; }, roles: ['teacher_observer'],
    responses: [fauxAssistantMessage([fauxText(JSON.stringify(seen('blocked', { initialBlocker: blocked })))], { stopReason: 'stop' })] });
  await observeStudent(observer, five, 2, 2);
  const prompt = observationPromptFor(2);
  assert.equal(observationPromptFor(1), observationPrompt);
  assert.notEqual(prompt, observationPrompt);
  assert.match(prompt, /resolvedBlockers/);
  assert.match(prompt, /verbatim as one contiguous clause of at most 100 characters/);
  assert.match(prompt, /same blocker was repeated in two messages, cite both messages/);
  assert.doesNotMatch(prompt, /pending/);
  assert.equal(attempts[0].context.systemPrompt, prompt);
  assert.equal(attempts[0].context.messages.at(-1).content, JSON.stringify(five));
  assert.ok(five.every(message => Object.keys(message).sort().join(',') === 'n,role,text'));
});

test('edition 2 decides from evidence alone, not from a fixed message number', async () => {
  const { initialPending } = await import('../src/teacher/state-machine.mjs');
  for (const window of [five, eleven]) {
    const latest = window.length;
    const fresh = ref(latest, 'The middle position stays third');
    let pending = initialPending(2);
    const step = observation => {
      const decision = decideStudentAction(observation, window, pending, 2);
      pending = decision.pending;
      return decision;
    };
    assert.equal(step(seen('blocked', { initialBlocker: blocked })).action, 'correct');
    assert.deepEqual([pending.map(x => x.n)], [[1]]);
    const unlock = step(seen('ready', { initialBlocker: blocked, progress: fresh, resolvedBlockers: [blocked] }));
    assert.deepEqual([unlock.state, unlock.action, unlock.pending], ['ready', 'handoff', []]);
  }
});

test('edition 2 keeps tracked blockers through not_ready and unknown decisions', async () => {
  const { initialPending } = await import('../src/teacher/state-machine.mjs');
  const tracked = [blocked, recurring];
  const uncertain = decideStudentAction(seen('unknown'), five, tracked, 2);
  assert.deepEqual([uncertain.state, uncertain.action, uncertain.fallback, uncertain.pending.map(x => x.n)], ['unknown', 'diagnose', 'uncertain', [1, 3]]);
  assert.deepEqual(uncertain.resolvedBlockers, []);
  const waiting = decideStudentAction(seen('not_ready'), five, tracked, 2);
  assert.deepEqual([waiting.state, waiting.action, waiting.fallback, waiting.pending.map(x => x.n)], ['not_ready', 'diagnose', null, [1, 3]]);
  assert.equal(initialPending(2).length, 0);
});

test('the state gate returns the decision object it records', async () => {
  const records = [];
  const single = [{ role: 'learner', text: learner }];
  const gate = createStateGate(async () => v1Shape('blocked', { initialBlocker: blocked }),
    (kind, data) => records.push({ kind, ...data }), 1);
  const decision = await gate(single, 1);
  assert.deepEqual([decision.state, decision.action, decision.pending], ['blocked', 'correct', blocked]);
  assert.deepEqual(records, [{ kind: 'stateDecision', ...decision }]);
  const second = createStateGate(async () => seen('blocked', { initialBlocker: blocked }), () => {}, 2);
  const tracked = await second(single, 1);
  assert.deepEqual([tracked.action, tracked.pending, tracked.resolvedBlockers], ['correct', [blocked], []]);
});
