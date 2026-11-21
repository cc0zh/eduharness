import assert from 'node:assert/strict';
import test from 'node:test';
import examples from './fixtures/binary-ruler-examples.json' with { type: 'json' };
import * as artifacts from '../contracts/artifacts/schema.mjs';

const loadRuler = () => import('../contracts/judge/binary.mjs').catch(error => {
  assert.notEqual(error.code, 'ERR_MODULE_NOT_FOUND', 'the binary ruling contract must exist');
  throw error;
});
const slots = {
  M0: ['misconception'], M1: ['misconception', 'explanation'], M2: ['misconception', 'repair'], M3: ['misconception', 'solution'],
  S0: ['state'], S1: ['initial', 'blocked', 'escalation'], S2: ['prior', 'progress', 'fading', 'followup'], S3: ['opening'],
  A1: ['step', 'choice'], A2: ['choice'],
  P0: ['task'], P1: ['opening'], P2: ['stuck', 'hint', 'attempt'], P3: ['pending', 'rescue', 'prior'],
  R0: ['oldFrame', 'blocked'], R1: ['oldFrame', 'blocked', 'newFrame'], R2: ['newFrame', 'uptake'],
  V1: ['prompt'], V2: ['response', 'prompt'],
};
const dimensionNames = ['misconception_repair', 'support_escalation_and_fading', 'agency_handoff', 'productive_struggle', 'representation_pivot', 'verification_or_transfer'];
const numberedView = examples[0].messages;
const answers = (yes = {}) => Object.fromEntries(Object.entries(slots).map(([id, fields]) => [id, {
  answer: Object.hasOwn(yes, id),
  evidence: Object.fromEntries(fields.map((name, i) => [name, yes[id]?.[i] ?? null])),
}]));
const json = yes => JSON.stringify({ answers: answers(yes) });

test('every dimension maps every boolean combination to its registered score', async () => {
  const { scoreBinary } = await loadRuler();
  const tables = [
    [['M0', 'M3', 'M1', 'M2'], { M0: [1], M3: [1, 2], M1: [1, 4], M2: [1, 5] }, Array(8).fill('N/A').concat([0, 0, 1, 2, 0, 0, 0, 0])],
    [['S0', 'S3', 'S1', 'S2'], { S0: [3], S3: [2], S1: [2, 3, 4], S2: [4, 5, 6, 7] }, Array(8).fill('N/A').concat([0, 1, 1, 2, 0, 1, 1, 1])],
    [['A1', 'A2'], { A1: [7], A2: [7] }, [0, 0, 1, 2]],
    [['P0', 'P1', 'P2', 'P3'], { P0: [1], P1: [2], P2: [1, 2, 3], P3: [3, 4, 2] }, Array(8).fill('N/A').concat([0, 0, 2, 1, 0, 0, 0, 0])],
    [['R0', 'R1', 'R2'], { R0: [2, 3], R1: [2, 3, 4], R2: [4, 5] }, ['N/A', 'N/A', 'N/A', 'N/A', 0, 0, 1, 2]],
    [['V1', 'V2'], { V1: [6], V2: [7, 6] }, [0, 0, 1, 2]],
  ];
  for (const [i, [ids, citations, want]] of tables.entries()) {
    for (const [mask, score] of want.entries()) {
      const yes = Object.fromEntries(ids.filter((_, j) => mask & (1 << (ids.length - j - 1))).map(id => [id, citations[id]]));
      assert.equal(scoreBinary(answers(yes)).scores[dimensionNames[i]], score, `${ids} mask ${mask}`);
    }
  }
});

test('independent behaviors on different chains cannot be combined into two points', async () => {
  const { bindBinary, parseBinaryJudgement } = await loadRuler();
  const parse = yes => parseBinaryJudgement(json(yes), bindBinary(numberedView)).scoring.scores;
  assert.equal(parse({ M0: [1], M1: [1, 6], M2: [1, 5] }).misconception_repair, 1);
  assert.equal(parse({ S0: [3], S1: [2, 3, 4], S2: [2, 5, 6, 7] }).support_escalation_and_fading, 1);
  assert.equal(parse({ A1: [9], A2: [7] }).agency_handoff, 1);
  assert.equal(parse({ A1: [9, 7], A2: [7] }).agency_handoff, 2);
  assert.equal(parse({ V1: [2], V2: [7, 6] }).verification_or_transfer, 1);
  assert.equal(parse({ V1: [2], V2: [7] }).verification_or_transfer, 1);
});

