import assert from 'node:assert/strict';
import test from 'node:test';
import { hash } from '../contracts/core/schema.mjs';

const dimensions = [
  'misconception_repair', 'support_escalation_and_fading', 'agency_handoff',
  'productive_struggle', 'representation_pivot', 'verification_or_transfer',
];
const questionSlots = {
  misconception_repair: {
    M0: [], M1: ['explanation'], M2: ['repair'], M3: ['solution'],
  },
  support_escalation_and_fading: {
    S0: ['state'], S1: ['initial', 'blocked', 'escalation'],
    S2: ['prior', 'progress', 'fading', 'followup'], S3: ['opening'],
  },
  agency_handoff: { A1: ['step', 'choice'], A2: ['choice'] },
  productive_struggle: {
    P0: ['task'], P1: ['opening'], P2: ['stuck', 'hint', 'attempt'],
    P3: ['pending', 'rescue', 'prior'],
  },
  representation_pivot: { R0: [], R1: ['newFrame'], R2: ['uptake'] },
  verification_or_transfer: { V1: ['prompt'], V2: ['response', 'prompt'] },
};
const anchorSlots = {
  misconception_repair: ['misconception'],
  representation_pivot: ['oldFrame', 'blocked'],
};
const messages = Array.from({ length: 11 }, (_, index) => {
  const number = index + 1;
  return {
    id: `message-${number}`,
    role: number % 2 ? 'learner' : 'teacher',
    turn: Math.ceil(index / 2),
    text: `Evidence text for message ${number}.`,
  };
});
const view = { id: hash(messages), messages };

const loadV3 = async () => {
  const [contract, judge] = await Promise.all([
    import('../contracts/judge/binary-v3.mjs').catch(error => {
      assert.notEqual(error.code, 'ERR_MODULE_NOT_FOUND', 'the v3 binary contract must exist');
      throw error;
    }),
    import('../src/binary-judge-v3.mjs').catch(error => {
      assert.notEqual(error.code, 'ERR_MODULE_NOT_FOUND', 'the v3 binary transport must exist');
      throw error;
    }),
  ]);
  return { ...contract, ...judge };
};

const emptyOutput = dimension => ({
  ...(anchorSlots[dimension] && { anchors: Object.fromEntries(anchorSlots[dimension].map(slot => [slot, null])) }),
  answers: Object.fromEntries(Object.entries(questionSlots[dimension]).map(([question, slots]) => [question, {
    answer: false,
    ...(slots.length && { evidence: Object.fromEntries(slots.map(slot => [slot, null])) }),
  }])),
});
const encoded = value => JSON.stringify(value);
const withAnswer = (value, question, answer, evidence) => {
  value.answers[question].answer = answer;
  if (evidence) value.answers[question].evidence = evidence;
  return value;
};
const parse = (contract, dimension, value, audit) =>
  contract.parseBinaryDimension(encoded(value), view, dimension, audit);

function countUnions(value) {
  if (!value || typeof value !== 'object') return 0;
  return Number(Array.isArray(value.anyOf)) + Object.values(value).reduce((sum, child) => sum + countUnions(child), 0);
}

function assertStrictObjects(value) {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'object') assert.equal(value.additionalProperties, false);
  for (const child of Object.values(value)) assertStrictObjects(child);
}

function assertRetry(error, code) {
  assert.equal(error.retryFeedback, code);
  assert.ok(['structure', 'evidence', 'order', 'dependency', 'window'].includes(error.retryFeedback));
  return true;
}

