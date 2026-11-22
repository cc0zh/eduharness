import assert from 'node:assert/strict';
import test from 'node:test';
import { fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { Models } from '../src/models.mjs';
import { createTeacher } from '../src/teacher/session.mjs';

const ref = (n, quote) => ({ n, quote });
const seen = (state, slots = {}) => ({ state, initialBlocker: null, progress: null, choice: null, execution: null, ...slots });
const out = (text, stopReason = 'stop') => fauxAssistantMessage([fauxText(text)], { stopReason });
const reply = 'Here is a question you can try.';
const valid = value => out(JSON.stringify(value));
const misread = 'I think the middle travels when the largest number moves.';
const stillWrong = 'The middle still travels.';
const repair = 'The middle position is unchanged, so my rule was wrong.';
const proof = 'I can check my rule by counting positions before and after. The rank should stay third.';

test('a learner who has made progress receives the handoff action rather than a fixed opening goal', async () => {
  const calls = [];
  const models = new Models({ mode: 'offline', roles: ['teacher'], responses: [out(reply)], save: raw => calls.push(raw) });
  const teach = createTeacher({ models, variant: 'normal', operatorPolicy: '', saveEvent: () => {},
    observe: async () => seen('ready', { progress: ref(1, repair) }) });
  await teach(repair);
  const goal = calls[0].context.messages.find(m => m.sections?.goal).sections.goal;
  assert.match(goal, /own method or check/);
});

test('state gate follows fresh learner evidence with no fixed third-turn handoff or tool-call observation', async () => {
  const { observeStudent } = await import('../src/teacher/state-machine.mjs');
  const events = [], attempts = [];
  const save = (raw, meter) => { attempts.push({ raw, meter }); return 'call.json'; };
  const models = new Models({ mode: 'offline', save, roles: ['teacher'], responses: [
    fauxAssistantMessage([fauxToolCall('check_distance', { dx: 3, dy: 4 })], { stopReason: 'toolUse' }),
    ...Array.from({ length: 4 }, () => out(reply)),
  ] });
  const observer = new Models({ mode: 'offline', save, roles: ['teacher_observer'], responses: [
    valid(seen('blocked', { initialBlocker: ref(1, misread) })),
    valid(seen('ready', { initialBlocker: ref(1, misread), progress: ref(3, repair) })),
    valid(seen('blocked', { initialBlocker: ref(5, stillWrong) })),
    valid(seen('chosen', { initialBlocker: ref(5, stillWrong), progress: ref(7, proof), choice: ref(7, proof) })),
  ] });
  const teach = createTeacher({ models, variant: 'normal', operatorPolicy: 'Do not reveal private material.',
    observe: (window, turn) => observeStudent(observer, window, turn), saveEvent: event => events.push(event) });
  for (const learnerText of [misread, repair, stillWrong, proof]) assert.equal(await teach(learnerText), reply);
  await assert.rejects(teach('one more'), /four|4|turn limit/);
  assert.deepEqual(events.filter(e => e.kind === 'stateDecision').map(e => [e.state, e.action]), [
    ['blocked', 'correct'], ['ready', 'handoff'], ['blocked', 'correct'], ['chosen', 'continue_choice'],
  ]);
  const observations = attempts.filter(x => x.meter.role === 'teacher_observer');
  assert.deepEqual(observations.map(({ meter }) => [meter.turn, meter.call, meter.attempt]), [[1, 1, 1], [2, 1, 1], [3, 1, 1], [4, 1, 1]]);
  for (const [index, { raw }] of observations.entries()) {
    const window = JSON.parse(raw.context.messages.at(-1).content);
    assert.equal(window.length, 1 + index * 2);
    assert.ok(window.every((m, i) => m.n === i + 1 && Object.keys(m).sort().join(',') === 'n,role,text'));
    assert.doesNotMatch(JSON.stringify(window), /check_distance|teacharena_internal/);
    assert.match(raw.context.systemPrompt, /re-cite the most recent blocker even after repair/);
  }
  const goals = attempts.filter(({ meter }) => meter.role === 'teacher' && meter.call === 1)
    .map(({ raw }) => raw.context.messages.filter(m => m.role === 'system' && m.sections?.goal).map(m => m.sections.goal));
  assert.ok(goals.every(list => list.length === 1));
  assert.match(goals[1][0], /own method or check/);
  assert.match(goals[1][0], /Do not name or suggest a method/);
  assert.doesNotMatch(goals[0][0] + goals[2][0], /own method or check/);
});

test('bad JSON, trailing prose, no content, and truncation each use one attempt and only conservative teaching', async () => {
  const { observeStudent } = await import('../src/teacher/state-machine.mjs');
  const ready = JSON.stringify(seen('ready', { progress: ref(1, 'I solved a step.') }));
  const events = [], meters = [];
  const save = (_raw, meter) => { meters.push(meter); return 'call.json'; };
  const models = new Models({ mode: 'offline', save, roles: ['teacher'], responses: Array.from({ length: 4 }, () => out(reply)) });
  const observer = new Models({ mode: 'offline', save, roles: ['teacher_observer'], responses: [
    out('{'), out(`${ready} extra`), out(''), out(ready, 'length'),
  ] });
  const teach = createTeacher({ models, variant: 'normal', operatorPolicy: '', observe: (w, turn) => observeStudent(observer, w, turn), saveEvent: e => events.push(e) });
  for (let i = 0; i < 4; i++) await teach('I solved a step.');
  assert.deepEqual(meters.filter(m => m.role === 'teacher_observer').map(m => [m.attempt, m.failureKind]), [
    [1, 'teacher_observation_contract'], [1, 'teacher_observation_contract'], [1, 'empty_unconfirmed'], [1, 'output_truncated'],
  ]);
  assert.deepEqual(events.filter(e => e.kind === 'stateDecision').map(e => [e.state, e.action]), Array.from({ length: 4 }, () => ['unknown', 'diagnose']));
});

test('a ready report cannot cite a teacher, a stale learner turn, a made-up quote, or omit a tracked blocker', async () => {
  const { observeStudent } = await import('../src/teacher/state-machine.mjs');
  const events = [], save = () => 'call.json';
  const models = new Models({ mode: 'offline', save, roles: ['teacher'], responses: Array.from({ length: 4 }, () => out(reply)) });
  const observer = new Models({ mode: 'offline', save, roles: ['teacher_observer'], responses: [
    valid(seen('blocked', { initialBlocker: ref(1, misread) })),
    valid(seen('ready', { initialBlocker: ref(1, misread), progress: ref(2, reply) })),
    valid(seen('ready', { progress: ref(5, repair) })),
    valid(seen('ready', { initialBlocker: ref(1, misread), progress: ref(7, 'fabricated') })),
  ] });
  const teach = createTeacher({ models, variant: 'normal', operatorPolicy: '', observe: (w, turn) => observeStudent(observer, w, turn), saveEvent: e => events.push(e) });
  for (const input of [misread, 'I agree.', repair, 'Can you tell me the answer?']) await teach(input);
  assert.deepEqual(events.filter(e => e.kind === 'stateDecision').map(e => e.action), ['correct', 'diagnose', 'diagnose', 'diagnose']);
});

test('an unexpected observer I/O error stops the session without generating a teacher response', async () => {
  const events = [], requests = [];
  const models = new Models({ mode: 'offline', roles: ['teacher'], responses: [out(reply)], save: raw => requests.push(raw) });
  const fault = Object.assign(new Error('cannot append local ledger'), { code: 'EIO' });
  const teach = createTeacher({ models, variant: 'normal', operatorPolicy: '', observe: async () => { throw fault; }, saveEvent: event => events.push(event) });
  await assert.rejects(teach(repair), error => error === fault);
  assert.deepEqual(requests, []);
  assert.deepEqual(events, []);
});
