import assert from 'node:assert/strict';
import test from 'node:test';
import fixtures from './fixtures/judge-real-replay.json' with { type: 'json' };
import { bind, judgementSchema } from '../contracts/judge/schema.mjs';
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
    return new Response(sse({ id:'fake', choices:[{index:0,delta:{content:text},finish_reason:'stop'}] }) + 'data: [DONE]\n\n', { headers: { 'content-type':'text/event-stream' } });
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
  assert.deepEqual(payload.response_format.json_schema.schema, JSON.parse(JSON.stringify(judgementSchema)));
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
  assert.equal(rows[0].row.judgementMode, 'json_schema');
});