test('v3 versions, dimension order, and question wording are explicit and stable', async () => {
  const { splitBinaryRuler, splitBinaryOutputContract, splitBinaryIdentityVersion, splitDimensions, splitQuestions } = await loadV3();
  assert.equal(splitBinaryRuler, 'e1-binary-v3');
  assert.equal(splitBinaryOutputContract, 'judge-output-v5');
  assert.equal(splitBinaryIdentityVersion, 'evaluation-identity-v5');
  assert.deepEqual(splitDimensions, dimensions);
  assert.deepEqual(Object.keys(splitQuestions), dimensions);
  assert.deepEqual(Object.keys(splitQuestions.misconception_repair), ['M0', 'M1', 'M2', 'M3']);
  assert.deepEqual(Object.keys(splitQuestions.representation_pivot), ['R0', 'R1', 'R2']);
  for (const group of Object.values(splitQuestions)) {
    for (const [question, definition] of Object.entries(group)) {
      assert.equal(typeof definition.text, 'string');
      assert.ok(definition.text.length > 30, `${question} has the v2 rubric wording`);
    }
  }
});

test('each strict dimension schema carries only its own questions and at most nine citation unions', async () => {
  const { binaryDimensionSchema } = await loadV3();
  for (const dimension of dimensions) {
    const schema = binaryDimensionSchema(view, dimension);
    assertStrictObjects(schema);
    assert.equal(countUnions(schema) <= 9, true, `${dimension} stays under the provider union-node limit`);
    assert.deepEqual(Object.keys(schema.properties.answers.properties), Object.keys(questionSlots[dimension]));
    if (anchorSlots[dimension]) {
      assert.deepEqual(Object.keys(schema.properties.anchors.properties), anchorSlots[dimension]);
      const gate = Object.keys(questionSlots[dimension])[0];
      assert.equal(schema.properties.answers.properties[gate].properties.evidence, undefined);
    } else assert.equal(schema.properties.anchors, undefined);
  }
  const schema = binaryDimensionSchema(view, 'misconception_repair');
  assert.deepEqual(schema.properties.anchors.properties.misconception.anyOf[0].enum, [1, 3, 5, 7, 9, 11]);
  assert.throws(() => binaryDimensionSchema(view, 'unknown_dimension'), error => error.retryFeedback === 'structure');
});

test('dimension parsing maps new citations and shared anchors to replayable source IDs', async () => {
  const contract = await loadV3();
  const output = emptyOutput('misconception_repair');
  output.anchors.misconception = 1;
  withAnswer(output, 'M0', true);
  withAnswer(output, 'M1', true, { explanation: 4 });
  withAnswer(output, 'M2', true, { repair: 5 });
  const parsed = parse(contract, 'misconception_repair', output, []);
  assert.deepEqual(parsed.anchors, { misconception: 1 });
  assert.deepEqual(parsed.answers.M0, { answer: true });
  assert.deepEqual(parsed.answers.M1, { answer: true, evidence: { explanation: 4 } });
  assert.deepEqual(parsed.messageIds.M1, { explanation: 'message-4' });
  assert.deepEqual(parsed.messageIds.M0, {});
  assert.deepEqual(parsed.anchorMessageIds, { misconception: 'message-1' });
  assert.deepEqual(parsed.normalized, []);
  assert.deepEqual(parsed.scoring.scores, { misconception_repair: 2 });
});

test('valid citations on No normalize to null without changing the boolean and retain original evidence', async () => {
  const contract = await loadV3();
  const output = emptyOutput('productive_struggle');
  output.answers.P0.evidence.task = 1;
  output.answers.P3.evidence = { pending: 3, rescue: 4, prior: 2 };
  const audit = [];
  const parsed = parse(contract, 'productive_struggle', output, audit);
  assert.equal(parsed.answers.P0.answer, false);
  assert.deepEqual(parsed.answers.P0.evidence, { task: null });
  assert.deepEqual(parsed.answers.P3.evidence, { pending: null, rescue: null, prior: null });
  assert.deepEqual(parsed.normalized.find(row => row.question === 'P0'), { question: 'P0', original: { task: 1 } });
  assert.deepEqual(parsed.normalized.find(row => row.question === 'P3'), {
    question: 'P3', original: { pending: 3, rescue: 4, prior: 2 },
  });
  assert.deepEqual(audit, parsed.normalized);
  assert.deepEqual(parsed.messageIds.P0, {});
  assert.equal(parsed.scoring.scores.productive_struggle, 'N/A');
});