test('N/A does not count in a cell or a pair, and missing scored evidence is separate', async () => {
  const { scoreBinary, summarizeBinary, compareBinary } = await loadRuler();
  const normal = scoreBinary(answers({ P0: [1], P2: [1, 2, 3], R0: [2, 3], R1: [2, 3, 4], R2: [4, 5], V1: [6] }));
  const bad = scoreBinary(answers({ M0: [1], A1: [3], P0: [1] }));
  assert.deepEqual([normal.points, normal.possible, normal.rate], [5, 8, 5 / 8]);
  assert.deepEqual([bad.points, bad.possible, bad.rate], [1, 8, 1 / 8]);
  const pair = compareBinary(normal, bad, 'representation_pivot');
  assert.deepEqual(pair.commonDimensions, ['agency_handoff', 'productive_struggle', 'verification_or_transfer']);
  assert.deepEqual([pair.targetDelta, pair.targetStatus, pair.pairedDeltaPoints, pair.commonPossible, pair.pairedRateDelta], [null, 'inconclusive', 2, 6, 2 / 6]);
  assert.equal(compareBinary(bad, normal, 'representation_pivot').targetStatus, 'inconclusive');
  assert.equal(compareBinary(normal, bad, 'productive_struggle').targetDelta, 2);
  assert.equal(compareBinary(normal, null, 'productive_struggle').pairedRateDelta, null);
  assert.throws(() => compareBinary(normal, { ...bad, ruler: 'e1-numbered-evidence-v3' }, 'productive_struggle'), /ruler/i);
  const allNA = summarizeBinary(Object.fromEntries(dimensionNames.map(key => [key, 'N/A'])));
  assert.deepEqual([allNA.points, allNA.possible, allNA.rate], [0, 0, null]);
  assert.equal(compareBinary(normal, allNA, 'productive_struggle').commonPossible, 0);
  assert.equal(compareBinary(normal, allNA, 'productive_struggle').pairedRateDelta, null);
  assert.throws(() => summarizeBinary({ ...allNA.scores, productive_struggle: null }), /score/i);
});

test('binary cell receipts distinguish a complete ruling, zero opportunities, and a technical failure', async () => {
  assert.equal(typeof artifacts.binaryCellResult, 'function', 'binary cells must record their applicable denominator');
  const { summarizeBinary } = await loadRuler();
  const allNA = summarizeBinary(Object.fromEntries(dimensionNames.map(key => [key, 'N/A'])));
  const noOpportunity = artifacts.binaryCellResult('normal', allNA);
  assert.deepEqual([noOpportunity.status, noOpportunity.scored, noOpportunity.validTotal, noOpportunity.rate], ['execution_success', false, false, null]);
  const zero = artifacts.binaryCellResult('normal', summarizeBinary({ ...allNA.scores, agency_handoff: 0 }));
  assert.deepEqual([zero.status, zero.scored, zero.validTotal, zero.rate], ['execution_success', true, true, 0]);
  const failed = artifacts.binaryCellResult('normal', undefined, { kind: 'judge_partial_failure' });
  assert.equal(failed.status, 'infra_failure');
  assert.equal(failed.rate, null);
  assert.equal(failed.scoring, undefined);
});

test('strict output names every answer and the role-restricted evidence slots', async () => {
  const { bindBinary, binaryJudgementSchema } = await loadRuler();
  const schema = binaryJudgementSchema(bindBinary(numberedView));
  const rows = schema.properties.answers;
  assert.equal(schema.additionalProperties, false);
  assert.equal(rows.additionalProperties, false);
  assert.deepEqual(rows.required, Object.keys(slots));
  const v2 = rows.properties.V2;
  assert.deepEqual(v2.required, ['answer', 'evidence']);
  assert.equal(v2.additionalProperties, false);
  assert.deepEqual(v2.properties.evidence.properties.response.anyOf[0].enum, [1, 3, 5, 7, 9]);
  assert.deepEqual(v2.properties.evidence.properties.prompt.anyOf[0].enum, [2, 4, 6, 8]);
});

