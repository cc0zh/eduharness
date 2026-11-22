import assert from 'node:assert/strict';
import test from 'node:test';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { createWorkingJudge, workingJudge, workingJudgeFingerprint, workingJudgeFingerprintFiles } from '../src/working-judge.mjs';
import { v4EvidenceRule } from '../contracts/judge/binary-v4.mjs';

const messages = [
  { id: 'm1', role: 'learner', turn: 0, text: 'I think the factors cancel.' },
  { id: 'm2', role: 'teacher', turn: 1, text: 'What happens when x=1?' },
  { id: 'm3', role: 'learner', turn: 1, text: 'They do not cancel.' },
];
const scope = { turn: 1, runId: 'fixture', cell: 'normal', dimension: 'verification_or_transfer', ruler: 'e1-binary-v4' };
const reply = JSON.stringify({ answers: { V1: { answer: true, evidence: { prompt: 2 } }, V2: { answer: false, evidence: { prompt: null, response: null } } } });

test('a change to the working entry is part of its judge fingerprint', () => {
  const sources = Object.fromEntries(workingJudgeFingerprintFiles.map(path => [path, 'a'.repeat(64)]));
  assert.notEqual(workingJudgeFingerprint({ ...sources, 'src/working-judge.mjs': 'a'.repeat(64) }),
    workingJudgeFingerprint({ ...sources, 'src/working-judge.mjs': 'b'.repeat(64) }));
});

function capture(t, replies, proxy = { HTTPS_PROXY: 'http://127.0.0.1:9' }) {
  const env = { OPENROUTER_API_KEY: 'fixture', NODE_TLS_REJECT_UNAUTHORIZED: undefined,
    https_proxy: undefined, http_proxy: undefined, HTTPS_PROXY: undefined, HTTP_PROXY: undefined, ...proxy };
  for (const key of Object.keys(env)) {
    const old = process.env[key];
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const mock = new MockAgent();
  mock.disableNetConnect();
  const dispatcher = getGlobalDispatcher();
  setGlobalDispatcher(mock);
  t.after(async () => { setGlobalDispatcher(dispatcher); await mock.close(); });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url: String(url), proxied: init.dispatcher !== undefined, body: JSON.parse(init.body) });
    assert.ok(replies.length, 'unexpected extra request');
    const [text, finish] = replies.shift();
    const chunks = [
      { id: 'fixture', provider: 'Google AI Studio', model: 'google/gemini-3.8-flash', choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] },
      { id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: finish }] },
      { choices: [], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30, completion_tokens_details: { reasoning_tokens: 0 } } },
    ];
    return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n');
  });
  return requests;
}

for (const [setting, proxy] of [['no proxy', {}], ['only HTTP_PROXY', { HTTP_PROXY: 'http://127.0.0.1:9' }]]) {
  test(`working entry refuses real mode with ${setting}`, t => {
    const requests = capture(t, [], proxy);
    assert.throws(() => createWorkingJudge({ mode: 'real', save() {} }), error => {
      assert.equal(error.failure?.kind, 'configuration');
      assert.match(error.message, /judge proxy/);
      return true;
    });
    assert.equal(requests.length, 0);
  });
}

test('working entry sends the v3 prompt and fixed Gemini route through an explicit proxy', async t => {
  const requests = capture(t, [[reply, 'stop']]);
  const { binding, verdict } = await createWorkingJudge({ mode: 'real', save() {} })(messages, scope);
  assert.equal(binding.ruler, 'e1-binary-v3');
  assert.equal(verdict.answers.V1.answer, true);
  assert.equal(requests.length, 1);
  const [{ url, proxied, body }] = requests;
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(proxied, true);
  assert.deepEqual(workingJudge.judgeTransport, { proxied: true, proxySource: 'HTTPS_PROXY' });
  assert.equal(body.model, 'google/gemini-3.8-flash');
  assert.deepEqual(body.provider, { only: ['google-ai-studio'], order: ['google-ai-studio'], require_parameters: true, allow_fallbacks: false });
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.max_completion_tokens, 4096);
  assert.equal(body.temperature, 0);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.ok(body.messages[0].content.includes('claiming it happened'));
  assert.ok(!body.messages[0].content.includes(v4EvidenceRule));
  assert.deepEqual(JSON.parse(body.messages[1].content).messages, messages.map(({ role, text }, i) => ({ n: i + 1, role, text })));
});

test('the working entry rejects invalid, truncated, blank and trailing-text replies without scoring them', async t => {
  const bad = [['{"answers":[]}', 'stop'], ['{"answers":', 'length'], ['', 'stop'], [`${reply} extra`, 'stop']];
  const expected = ['judge_partial_failure', 'output_truncated', 'empty_unconfirmed', 'judge_partial_failure'];
  const requests = capture(t, bad.flatMap(response => [response, [reply, 'stop']]));
  const saved = [];
  const judge = createWorkingJudge({ mode: 'real', save: (raw, meter) => saved.push([raw.attempt, meter.failureKind]) });
  for (const [i, kind] of expected.entries()) {
    assert.equal((await judge(messages, scope)).verdict.answers.V1.answer, true);
    assert.deepEqual(saved.slice(i * 2), [[1, kind], [2, null]]);
  }
  assert.equal(requests.length, 8);
});
