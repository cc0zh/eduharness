import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import fixtures from './fixtures/judge-real-replay.json' with { type: 'json' };
import failedFrozen from './fixtures/judge-v3-numeric-reasons.json' with { type: 'json' };
import { bind, judgementSchema, parseNumberedJudgement, replayLegacyJudgement } from '../contracts/judge/schema.mjs';
import { Value } from '@sinclair/typebox/value';
import contextFailures from './fixtures/judge-context-replay.json' with { type: 'json' };
import { grade } from '../src/judge.mjs';
import { Models } from '../src/models.mjs';
import { policy } from '../config/e1.mjs';

const expected = [/slot order/, /group order/, /no JSON object/, null, SyntaxError, SyntaxError];
for (const [i, fixture] of fixtures.entries()) {
  test(`historical judge ${fixture.run}/${fixture.attempt}: ${expected[i] ? 'reject' : 'accept'}`, async () => {
    const { parseJudgeText } = await import('../contracts/judge/schema.mjs');
    const replay = () => parseJudgeText(fixture.text, bind(fixture.messages));
    if (expected[i]) assert.throws(replay, expected[i]);
    else assert.equal(replay().support_escalation_and_fading.score, 1);
  });
}

test('text fallback unwraps a reasoning prefix and fence but never skips the first object', async () => {
  const { parseJudgeText } = await import('../contracts/judge/schema.mjs');
  const { text, messages } = fixtures[3];
  const view = bind(messages);
  assert.equal(parseJudgeText(`<think>{"draft":0}</think>\n\`\`\`json\n${text}\n\`\`\``, view).productive_struggle.score, 2);
  assert.throws(() => parseJudgeText(`[${text}]`, view), /JSON object/);
  assert.throws(() => parseJudgeText(`${text} garbage`, view), SyntaxError);
  assert.throws(() => parseJudgeText(`{}\n${text}`, view), SyntaxError);
  assert.throws(() => parseJudgeText(text.slice(0, -8), view), SyntaxError);
  const invalidWindow = JSON.parse(text);
  invalidWindow.results.support_escalation_and_fading.evidence_groups[0].slots.tutor_fading_prompt.opportunity_message_ids = [messages.at(-1).id];
  assert.throws(() => parseJudgeText(JSON.stringify(invalidWindow), view), /observation window/);
});

test('pi OpenRouter transport sends the contract schema and requires parameter support', async t => {
  const { text, messages } = fixtures[3];
  for (const key of ['DEEPSEEK_API_KEY','OPENROUTER_API_KEY']) {
    const prior = process.env[key];
    t.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
    process.env[key] = 'unit-test-credential';
  }
  const payloads = [];
  const reply = numbered(text,messages);
  for (const row of Object.values(reply.results)) row.reason = '#1 anchors this test judgment.';
  const sse = data => `data: ${JSON.stringify(data)}\n\n`;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    return new Response(sse({ id:'fake', choices:[{index:0,delta:{content:JSON.stringify(reply)},finish_reason:'stop'}], usage:{prompt_tokens:50,completion_tokens:400,total_tokens:450,completion_tokens_details:{reasoning_tokens:200}} }) + 'data: [DONE]\n\n', { headers: { 'content-type':'text/event-stream' } });
  });
  mkdirSync('.tmp/scratch/s1-ruler-v2', { recursive: true });
  const root = mkdtempSync('.tmp/scratch/s1-ruler-v2/wire-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const saved = `${root}/outbound.json`;
  const rows = [];
  const models = new Models({ mode: 'real', save: (raw, row) => {
    writeFileSync(saved, JSON.stringify(raw.outbound ?? null));
    return rows.push(row);
  } });
  const graded = await grade(models, messages, { turn: 4 });
  assert.equal(graded.scores.direct, 2);
  assert.equal(payloads.length, 1);
  const [payload] = payloads;
  assert.equal(payload.model, 'tencent/hy4-flash');
  assert.equal(payload.provider?.require_parameters, true);
  assert.deepEqual(payload.reasoning, { max_tokens: 16384 });
  assert.equal(payload.max_tokens, 65536);
  const outbound = JSON.parse(readFileSync(saved, 'utf8'));
  assert.deepEqual(outbound.reasoning, payload.reasoning);
  assert.equal(outbound.max_tokens, payload.max_tokens);
  assert.equal(outbound.messages, '[redacted]');
  assert.doesNotMatch(JSON.stringify(outbound), /unit-test-credential/);
  assert.equal(rows[0].reasoningLimit, 16384);
  assert.equal(rows[0].reasoningTokens, 200);
  assert.equal(payload.response_format?.type, 'json_schema');
  assert.equal(payload.response_format.json_schema.strict, true);
  assert.deepEqual(payload.response_format.json_schema.schema, JSON.parse(JSON.stringify(judgementSchema(bind(messages)))));
  const { properties, required } = payload.response_format.json_schema.schema.properties.results.properties.agency_handoff;
  assert.ok(required.includes('evidence'));
  assert.deepEqual(properties.evidence.items, { minimum: 1, maximum: messages.length, type: 'integer' });
  assert.match(properties.reason.description, /one or two sentences.*#N.*evidence/i);
  function checkClosed(node) {
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
      for (const child of Object.values(node.properties)) checkClosed(child);
    }
    if (node.items) checkClosed(node.items);
    for (const member of node.anyOf ?? []) checkClosed(member);
  }
  checkClosed(payload.response_format.json_schema.schema);
  assert.equal(payload.tools, undefined);
  assert.match(payload.messages[0].content, /on that message or later/);
  assert.doesNotMatch(JSON.stringify(payload.messages), /context_id/);
  assert.ok(messages.every(m=>!JSON.stringify(payload.messages).includes(m.id)));
  const request = JSON.parse(payload.messages.at(-1).content);
  assert.deepEqual(request.messages.map(m=>m.n),messages.map((_,i)=>i+1));
  const verification = request.rubric.verification_or_transfer[1];
  assert.match(verification, /0 .*worked check that supplies the reasoning|0 .*solves the check and only asks for confirmation/);
  assert.match(verification, /0 .*learner checks alone and the tutor only confirms/);
  assert.match(verification, /1 .*asks the learner to explain before giving the reasoning.*echoes/);
  assert.match(verification, /2 learner explains the concept independently or transfers it/);
  assert.equal(rows[0].judgementMode, 'json_schema');

  const margin = policy.judge.minVisibleTokens;
  policy.judge.minVisibleTokens = policy.judge.maxTokens;
  try {
    await assert.rejects(grade(models, messages, { turn: 4 }), /outbound judge budget or schema mismatch/);
    assert.equal(payloads.length, 1);
    assert.match(rows.at(-1).detail, /outbound judge budget or schema mismatch/);
  } finally {
    policy.judge.minVisibleTokens = margin;
  }
});

