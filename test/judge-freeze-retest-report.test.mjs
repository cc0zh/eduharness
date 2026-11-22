import assert from 'node:assert/strict';
import test from 'node:test';

const report = await import('../scripts/judge-freeze-retest-report.mjs').catch(error => {
  assert.notEqual(error.code, 'ERR_MODULE_NOT_FOUND', 'the freeze retest report module must exist');
  throw error;
});

const DIMS = ['misconception_repair', 'support_escalation_and_fading', 'agency_handoff',
  'productive_struggle', 'representation_pivot', 'verification_or_transfer'];
const CONDITIONS = ['normal', 'answer_dump', 'lecture', 'sycophant_close', 'no_teach'];
const TARGETS = {
  answer_dump: 'productive_struggle', lecture: 'agency_handoff',
  sycophant_close: 'verification_or_transfer', no_teach: 'misconception_repair',
};
const ALLQ = ['M0', 'M1', 'M2', 'M3', 'S0', 'S1', 'S2', 'S3', 'A1', 'A2', 'P0', 'P1', 'P2', 'P3', 'R0', 'R1', 'R2', 'V1', 'V2'];
const NORMAL_CASES = ['b-geo', 'V2-normal-explain', 'V2-normal-guess', 'V2-normal-claim'];

test('a missing directed registration cannot pass the freeze gates', () => {
  const input = makeFixture();
  const result = report.analyzeJudgeFreeze({ ...input, plan: { ...input.plan, primary: undefined } });
  assert.equal(result.gates.directed, false);
  assert.equal(result.frozen, false);
});

function score(overrides = {}) {
  const scores = Object.fromEntries(DIMS.map(dimension => [dimension, overrides[dimension] ?? 1]));
  const applicable = DIMS.filter(dimension => scores[dimension] !== 'N/A');
  const points = applicable.reduce((sum, dimension) => sum + scores[dimension], 0);
  return { ruler: 'e1-binary-v3', scores, applicable, points, possible: 2 * applicable.length, rate: applicable.length ? points / (2 * applicable.length) : null };
}

function s1Score(repetition, condition, flatten) {
  if (condition === 'normal') return score(Object.fromEntries(DIMS.map(dimension => [dimension, 2])));
  const overrides = Object.fromEntries(DIMS.map(dimension => [dimension, 1]));
  overrides[TARGETS[condition]] = flatten ? 2 : 0;
  return score(overrides);
}

function ans(value) {
  if (value == null) return { answer: false };
  if (typeof value === 'boolean') return { answer: value };
  return { answer: value.answer, ...(value.evidence && { evidence: value.evidence }) };
}
const answers = (overrides = {}) => Object.fromEntries(ALLQ.map(question => [question, ans(overrides[question])]));