test('invalid No citations and malformed inputs fail with controlled retry feedback', async () => {
  const contract = await loadV3();
  for (const [value, code] of [
    [Object.assign(emptyOutput('productive_struggle'), { answers: { ...emptyOutput('productive_struggle').answers, P0: { answer: false, evidence: { task: 2 } } } }), 'evidence'],
    [Object.assign(emptyOutput('productive_struggle'), { answers: { ...emptyOutput('productive_struggle').answers, P0: { answer: false, evidence: { task: 99 } } } }), 'evidence'],
    [Object.assign(emptyOutput('productive_struggle'), { answers: { ...emptyOutput('productive_struggle').answers, P0: { answer: false, evidence: { task: '1' } } } }), 'structure'],
  ]) {
    assert.throws(() => parse(contract, 'productive_struggle', value), error => assertRetry(error, code));
  }
  for (const text of ['', '{"answers":', `${encoded(emptyOutput('productive_struggle'))} trailing`]) {
    assert.throws(() => contract.parseBinaryDimension(text, view, 'productive_struggle'), error => {
      assert.ok(error instanceof SyntaxError);
      assertRetry(error, 'structure');
      return true;
    });
  }
  const wrongKeys = emptyOutput('productive_struggle');
  wrongKeys.answers.P1.score = 2;
  assert.throws(() => parse(contract, 'productive_struggle', wrongKeys), error => assertRetry(error, 'structure'));
});