function numbered(text,messages) {
  const {results} = JSON.parse(text);
  for (const row of Object.values(results)) row.evidence = [1];
  for (const row of Object.values(results)) for (const group of row.evidence_groups) for (const slot of Object.values(group.slots)) {
    if (slot.message_ids) { slot.message_numbers = slot.message_ids.map(id=>messages.findIndex(m=>m.id===id)+1); delete slot.message_ids; }
    if (slot.opportunity_message_ids) { slot.opportunity_numbers = slot.opportunity_message_ids.map(id=>messages.findIndex(m=>m.id===id)+1); delete slot.opportunity_message_ids; }
    delete slot.checked_view_id;
  }
  return {results};
}

test('old e/a context echoes do not participate in replay; unknown evidence still rejects', () => {
  for (const [i, {text,messages}] of contextFailures.entries()) {
    const view = bind(messages);
    const value = JSON.parse(text);
    assert.equal(value.context_id, ['e','a'][i]);
    assert.throws(()=>replayLegacyJudgement(text,view), /unknown message ID/);
  }
});

test('numbered wire schema enforces bounds and maps references back to full IDs', () => {
  const {text,messages}=fixtures[3];
  const view=bind(messages);
  const good=numbered(text,messages);
  for (const row of Object.values(good.results)) row.reason = '#1 anchors this test judgment.';
  const schema=judgementSchema(view);
  assert.equal('context_id' in schema.properties,false);
  assert.equal(Value.Check(schema,good),true);
  assert.deepEqual(parseNumberedJudgement(JSON.stringify(good),view).productive_struggle.evidence,messages.slice(0,8).map(m=>m.id));
  for (const evidence of [[], [0], [messages.length+1], [1.5]]) {
    const invalid = structuredClone(good);
    invalid.results.agency_handoff.evidence = evidence;
    assert.throws(() => parseNumberedJudgement(JSON.stringify(invalid),view), /results\/agency_handoff\/evidence/);
  }
  const slot=good.results.productive_struggle.evidence_groups[0].slots.student_stuck_or_error;
  for(const n of [0,messages.length+1,1.5]){
    slot.message_numbers=[n];
    assert.equal(Value.Check(schema,good),false);
    assert.throws(()=>parseNumberedJudgement(JSON.stringify(good),view),/structure/);
  }
});

test('current numbered judgments require an in-window message citation and explanation in every reason', () => {
  const {text,messages}=fixtures[3];
  const view=bind(messages);
  const good=numbered(text,messages);
  for (const row of Object.values(good.results)) row.reason = '#1 anchors this test judgment.';
  assert.equal(parseNumberedJudgement(JSON.stringify(good),view).agency_handoff.reason, good.results.agency_handoff.reason);
  for (const reason of [' ', 'T', `#${messages.length+1} is outside the window.`, '#1', 'The score is 1.', '#2 is outside the declared evidence.', '#1 ok']) {
    good.results.agency_handoff.reason = reason;
    assert.throws(() => parseNumberedJudgement(JSON.stringify(good),view), /structure|agency_handoff.*reason/);
  }
});

for (const {file, text} of failedFrozen.attempts) {
  test(`frozen v3 ${failedFrozen.cell}/${file}: rejects numeric reasons at the wire contract`, () => {
    const view = bind(failedFrozen.messages);
    const original = JSON.parse(text);
    assert.ok(Object.values(original.results).every(row => row.reason === String(row.score)));
    assert.equal(Value.Check(judgementSchema(view), original), false);
    assert.throws(() => parseNumberedJudgement(text, view), /results\/\w+\/evidence/);
    for (const row of Object.values(original.results)) row.evidence = [1];
    assert.throws(() => parseNumberedJudgement(JSON.stringify(original), view), /agency_handoff.*reason/);
  });
}
