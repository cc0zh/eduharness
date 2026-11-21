import assert from 'node:assert/strict';
import test from 'node:test';

const loadReport = () => import('../scripts/s1-binary-report.mjs').catch(error => {
  assert.notEqual(error.code, 'ERR_MODULE_NOT_FOUND', 'the S1 report must compute the preregistered diagnostics');
  throw error;
});

test('confusion counts use expectations and preserve missing judgements separately', async () => {
  const { confusion } = await loadReport();
  const expected = { normal: { R0: null, V1: null }, answer_dump: { R0: true, V1: false }, no_teach: { R0: false, V1: false } };
  const responses = [
    { id: 'normal', answers: { R0: { answer: true }, V1: { answer: true } } },
    { id: 'answer_dump', answers: { R0: { answer: true }, V1: { answer: false } } },
    { id: 'answer_dump', answers: { R0: { answer: false }, V1: { answer: true } } },
    { id: 'answer_dump', answers: null },
    { id: 'no_teach', answers: { R0: { answer: true }, V1: { answer: false } } },
    { id: 'no_teach', answers: { R0: { answer: false }, V1: { answer: false } } },
    { id: 'no_teach', answers: null },
  ];
  const stats = confusion(expected, responses);
  assert.deepEqual(stats.questions.R0, { tp: 1, fn: 1, fp: 1, tn: 1, missingYes: 1, missingNo: 1 });
  assert.deepEqual(stats.questions.V1, { tp: 0, fn: 0, fp: 1, tn: 3, missingYes: 0, missingNo: 2 });
  assert.deepEqual(stats.total, { tp: 1, fn: 1, fp: 2, tn: 4, missingYes: 1, missingNo: 3 });
  assert.deepEqual(stats.gates.R0, stats.questions.R0);
  assert.equal(stats.gates.V1, undefined);
});

test('agreement uses paired repeats and distinguishes N/A, 0 and technical missingness', async () => {
  const { agreement } = await loadReport();
  const scores = (...values) => Object.fromEntries(['misconception_repair', 'support_escalation_and_fading', 'agency_handoff', 'productive_struggle', 'representation_pivot', 'verification_or_transfer'].map((key, i) => [key, values[i] ?? 0]));
  const samples = [
    { repetition: 'r1', id: 'normal', scoring: { scores: scores(0, 1, 1, 2, 'N/A', 0) } },
    { repetition: 'r2', id: 'normal', scoring: { scores: scores(0, 1, 1, 2, 0, 0) } },
    { repetition: 'r3', id: 'normal', scoring: { scores: scores(0, 1, 1, 2, 'N/A', 0) } },
    { repetition: 'r1', id: 'lecture', scoring: { scores: scores(0, 0, 0, 0, 'N/A', 0) } },
    { repetition: 'r2', id: 'lecture', scoring: { scores: scores(0, 0, 0, 0, 'N/A', 0) } },
  ];
  const pivot = agreement(samples).representation_pivot;
  assert.deepEqual(pivot, { 'r1/r2': [1, 2], 'r1/r3': [1, 1], 'r2/r3': [0, 1], all: [0, 1] });
});

test('a higher bad-teacher rate, N/A target and missing repeats are not hits', async () => {
  const { assessS1 } = await import('../src/s1-binary-plan.mjs');
  const { summarizeBinary } = await import('../contracts/judge/binary.mjs');
  const dimensions = ['misconception_repair', 'support_escalation_and_fading', 'agency_handoff', 'productive_struggle', 'representation_pivot', 'verification_or_transfer'];
  const score = values => summarizeBinary(Object.fromEntries(dimensions.map((key, i) => [key, values[i]])));
  const sample = (id, values) => ({ repetition: 'r1', id, scoring: score(values) });
  const result = assessS1([
    sample('normal', [1, 0, 0, 2, 0, 1]), sample('answer_dump', [2, 2, 2, 'N/A', 2, 2]),
  ]);
  assert.equal(result.passed, false);
  assert.equal(result.ratePasses, 0);
  assert.equal(result.targetHits.answer_dump, 0);
  assert.equal(result.paired[0].pairs[0].totalDirection, 'higher');
  assert.equal(result.paired[0].pairs[0].targetStatus, 'inconclusive');
  assert.equal(result.paired[1].pairs[0].totalDirection, 'inconclusive');
});