const PRIMARY = [
  { id: 'V2-normal-explain', baseline: 'b-geo', target: 'V2', kind: 'up', before: { V1: true, V2: false, A1: true, A2: false }, truth: { V1: true, V2: true, A1: true, A2: false } },
  { id: 'V2-normal-guess', baseline: 'b-geo', target: 'V2', kind: 'boundary', before: { V1: true, V2: false, A1: true, A2: false }, truth: { V1: true, V2: false, A1: true, A2: false } },
  { id: 'V2-normal-claim', baseline: 'b-geo', target: 'V2', kind: 'rhetoric', before: { V1: true, V2: false, A1: true, A2: false }, truth: { V1: true, V2: false, A1: true, A2: false } },
  { id: 'A1-only-proposes', baseline: 'b-geo', target: 'A1', kind: 'down', before: { V1: true, V2: false, A1: true, A2: false }, truth: { V1: true, V2: false, A1: false, A2: false } },
  { id: 'A2-assigned-multiplier', baseline: 'b-root', target: 'A2', kind: 'down', before: { V1: false, V2: true, A1: true, A2: true }, truth: { V1: false, V2: true, A1: true, A2: false } },
  { id: 'V1-ask-leave-result', baseline: 'b-quiet', target: 'V1', kind: 'up', before: { V1: false, V2: false, A1: null, A2: null }, truth: { V1: true, V2: false, A1: null, A2: null } },
  { id: 'M0-claim-corrected', baseline: 'b-counts', target: 'M0', kind: 'rhetoric', before: { V1: false, V2: false, A1: false, A2: false }, truth: { V1: false, V2: false, A1: false, A2: false } },
  { id: 'A1-right-angle', baseline: 'b-echo', target: 'A1', kind: 'up', before: { V1: false, V2: false, A1: false, A2: false }, truth: { V1: false, V2: true, A1: true, A2: false } },
  { id: 'A2-choose-identity-test', baseline: 'b-copy', target: 'A2', kind: 'up', before: { V1: false, V2: false, A1: false, A2: false }, truth: { V1: false, V2: false, A1: false, A2: true } },
  { id: 'P0-known-number-not-done', baseline: 'b-counts', target: 'P0', kind: 'rhetoric', before: { V1: false, V2: false, A1: false, A2: false }, truth: { V1: false, V2: false, A1: false, A2: false } },
  { id: 'V1-ask-and-answer', baseline: 'b-echo', target: 'V1', kind: 'up', before: { V1: false, V2: false, A1: false, A2: false }, truth: { V1: true, V2: true, A1: true, A2: false } },
  { id: 'A1-only-copies', baseline: 'b-copy', target: 'A1', kind: 'rhetoric', before: { V1: false, V2: false, A1: false, A2: false }, truth: { V1: false, V2: false, A1: false, A2: false } },
  { id: 'A2-followed-procedure', baseline: 'b-powers', target: 'A2', kind: 'rhetoric', before: { V1: true, V2: false, A1: null, A2: false }, truth: { V1: true, V2: false, A1: null, A2: false } },
  { id: 'V1-claim-unobserved', baseline: 'b-echo', target: 'V1', kind: 'rhetoric', before: { V1: false, V2: false, A1: false, A2: false }, truth: { V1: false, V2: false, A1: false, A2: false } },
  { id: 'A1-claim-only-copies', baseline: 'b-root', target: 'A1', kind: 'rhetoric', before: { V1: false, V2: true, A1: true, A2: true }, truth: { V1: false, V2: true, A1: true, A2: true } },
  { id: 'A2-still-chosen', baseline: 'b-diff', target: 'A2', kind: 'rhetoric', before: { V1: true, V2: true, A1: true, A2: true }, truth: { V1: true, V2: true, A1: true, A2: true } },
  { id: 'V1-claim-none', baseline: 'b-geo', target: 'V1', kind: 'rhetoric', before: { V1: true, V2: false, A1: true, A2: false }, truth: { V1: true, V2: false, A1: true, A2: false } },
  { id: 'V2-new-case', baseline: 'b-gas', target: 'V2', kind: 'up', before: { V1: false, V2: false, A1: false, A2: false }, truth: { V1: true, V2: true, A1: true, A2: false } },
  { id: 'V1-ask-if-clear', baseline: 'b-gas', target: 'V1', kind: 'boundary', before: { V1: false, V2: false, A1: false, A2: false }, truth: { V1: false, V2: false, A1: false, A2: false } },
  { id: 'V2-genuine-reason', baseline: 'b-diff', target: 'V2', kind: 'rhetoric', before: { V1: true, V2: true, A1: true, A2: true }, truth: { V1: true, V2: true, A1: true, A2: true } },
];

const BASELINE = {
  'b-geo': { V1: true, V2: false, A1: true, A2: false },
  'b-root': { A1: true, A2: true },
  'b-quiet': { V1: false },
  'b-echo': { V1: false, A1: false },
  'b-copy': { A1: false, A2: false },
  'b-powers': { A2: false },
  'b-diff': { A2: true, V2: true },
  'b-gas': { V1: false, V2: false },
};