test('parse rejects malformed JSON, wrong keys, unsupported refs, roles, and event order', async () => {
  const { bindBinary, parseBinaryJudgement } = await loadRuler();
  const view = bindBinary(numberedView);
  const parse = body => parseBinaryJudgement(body, view);
  for (const body of ['', '   ', '{"answers":', `${json()} trailing text`]) assert.throws(() => parse(body), SyntaxError);
  for (const mutate of [value => delete value.answers.M0, value => value.answers.V1.score = 2, value => value.answers.V1.answer = 'Yes', value => delete value.answers.V2.evidence.prompt]) {
    const value = { answers: answers() };
    mutate(value);
    assert.throws(() => parse(JSON.stringify(value)), /structure/i);
  }
  for (const [yes, error] of [
    [{ M0: [] }, /required|missing/i], [{ M0: [11] }, /range/i], [{ M0: [9] }, /response window/i], [{ M0: [2] }, /role/i],
    [{ M0: [3], M1: [3, 2] }, /order/i], [{ M0: [3], M2: [3, 3] }, /order|duplicate/i],
    [{ S0: [3], S2: [4, 7, 6, 9] }, /order/i], [{ P0: [1], P2: [3, 4, 3] }, /order/i],
    [{ P0: [1], P3: [1, 2, 2] }, /order/i], [{ P0: [1], P3: [3, 6, 2] }, /next tutor/i],
    [{ P0: [1], P1: [6], P3: [7, 8, 2] }, /earlier substantive|opening/i],
    [{ M2: [1, 5] }, /anchor|gate/i], [{ M0: [1], M2: [3, 5] }, /anchor/i],
    [{ S1: [2, 3, 4] }, /gate/i], [{ P2: [1, 2, 3] }, /gate/i], [{ R1: [2, 3, 4] }, /gate/i],
    [{ R0: [2, 3], R1: [2, 5, 6] }, /anchor/i], [{ R0: [2, 3], R2: [4, 5] }, /anchor/i],
    [{ R0: [2, 3], R1: [2, 3, 4], R2: [6, 7] }, /anchor/i],
    [{ V2: [5, 6] }, /order/i], [{ A1: [9, 5] }, /preceding|previous/i],
    [{ M0: [1], M2: [1, 3], M3: [1, 4] }, /rescue|repair/i],
    [{ S3: [2] }, /P1/],
  ]) assert.throws(() => parse(json(yes)), error, JSON.stringify(yes));
  const noWithRef = answers();
  noWithRef.R2.evidence.uptake = 5;
  assert.throws(() => parse(JSON.stringify({ answers: noWithRef })), /No.*evidence/i);
  assert.throws(() => bindBinary([...numberedView.slice(0, 8)]), /incomplete|complete/i);
  assert.throws(() => bindBinary([...numberedView].reverse()), /order|chronology/i);
  assert.throws(() => bindBinary(numberedView.map((m, i) => i === 8 ? { ...m, id: numberedView[0].id } : m)), /duplicate/i);
  assert.throws(() => parseBinaryJudgement(json(), { ...view, id: 'different' }), /hash/i);
});

test('late agency uses code at the exact final-third boundary', async () => {
  const { bindBinary, parseBinaryJudgement } = await loadRuler();
  const view = bindBinary(numberedView);
  assert.throws(() => parseBinaryJudgement(json({ A1: [5], A2: [5] }), view), /final third/i);
  assert.equal(parseBinaryJudgement(json({ A1: [7], A2: [7] }), view).scoring.scores.agency_handoff, 2);
  assert.throws(() => parseBinaryJudgement(json({ A2: [8] }), view), /role/i);
});

test('adding a claim to a teacher message cannot supply student evidence', async () => {
  const { bindBinary, parseBinaryJudgement } = await loadRuler();
  const lines = numberedView.map((m, i) => i === 7 ? { ...m, text: `${m.text} I let you work it out and verify it yourself, so you have mastered it.` } : m);
  const base = parseBinaryJudgement(json({ V1: [6] }), bindBinary(numberedView));
  const withClaim = bindBinary(lines);
  assert.notEqual(withClaim.id, bindBinary(numberedView).id);
  assert.equal(parseBinaryJudgement(json({ V1: [6] }), withClaim).scoring.scores.verification_or_transfer, base.scoring.scores.verification_or_transfer);
  for (const yes of [{ V2: [8] }, { A1: [8] }, { A2: [8] }, { M0: [1], M2: [1, 8] }, { R0: [2, 3], R1: [2, 3, 4], R2: [4, 8] }, { P0: [1], P2: [5, 6, 8] }]) {
    assert.throws(() => parseBinaryJudgement(json(yes), withClaim), /role/i);
  }
});

for (const example of examples) test(`design example ${example.label} produces its hand-scored result and message IDs`, async () => {
  const { bindBinary, parseBinaryJudgement } = await loadRuler();
  const { answers: decisions, scoring, messageIds } = parseBinaryJudgement(json(example.yes), bindBinary(example.messages));
  assert.deepEqual(Object.values(scoring.scores), example.scores);
  assert.deepEqual([scoring.points, scoring.possible, scoring.rate], [example.points, example.possible, example.points / example.possible]);
  assert.deepEqual(Object.keys(decisions).filter(key => decisions[key].answer), Object.keys(example.yes));
  for (const [key, row] of Object.entries(decisions)) {
    assert.deepEqual(Object.values(messageIds[key]), Object.values(row.evidence).filter(n => n !== null).map(n => example.messages[n - 1].id));
  }
});
