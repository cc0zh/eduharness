import assert from 'node:assert/strict';
import test from 'node:test';
import fixtures from './fixtures/judge-real-replay.json' with { type: 'json' };
import { bind, judgementSchema, parseNumberedJudgement, replayLegacyJudgement } from '../contracts/judge/schema.mjs';
import { Value } from '@sinclair/typebox/value';
import contextFailures from './fixtures/judge-context-replay.json' with { type: 'json' };
import { grade } from '../src/judge.mjs';
import { Models } from '../src/models.mjs';

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
  const sse = data => `data: ${JSON.stringify(data)}\n\n`;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    return new Response(sse({ id:'fake', choices:[{index:0,delta:{content:JSON.stringify(numbered(text,messages))},finish_reason:'stop'}] }) + 'data: [DONE]\n\n', { headers: { 'content-type':'text/event-stream' } });
  });
  const rows = [];
  const models = new Models({ mode: 'real', save: (raw, row) => rows.push({ raw, row }) });
  const graded = await grade(models, messages, { turn: 4 });
  assert.equal(graded.scores.direct, 2);
  assert.equal(payloads.length, 1);
  const [payload] = payloads;
  assert.equal(payload.model, 'tencent/hy4-flash');
  assert.equal(payload.provider?.require_parameters, true);
  assert.equal(payload.response_format?.type, 'json_schema');
  assert.equal(payload.response_format.json_schema.strict, true);
  assert.deepEqual(payload.response_format.json_schema.schema, JSON.parse(JSON.stringify(judgementSchema(bind(messages)))));
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
  assert.deepEqual(JSON.parse(payload.messages.at(-1).content).messages.map(m=>m.n),messages.map((_,i)=>i+1));
  assert.equal(rows[0].row.judgementMode, 'json_schema');
});

function numbered(text,messages) {
  const {results} = JSON.parse(text);
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
  const schema=judgementSchema(view);
  assert.equal('context_id' in schema.properties,false);
  assert.equal(Value.Check(schema,good),true);
  assert.deepEqual(parseNumberedJudgement(JSON.stringify(good),view).productive_struggle.evidence,messages.slice(0,8).map(m=>m.id));
  const slot=good.results.productive_struggle.evidence_groups[0].slots.student_stuck_or_error;
  for(const n of [0,messages.length+1,1.5]){
    slot.message_numbers=[n];
    assert.equal(Value.Check(schema,good),false);
    assert.throws(()=>parseNumberedJudgement(JSON.stringify(good),view),/structure/);
  }
});