const ARCHIVE = [
  ['b-geo', 'baseline'], ['V2-normal-explain', 'primary'], ['V2-normal-guess', 'primary'], ['V2-normal-claim', 'primary'],
  ['b-root', 'baseline'], ['b-quiet', 'baseline'], ['b-counts', 'baseline'], ['b-echo', 'baseline'], ['b-copy', 'baseline'],
  ['b-powers', 'baseline'], ['b-diff', 'baseline'], ['b-gas', 'baseline'], ['b-rings', 'baseline'],
  ['A1-only-proposes', 'primary'], ['A2-assigned-multiplier', 'primary'], ['V1-ask-leave-result', 'primary'], ['M0-claim-corrected', 'primary'],
  ['A1-right-angle', 'primary'], ['A2-choose-identity-test', 'primary'], ['P0-known-number-not-done', 'primary'], ['V1-ask-and-answer', 'primary'],
  ['A1-only-copies', 'primary'], ['A2-followed-procedure', 'primary'], ['V1-claim-unobserved', 'primary'], ['A1-claim-only-copies', 'primary'],
  ['A2-still-chosen', 'primary'], ['V1-claim-none', 'primary'], ['V2-new-case', 'primary'], ['V1-ask-if-clear', 'primary'], ['V2-genuine-reason', 'primary'],
  ['A1-only-proposes-r2', 'repeat'], ['A2-followed-procedure-r2', 'repeat'], ['V2-normal-explain-r2', 'repeat'], ['V2-normal-guess-r2', 'repeat'],
  ['S1-leave-inner-integral', 'repeat-only'], ['S1-leave-inner-integral-r2', 'repeat'],
];

const PLAN = {
  runId: 'round2-binary-v3-freeze-gemini-01',
  primary: PRIMARY,
  repeatIds: ['A1-only-proposes', 'A2-followed-procedure', 'V2-normal-explain', 'V2-normal-guess', 'S1-leave-inner-integral'],
  freeze: { judge: 'gemini-3.8-flash', ruler: 'e1-binary-v3' },
};

function normalCaseAnswers(index, badCite) {
  const base = { V1: { answer: true, evidence: { prompt: 4 } }, V2: false, A1: true, A2: false };
  if (index === 1) base.V2 = { answer: true, evidence: { prompt: 4, response: badCite ? 4 : 5 } };
  return answers(base);
}

function makeFixture(options = {}) {
  const mode = options.mode ?? 'real';
  const verified = options.verified ?? true;
  const drop = new Set(options.drop ?? []);
  const flatten = options.s1Flat ?? false;
  const badCite = options.badCite ?? false;
  const lowRecall = options.lowRecall ?? false;

  const s1Rows = ['r1', 'r2', 'r3'].flatMap(repetition => CONDITIONS.map(condition => ({ id: `${repetition}/${condition}`, repetition, condition })));
  const planned = [
    ...s1Rows.map(row => ({ id: row.id, sourceRunId: 'fixture-source', transcriptSha256: 'a'.repeat(64) })),
    ...ARCHIVE.map(([id, purpose]) => ({ id, sourceRunId: 'fixture-source', archive: `fixture-source/${id}`, transcriptSha256: 'a'.repeat(64), purpose })),
  ];

  const scoringForFolder = folder => {
    if (folder.includes('/')) return s1Score(folder.split('/')[0], folder.split('/')[1], flatten);
    const base = folder.endsWith('-r2') ? folder.slice(0, -3) : folder;
    const index = NORMAL_CASES.indexOf(base);
    if (index >= 0) return score({ verification_or_transfer: [1, 2, 1, 1][index] });
    return score();
  };

  const answersForFolder = folder => {
    if (folder.includes('/')) {
      const condition = folder.split('/')[1];
      return condition === 'normal'
        ? answers({ V1: { answer: true, evidence: { prompt: 4 } }, V2: false })
        : answers({});
    }
    const base = folder.endsWith('-r2') ? folder.slice(0, -3) : folder;
    const index = NORMAL_CASES.indexOf(base);
    if (index >= 0) return normalCaseAnswers(index, badCite);
    const primary = PRIMARY.find(row => row.id === base);
    if (primary) {
      const overrides = {};
      const target = primary.target;
      overrides[target] = lowRecall && base === 'V2-new-case' ? false : primary.truth[target];
      return answers(overrides);
    }
    if (BASELINE[base]) return answers(BASELINE[base]);
    return answers({});
  };

  const selected = new Map();
  for (const row of planned) {
    if (drop.has(row.id)) continue;
    const scoring = scoringForFolder(row.id);
    selected.set(row.id, {
      folder: row.id, processIndex: 1,
      row: { id: row.id, validTotal: true, scoring },
      judgement: { verdict: { answers: answersForFolder(row.id), messageIds: {}, anchors: {}, scoring } },
    });
  }

  const manifest = {
    id: PLAN.runId, mode, scenario: 'S1-judge-bakeoff', writer: { pid: 4242 },
    identity: { ruler: 'e1-binary-v3', version: 'evaluation-identity-v5', judgeOutputContract: 'judge-output-v5' },
    planned, limits: { maxAttempts: 498, maxRequestedOutputTokens: 498 * 4096 },
  };
  const verification = {
    runId: PLAN.runId, verified, mode, exitCode: 0, acceptance: true, requestCount: 0,
    processes: [{ processIndex: 1, pid: 4242, interrupted: false, requestCount: 0, exitCode: 0 }],
  };
  return { manifest, selected, verification, plan: PLAN };
}

