import assert from 'node:assert/strict';
import test from 'node:test';
import { fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { Models } from '../src/models.mjs';
import { createTeacher } from '../src/teacher/session.mjs';
import rejectedReplies from './fixtures/stage3-handoff-v1.json' with { type: 'json' };

const proof = 'The middle position does not move, so my first rule was wrong.';
const openCheck = 'How would you check your conclusion? Propose your own check, explain why it would help, and try it.';
const conservative = 'What is the reason for one step you have already tried?';
const nextReply = 'Tell me what you noticed.';
const closurePolicy = 'Once the learner understands, verify by assigning a variant and wrap up.';
const ready = (n, quote) => ({ state: 'ready', initialBlocker: null, progress: { n, quote }, choice: null, execution: null, resolvedBlockers: [] });
const notReady = { state: 'not_ready', initialBlocker: null, progress: null, choice: null, execution: null, resolvedBlockers: [] };
const output = (text, stopReason = 'stop') => fauxAssistantMessage([fauxText(text)], { stopReason });

function session(responses, { observe, candidateEdition = 2 } = {}) {
  const calls = [], events = [];
  const models = new Models({ mode: 'offline', roles: ['teacher'], responses,
    save: (raw, meter) => { calls.push({ raw, meter }); return 'test-call.json'; } });
  const teach = createTeacher({ variant: 'normal', operatorPolicy: closurePolicy, models, observe, candidateEdition,
    saveEvent: e => events.push(e) });
  return { teach, calls, events };
}

for (const { source, text } of rejectedReplies) {
  test(`v2 handoff regenerates rather than publishing ${source}`, async () => {
    const { teach, calls } = session([output(text), output(openCheck), output(nextReply)], {
      observe: async (window, turn) => turn === 1 ? ready(1, proof) : notReady,
    });
    assert.equal(await teach(proof), openCheck);
    assert.deepEqual(calls.map(({ meter }) => [meter.turn, meter.call, meter.attempt, meter.failureKind]),
      [[1, 1, 1, 'teacher_generation_contract'], [1, 2, 1, null]]);
    assert.equal(await teach('I still need a clue.'), nextReply);
    for (const { raw } of calls.slice(0, 2)) {
      const system = JSON.stringify(raw.context.messages.filter(m => m.role === 'system'));
      assert.match(system, /Propose your own check/);
      assert.ok(!system.includes(closurePolicy));
      assert.doesNotMatch(system, /Give one clear thing|Verify through explanation or transfer before closing/);
    }
    for (const { raw } of calls.slice(1)) assert.ok(!JSON.stringify(raw.context.messages).includes(JSON.stringify(text).slice(1, -1)), 'rejected reply enters model history');
    assert.match(JSON.stringify(calls[2].raw.context.messages), /Propose your own check/);
    assert.ok(JSON.stringify(calls[2].raw.context.messages).includes(closurePolicy), 'other candidate turns keep the ordinary policy');
  });
}

test('v2 handoff budget exhausts into a recorded conservative reply, without publishing an appended method or next input', async () => {
  const polluted = `${openCheck} First, draw the boundary in this other shape and set x = 12.`;
  const { teach, calls, events } = session([output(polluted), output('Confirmed. You can go now.'), output(nextReply)], {
    observe: async (window, turn) => turn === 1 ? ready(1, proof) : notReady,
  });
  assert.equal(await teach(proof), conservative);
  assert.deepEqual(calls.map(({ meter }) => [meter.turn, meter.call, meter.attempt, meter.failureKind]),
    [[1, 1, 1, 'teacher_generation_contract'], [1, 2, 1, 'teacher_generation_contract']]);
  assert.deepEqual(events.filter(e => e.kind === 'handoffFallback').map(e => [e.turn, e.call, e.action, e.failureKind]),
    [[1, 2, 'diagnose', 'teacher_generation_contract']]);
  assert.equal(await teach('I counted the ranks separately.'), nextReply);
  const history = JSON.stringify(calls[2].raw.context.messages);
  assert.ok(history.includes(conservative));
  assert.ok(!history.includes('Confirmed. You can go now.') && !history.includes('draw the boundary'));
});

test('v2 handoff uses remaining teacher call slots after a private tool and does not request another observation', async () => {
  const tool = fauxAssistantMessage([fauxToolCall('check_distance', { dx: 3, dy: 4 })], { stopReason: 'toolUse' });
  let observations = 0;
  const { teach, calls } = session([tool, output(''), output(openCheck)], { observe: async () => { observations++; return ready(1, proof); } });
  assert.equal(await teach(proof), conservative);
  assert.equal(observations, 1);
  assert.deepEqual(calls.map(({ meter }) => [meter.call, meter.attempt, meter.failureKind]), [[1, 1, null], [2, 1, 'empty_unconfirmed']]);
});

test('truncation regenerates but a genuine provider failure is not replaced with a public handoff', async () => {
  const config = { observe: async () => ready(1, proof) };
  const first = session([output(openCheck, 'length'), output(openCheck)], config);
  assert.equal(await first.teach(proof), openCheck);
  assert.deepEqual(first.calls.map(({ meter }) => [meter.call, meter.attempt, meter.failureKind]), [[1, 1, 'output_truncated'], [2, 1, null]]);
  const second = session([output('provider unavailable', 'error'), output(openCheck)], config);
  await assert.rejects(second.teach(proof), error => error.failure?.kind === 'provider_failure');
  assert.equal(second.calls.length, 1);
  assert.equal(second.events.filter(e => e.kind === 'handoffFallback').length, 0);
});

test('baseline public reply and system prompt do not acquire the edition-2 handoff restrictions', async () => {
  const text = rejectedReplies[0].text;
  const { teach, calls } = session([output(text)]);
  assert.equal(await teach(proof), text);
  const context = JSON.stringify(calls[0].raw.context.messages);
  assert.ok(context.includes(closurePolicy));
  assert.match(context, /Elicit the misconception/);
  assert.doesNotMatch(context, /Propose your own check/);
});