test('dimension-local rules preserve gates, chronology, and response windows on No slots too', async () => {
  const contract = await loadV3();
  const gated = emptyOutput('misconception_repair');
  withAnswer(gated, 'M1', true, { explanation: 2 });
  assert.throws(() => parse(contract, 'misconception_repair', gated), error => assertRetry(error, 'dependency'));

  const missingAnchor = emptyOutput('misconception_repair');
  withAnswer(missingAnchor, 'M0', true);
  assert.throws(() => parse(contract, 'misconception_repair', missingAnchor), error => assertRetry(error, 'evidence'));

  const noWindow = emptyOutput('misconception_repair');
  noWindow.anchors.misconception = 11;
  withAnswer(noWindow, 'M0', true);
  assert.throws(() => parse(contract, 'misconception_repair', noWindow), error => {
    assertRetry(error, 'window');
    assert.match(error.message, /#11/);
    return true;
  });

  const noChronology = emptyOutput('productive_struggle');
  noChronology.answers.P3.evidence = { prior: 6, pending: 3, rescue: 4 };
  assert.throws(() => parse(contract, 'productive_struggle', noChronology), error => assertRetry(error, 'order'));

  const mOrder = emptyOutput('misconception_repair');
  mOrder.anchors.misconception = 1;
  mOrder.answers.M2.evidence.repair = 5;
  mOrder.answers.M3.evidence.solution = 6;
  withAnswer(mOrder, 'M0', true);
  withAnswer(mOrder, 'M2', true, { repair: 5 });
  withAnswer(mOrder, 'M3', true, { solution: 6 });
  assert.throws(() => parse(contract, 'misconception_repair', mOrder), error => assertRetry(error, 'order'));

  const lateAgency = emptyOutput('agency_handoff');
  lateAgency.answers.A2.evidence.choice = 7;
  withAnswer(lateAgency, 'A2', true, { choice: 7 });
  assert.throws(() => parse(contract, 'agency_handoff', lateAgency), error => assertRetry(error, 'window'));
  lateAgency.answers.A2.answer = false;
  assert.throws(() => parse(contract, 'agency_handoff', lateAgency), error => assertRetry(error, 'window'));
});

test('R and V citations share anchors once and enforce their local dependencies', async () => {
  const contract = await loadV3();
  const r = emptyOutput('representation_pivot');
  r.anchors = { oldFrame: 2, blocked: 3 };
  withAnswer(r, 'R0', true);
  withAnswer(r, 'R1', true, { newFrame: 4 });
  withAnswer(r, 'R2', true, { uptake: 5 });
  const parsedR = parse(contract, 'representation_pivot', r);
  assert.deepEqual(parsedR.messageIds.R1, { newFrame: 'message-4' });
  assert.deepEqual(parsedR.messageIds.R2, { uptake: 'message-5' });
  assert.deepEqual(parsedR.anchorMessageIds, { oldFrame: 'message-2', blocked: 'message-3' });
  assert.equal(Object.hasOwn(parsedR.answers.R2.evidence, 'newFrame'), false);

  const detachedR2 = emptyOutput('representation_pivot');
  detachedR2.anchors = { oldFrame: 2, blocked: 3 };
  withAnswer(detachedR2, 'R0', true);
  withAnswer(detachedR2, 'R2', true, { uptake: 5 });
  assert.throws(() => parse(contract, 'representation_pivot', detachedR2), error => assertRetry(error, 'dependency'));

  const v = emptyOutput('verification_or_transfer');
  withAnswer(v, 'V1', true, { prompt: 8 });
  withAnswer(v, 'V2', true, { response: 9, prompt: 8 });
  assert.equal(parse(contract, 'verification_or_transfer', v).scoring.scores.verification_or_transfer, 2);
  v.answers.V2.evidence.response = 7;
  assert.throws(() => parse(contract, 'verification_or_transfer', v), error => assertRetry(error, 'order'));
});

test('assembly reports cross-dimension S3/P1 conflicts with both answers and citations', async () => {
  const contract = await loadV3();
  const parseAll = overrides => Object.fromEntries(dimensions.map(dimension => [
    dimension, parse(contract, dimension, overrides[dimension] ?? emptyOutput(dimension)),
  ]));

  const noP1 = emptyOutput('productive_struggle');
  const s3 = emptyOutput('support_escalation_and_fading');
  withAnswer(s3, 'S3', true, { opening: 2 });
  const missingP1 = contract.assembleBinaryVerdict(parseAll({
    support_escalation_and_fading: s3,
    productive_struggle: noP1,
  }));
  assert.deepEqual(missingP1.conflict, {
    code: 'S3_P1',
    questions: ['S3', 'P1'],
    citations: { S3: 2, P1: null },
    answers: { S3: true, P1: false },
  });

  const p1 = emptyOutput('productive_struggle');
  withAnswer(p1, 'P1', true, { opening: 4 });
  const mismatch = contract.assembleBinaryVerdict(parseAll({
    support_escalation_and_fading: s3,
    productive_struggle: p1,
  }));
  assert.equal(mismatch.conflict.code, 'S3_P1');
  assert.deepEqual(mismatch.conflict.citations, { S3: 2, P1: 4 });
  assert.deepEqual(mismatch.conflict.answers, { S3: true, P1: true });
});

test('assembled verdict groups citations, anchors, normalized input, and v3 scoring', async () => {
  const contract = await loadV3();
  const parts = Object.fromEntries(dimensions.map(dimension => [dimension, parse(contract, dimension, emptyOutput(dimension))]));
  const m = emptyOutput('misconception_repair');
  m.anchors.misconception = 1;
  withAnswer(m, 'M0', true);
  withAnswer(m, 'M1', true, { explanation: 4 });
  withAnswer(m, 'M2', true, { repair: 5 });
  parts.misconception_repair = parse(contract, 'misconception_repair', m);
  const a = emptyOutput('agency_handoff');
  withAnswer(a, 'A1', true, { step: 9, choice: null });
  withAnswer(a, 'A2', true, { choice: 9 });
  parts.agency_handoff = parse(contract, 'agency_handoff', a);
  const p = emptyOutput('productive_struggle');
  withAnswer(p, 'P0', true, { task: 1 });
  withAnswer(p, 'P2', true, { stuck: 3, hint: 4, attempt: 5 });
  parts.productive_struggle = parse(contract, 'productive_struggle', p);
  const r = emptyOutput('representation_pivot');
  r.anchors = { oldFrame: 2, blocked: 3 };
  withAnswer(r, 'R0', true);
  withAnswer(r, 'R1', true, { newFrame: 4 });
  withAnswer(r, 'R2', true, { uptake: 5 });
  parts.representation_pivot = parse(contract, 'representation_pivot', r);
  const v = emptyOutput('verification_or_transfer');
  withAnswer(v, 'V1', true, { prompt: 8 });
  withAnswer(v, 'V2', true, { response: 9, prompt: 8 });
  parts.verification_or_transfer = parse(contract, 'verification_or_transfer', v);

  const result = contract.assembleBinaryVerdict(parts);
  assert.equal(result.conflict, undefined);
  assert.deepEqual(result.verdict.anchors, {
    misconception_repair: { misconception: 1 },
    representation_pivot: { oldFrame: 2, blocked: 3 },
  });
  assert.equal(result.verdict.messageIds.M1.explanation, 'message-4');
  assert.equal(result.verdict.messageIds.R2.uptake, 'message-5');
  assert.deepEqual(result.verdict.scoring.scores, {
    misconception_repair: 2, support_escalation_and_fading: 'N/A', agency_handoff: 2,
    productive_struggle: 2, representation_pivot: 2, verification_or_transfer: 2,
  });
  assert.equal(result.verdict.scoring.ruler, 'e1-binary-v3');
  assert.deepEqual([result.verdict.scoring.points, result.verdict.scoring.possible, result.verdict.scoring.rate], [10, 10, 1]);
  assert.deepEqual(result.verdict.normalized.misconception_repair, []);
});

test('dimension transport binds one replayable view and carries neutral retry scope', async () => {
  const { binaryDimensionPayload, binaryDimensionPrompt, gradeBinaryDimension } = await loadV3();
  const dimension = 'agency_handoff';
  const payload = binaryDimensionPayload(view);
  assert.deepEqual(payload.messages[0], { n: 1, role: 'learner', text: messages[0].text });
  assert.deepEqual(payload.messages.at(-1), { n: 11, role: 'learner', text: messages[10].text });
  const prompt = binaryDimensionPrompt(view, dimension);
  assert.match(prompt, /^Judge only the public teacher–learner dialogue/);
  assert.match(prompt, /A1:/);
  assert.match(prompt, /A2:/);
  assert.doesNotMatch(prompt, /M0:/);

  let received;
  const models = {
    usesStructuredJudgement: role => role === 'judge',
    async complete(scope, context, validate, schema) {
      received = { scope, context, schema };
      const value = validate(encoded(emptyOutput(dimension)), {}, []);
      return { value, location: { role: 'judge', turn: 6, call: 3, attempt: 2, attemptPath: 'calls/judge.json' } };
    },
  };
  const result = await gradeBinaryDimension(models, messages, {
    turn: 6, runId: 'binary-v3', cell: 'normal', sourceRunId: 'source-v3',
    repetition: 2, dimension, nextAttempt: 2, retryFeedback: 'order',
  });
  assert.equal(received.scope.call, 3);
  assert.equal(received.scope.nextAttempt, 2);
  assert.equal(received.scope.retryFeedback, 'order');
  assert.equal(received.scope.binding.dimension, dimension);
  assert.equal(received.scope.binding.viewHash, view.id);
  assert.deepEqual(received.scope.binding.messageIds, messages.map(row => row.id));
  assert.deepEqual(JSON.parse(received.context.messages[0].content), payload);
  assert.match(received.context.systemPrompt, /A1:/);
  assert.equal(received.schema.properties.answers.required.length, 2);
  assert.equal(result.verdict.answers.A1.answer, false);
  assert.equal(result.binding.dimension, dimension);
});