const run = (options = {}) => report.analyzeJudgeFreeze(makeFixture(options));

test('a complete verified real batch with all gates met freezes', () => {
  const result = run();
  assert.equal(result.plannedTotal, 51);
  assert.equal(result.details.completeness.total, 49);
  assert.deepEqual(result.details.completeness.descriptive.map(row => row.id).sort(), ['M0-claim-corrected', 'P0-known-number-not-done'].sort());
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.gates, { realVerified: true, complete: true, s1: true, directed: true, normal: true, repeats: true });
  assert.equal(result.frozen, true);
  assert.deepEqual(result.details.s1.targetHits, { answer_dump: 3, lecture: 3, sycophant_close: 3, no_teach: 3 });
  assert.equal(result.details.s1.ratePasses, 3);
  assert.equal(result.details.s1.complete, 15);
  assert.equal(result.details.directed.perTarget.V2.recall, 1);
  assert.equal(result.details.directed.perTarget.V2.specificity, 1);
  assert.ok(result.details.directed.perTarget.V1.flipObserved >= 1);
  assert.ok(result.details.directed.perTarget.A2.controlObserved >= 1);
  assert.equal(result.details.normal.pass, true);
  assert.deepEqual(result.details.normal.cases.map(row => row.vscore), [1, 2, 1, 1]);
  assert.equal(result.details.repeats.pairs.length, 5);
  assert.ok(result.details.repeats.pairs.every(pair => pair.present));
});

test('the two descriptive rhetoric cases are reported but not required for freeze', () => {
  const result = run({ drop: ['M0-claim-corrected', 'P0-known-number-not-done'] });
  assert.equal(result.gates.complete, true);
  assert.equal(result.frozen, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.details.completeness.descriptive, [
    { id: 'M0-claim-corrected', complete: false },
    { id: 'P0-known-number-not-done', complete: false },
  ]);
});

test('v4 reports incorrect and missing side evidence without counting it in the freeze gates', () => {
  const fixture = makeFixture();
  fixture.manifest.identity.ruler = 'e1-binary-v4';
  fixture.plan = { ...fixture.plan, probes: [
    { id: 'probe-v1-incorrect', target: 'V1', base: 'b-geo', truth: true, anchor: 4 },
    { id: 'probe-a2-missing', target: 'A2', base: 'b-copy', truth: false, anchor: 7 },
  ] };
  fixture.manifest.planned.push(...fixture.plan.probes.map(({ id }) => ({ id, purpose: 'side-evidence' })));
  const original = fixture.selected.get('b-copy');
  fixture.selected.set('probe-v1-incorrect', { ...original,
    judgement: { ...original.judgement, binding: { dimensions: { verification_or_transfer: { callId: 'probe-v1-incorrect:judge:4:6:1' } } } } });
  const result = report.analyzeJudgeFreeze(fixture);
  assert.equal(result.frozen, true);
  assert.equal(result.details.completeness.total, 49);
  assert.deepEqual(result.details.probes.map(({ id, observed, hit }) => [id, observed, hit]), [
    ['probe-v1-incorrect', false, false], ['probe-a2-missing', null, null],
  ]);
  const markdown = report.renderFreezeReport(result);
  assert.match(markdown, /probe-v1-incorrect:judge:4:6:1/);
  assert.match(markdown, /probe-a2-missing/);
});

test('offline or unverified batches never freeze', () => {
  assert.equal(run({ mode: 'offline' }).gates.realVerified, false);
  assert.equal(run({ mode: 'offline' }).frozen, false);
  const unverified = run({ verified: false });
  assert.equal(unverified.gates.realVerified, false);
  assert.equal(unverified.frozen, false);
});

test('missing planned cells fail completeness, are listed by id, and never inferred as No', () => {
  const result = run({ drop: ['r2/lecture', 'V2-new-case'] });
  assert.equal(result.gates.complete, false);
  assert.equal(result.frozen, false);
  assert.deepEqual(result.missing.sort(), ['V2-new-case', 'r2/lecture'].sort());
  assert.equal(result.details.s1.pass, false);
  assert.equal(result.details.directed.perTarget.V2.variantsPresent, false);
  const v2 = result.details.directed.perTarget.V2.confusion;
  assert.ok(v2.missingYes >= 1, 'a missing truth-Yes cell is counted missing, not No');
});

test('an S1 target that does not drop strictly below normal fails the S1 gate', () => {
  const result = run({ s1Flat: true });
  assert.equal(result.gates.s1, false);
  assert.equal(result.frozen, false);
  assert.notDeepEqual(result.details.s1.targetHits, { answer_dump: 3, lecture: 3, sycophant_close: 3, no_teach: 3 });
});

test('directed 可靠 fails when recall falls under 0.8 without inventing a missing answer', () => {
  const result = run({ lowRecall: true });
  assert.equal(result.details.directed.perTarget.V2.recall, 2 / 3);
  assert.equal(result.details.directed.perTarget.V2.pass, false);
  assert.equal(result.gates.directed, false);
  assert.equal(result.frozen, false);
});

test('an observed flip pair counts for the gate even when it is not a both-side hit', () => {
  const fixture = makeFixture();
  // b-echo A1 is the baseline for A1-right-angle (before A1 = false). Breaking the baseline keeps the pair observed but not a hit.
  fixture.selected.get('b-echo').judgement.verdict.answers.A1.answer = true;
  const result = report.analyzeJudgeFreeze(fixture);
  const a1 = result.details.directed.perTarget.A1;
  assert.ok(a1.flipObserved >= 1);
  assert.ok(a1.flipHits < a1.flipObserved, 'the strict both-side hit must be reported separately from an observed pair');
  assert.equal(a1.pass, true);
  assert.equal(result.gates.directed, true);
});

test('the normal gate fails when V2-normal-explain cites the wrong response message', () => {
  const result = run({ badCite: true });
  assert.equal(result.details.normal.pass, false);
  assert.equal(result.gates.normal, false);
  assert.equal(result.frozen, false);
  const explain = result.details.normal.cases.find(row => row.id === 'V2-normal-explain');
  assert.equal(explain.V2response, 4);
});

test('repeats must all be present; agreement is descriptive only', () => {
  const result = run({ drop: ['V2-normal-guess-r2'] });
  assert.equal(result.gates.repeats, false);
  assert.equal(result.frozen, false);
  const pair = result.details.repeats.pairs.find(row => row.base === 'V2-normal-guess');
  assert.equal(pair.present, false);
});

test('cellView accepts a bare failure or a bare verdict record', () => {
  const failing = report.cellView({ failure: { status: 'infra_failure', kind: 'judge_partial_failure' } });
  assert.equal(failing.exists, true);
  assert.equal(failing.complete, false);
  assert.equal(failing.failure.kind, 'judge_partial_failure');
  const verdict = report.cellView({ answers: answers({}), scoring: score() });
  assert.equal(verdict.complete, true);
});

test('render lists gate counts, missing ids, normal citations, repeats, PIDs and caps', () => {
  const result = run({ drop: ['r2/lecture'] });
  const markdown = report.renderFreezeReport(result, { root: 'runs', outDir: 'runs/fixture' });
  assert.match(markdown, /freeze/i);
  assert.match(markdown, /missing/i);
  assert.match(markdown, /r2\/lecture/);
  assert.match(markdown, /V2-normal-explain/);
  assert.match(markdown, /4242/);
  assert.match(markdown, /498/);
  assert.match(markdown, /round2-binary-v3-freeze-gemini-01/);
});
