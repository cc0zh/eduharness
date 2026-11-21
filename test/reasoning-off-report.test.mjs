import assert from 'node:assert/strict';
import { test } from 'node:test';
import { binaryDimensions, binaryQuestions, summarizeBinary } from '../contracts/judge/binary.mjs';
import { s1Plan, s1Targets } from '../src/s1-binary-plan.mjs';
import { adoption, analyzeReasoningOff, renderReasoningOffReport, unchangedQuestions } from '../scripts/reasoning-off-report.mjs';
import * as judgeContrast from '../scripts/reasoning-off-report.mjs';

const cases = ['A2-assigned-multiplier', 'R0-still-learner-origin', 'R1-student-score-cards'];
const questions = Object.keys(binaryQuestions);
const s1Queue = s1Plan.map(row => ({ ...row, id: `${row.repetition}/${row.condition}` }));
const queue = [...s1Queue, ...cases.map(id => ({ id }))];
const metadata = { id: 'fixture', pid: 42, identityId: 'fixture-identity', preregistrationSha256: 'fixture-digest' };

function fixture(mode = 'real') {
  function attempt(id, index, number = 1) {
    return { attempt: number, attemptPath: `${id}/calls/judge-4-1-${number}.json`, callId: `${id}:judge:4:1:${number}`,
      sent: true, phaseMs: { requestSent: 20, firstVisible: 30, firstReasoning: null, lastReasoning: null },
      elapsedMs: 1000 + index * 100, requestLimit: 100, reasoningTokens: 0, reportedOutputTokens: 30,
      usage: { input: 100, cacheRead: 5, output: 30, totalTokens: 135 }, failureKind: null, detail: null };
  }
  const outcomes = queue.map(({ id, condition }, index) => {
    const scores = Object.fromEntries(binaryDimensions.map(key => [key, condition === 'normal' || key !== s1Targets[condition] ? 2 : 0]));
    const answers = Object.fromEntries(questions.map(key => [key, { answer: key === 'M0', evidence: key === 'M0' ? { misconception: 3 } : {} }]));
    return { id, verdict: { answers, scoring: summarizeBinary(scores) }, attempts: [attempt(id, index)] };
  });
  const expected = Object.fromEntries(s1Queue.map(({ condition }) => [condition, Object.fromEntries(questions.map(key => [key,
    condition === 'normal' ? null : key === 'M0' ? true : key === 'V1' ? false : null]))]));
  const history = {
    s1: s1Queue.map(({ id }, index) => ({ id, answers: structuredClone(outcomes[index].verdict.answers), elapsedMs: 10000 + index * 100 })),
    timeouts: cases.slice(0, 3).flatMap((id, index) => [1, 2].map(r => ({ id: `${id}-r${r}`, elapsedMs: 200000 + index * 1000 + r,
      failureKind: index === 1 ? null : 'reasoning_exhausted_empty' }))),
  };
  const limits = { maxAttempts: 30, maxRequestedOutputTokens: 3000 };
  return { mode, queue, outcomes, expected, history, limits, attempt };
}

test('applies the preregistered adoption line only to verified real-mode outcomes', () => {
  assert.deepEqual(adoption, { maxReasoningTokens: 0, minS1Valid: 14, minRatePasses: 3, minTargetPasses: 2, maxTruthErrors: 2 });
  assert.deepEqual(unchangedQuestions, ['M0', 'M1', 'M2', 'M3', 'S0', 'S1', 'S2', 'S3', 'P0', 'P1', 'P2', 'P3', 'R0', 'R1', 'R2']);
  const real = analyzeReasoningOff(fixture());
  assert.equal(real.adopted, true);
  assert.deepEqual(real.gates, { firstAttempts: true, s1Valid: true, ratePasses: true, targetPasses: true, truthErrors: true });
  const offline = analyzeReasoningOff(fixture('offline'));
  assert.equal(offline.adopted, false);
  assert.equal(offline.usage.requests, 0);
  assert.match(renderReasoningOffReport(offline, metadata), /synthetic.*never model evidence/i);
});

test('first visible has a request-relative deadline and retries cannot cure missing, late or contradictory evidence', () => {
  const boundary = fixture();
  boundary.outcomes[0].attempts[0].phaseMs.firstVisible = 180020;
  assert.equal(analyzeReasoningOff(boundary).adopted, true);
  for (const alter of [
    attempt => { attempt.sent = false; },
    attempt => { attempt.phaseMs.firstVisible = null; },
    attempt => { attempt.phaseMs.firstVisible = 180021; },
    attempt => { delete attempt.phaseMs.requestSent; },
    attempt => { delete attempt.reasoningTokens; },
    attempt => { attempt.reasoningTokens = 1; },
    attempt => { attempt.phaseMs.firstReasoning = 21; },
    attempt => { attempt.phaseMs.lastReasoning = 21; },
    attempt => { delete attempt.phaseMs.lastReasoning; },
  ]) {
    const f = fixture();
    const cell = f.outcomes[15];
    alter(cell.attempts[0]);
    cell.attempts.push(f.attempt(cell.id, 15, 2));
    const result = analyzeReasoningOff(f);
    assert.equal(result.gates.firstAttempts, false);
    assert.equal(result.adopted, false);
    assert.equal(result.retries.length, 1);
  }
  const f = fixture();
  f.outcomes[15].attempts = [f.attempt(cases[0], 15, 2)];
  assert.equal(analyzeReasoningOff(f).gates.firstAttempts, false);
});

test('counts final compliant S1 verdicts and separates target hits from rate passes', () => {
  const f = fixture();
  const normal = f.outcomes.find(row => row.id === 'r1/normal');
  normal.attempts[0].failureKind = 'judge_output_contract';
  normal.attempts.push(f.attempt(normal.id, 0, 2));
  const noTeach = f.outcomes.find(row => row.id === 'r1/no_teach');
  const lecture = f.outcomes.find(row => row.id === 'r1/lecture');
  const r1NoTeachScores = { ...noTeach.verdict.scoring.scores, misconception_repair: 'N/A', agency_handoff: 0 };
  noTeach.verdict.scoring = summarizeBinary(r1NoTeachScores);
  lecture.verdict.scoring = summarizeBinary({ ...lecture.verdict.scoring.scores, agency_handoff: 2, verification_or_transfer: 0 });
  const result = analyzeReasoningOff(f);
  assert.equal(result.adopted, true);
  assert.equal(result.s1.ratePasses, 3);
  assert.deepEqual(result.s1.targetHits, { answer_dump: 3, lecture: 2, sycophant_close: 3, no_teach: 2 });
  const missing = f.outcomes.find(row => row.id === 'r1/answer_dump');
  missing.failure = { kind: 'judge_output_contract' };
  delete missing.verdict;
  const partial = analyzeReasoningOff(f);
  assert.equal(partial.gates.firstAttempts, true);
  assert.equal(partial.gates.s1Valid, true);
  assert.equal(partial.gates.ratePasses, false);
  assert.equal(partial.adopted, false);
  delete f.outcomes[5].verdict;
  assert.equal(analyzeReasoningOff(f).gates.s1Valid, false);
});

test('counts definite construction errors and missing bits separately; compares v1 within each repetition', () => {
  const f = fixture();
  f.outcomes[1].verdict.answers.M0.answer = false;
  f.outcomes[2].verdict.answers.V1.answer = true;
  const result = analyzeReasoningOff(f);
  assert.equal(result.adopted, true);
  assert.equal(result.matrix.total.fn, 1);
  assert.equal(result.matrix.total.fp, 1);
  assert.deepEqual(result.gateRates.M0, { notApplicable: 1, applicable: 14, missing: 0 });
  assert.deepEqual(result.v1Agreement.M0, { r1: [4, 5], r2: [5, 5], r3: [5, 5], all: [14, 15] });
  assert.equal(Object.hasOwn(result.v1Agreement, 'V1'), false);
  assert.deepEqual(result.repeatAgreement.questions.M0.all, [4, 5]);
  assert.deepEqual(result.repeatAgreement.dimensions.agency_handoff.all, [5, 5]);
  f.outcomes[3].verdict.answers.V1.answer = true;
  assert.equal(analyzeReasoningOff(f).gates.truthErrors, false);
  f.outcomes.splice(4, 1);
  const partial = analyzeReasoningOff(f);
  assert.equal(partial.matrix.total.missingYes, 1);
  assert.equal(partial.matrix.total.missingNo, 1);
  assert.equal(partial.cells.length, 18);
});

test('reports planned denominators, receipt-linked retries and elapsed comparisons without hiding failures', () => {
  const f = fixture();
  const first = f.outcomes[15].attempts[0];
  Object.assign(first, { failureKind: 'provider_failure', detail: 'local request timeout', usage: null, reportedOutputTokens: null });
  f.outcomes[15].attempts.push(f.attempt(cases[0], 15, 2));
  delete f.history.s1[0].elapsedMs;
  Object.assign(f.history.s1[0], { failureKind: 'provider_failure', detail: 'historical transport failure' });
  f.history.timeouts[0].elapsedMs = null;
  const result = analyzeReasoningOff(f);
  assert.deepEqual(result.elapsed.batch, { planned: 18, sent: 18, measured: 18, timeouts: 1, errors: 0, medianMs: 1850, p90Ms: 2600 });
  assert.equal(result.elapsed.matchedS1.current.measured, 14);
  assert.equal(result.elapsed.matchedS1.historical.planned, 15);
  assert.equal(result.elapsed.timeoutDiagnostics.planned, 6);
  assert.equal(result.elapsed.timeoutDiagnostics.measured, 5);
  assert.equal(result.usage.requests, 19);
  assert.equal(result.usage.requestedOutputTokens, 1900);
  assert.equal(result.usage.missingUsage, 1);
  assert.equal(result.usage.provider.output, 540);
  const report = renderReasoningOffReport(result, metadata);
  assert.match(report, /^# .*no freeze evidence/i);
  assert.match(report, /agreement is not correctness/i);
  assert.match(report, /360 s.*not equivalent/i);
  assert.match(report, /A2-assigned-multiplier\/transcript\.json/);
  assert.match(report, /A2-assigned-multiplier\/calls\/judge-4-1-2\.json/);
  assert.match(report, /A2-assigned-multiplier:judge:4:1:1/);
  assert.match(report, /local request timeout/);
  assert.match(report, /r1\/normal.*historical transport failure.*not matched/);
  assert.match(report, /19\/30/);
  assert.match(report, /1900\/3000/);
  assert.match(report, /misconception=#3/);
  assert.match(report, /steps 2 and 3.*final evaluation identity/i);
  f.outcomes[0].attempts = [];
  assert.match(renderReasoningOffReport(analyzeReasoningOff(f), metadata), /Qwen3 235B Instruct\/Parasail/);
});

test('does not turn normalized zero placeholders into provider-reported usage', () => {
  const f = fixture();
  Object.assign(f.outcomes[0].attempts[0], { reportedOutputTokens: null, usage: { input: 0, cacheRead: 0, output: 0, totalTokens: 0 } });
  Object.assign(f.outcomes[1].attempts[0], { reportedOutputTokens: 25, usage: null });
  const { usage } = analyzeReasoningOff(f);
  assert.equal(usage.missingUsage, 1);
  assert.equal(usage.knownByField.output, 17);
  assert.equal(usage.knownByField.input, 16);
  assert.equal(usage.provider.output, 505);
});

test('judge contrast uses the same a–e thresholds for both routes, with token reports descriptive only', () => {
  const f = fixture();
  delete f.outcomes[0].attempts[0].reasoningTokens;
  f.outcomes[1].attempts[0].reasoningTokens = 23;
  f.outcomes[2].attempts[0].phaseMs.firstVisible = 180020;
  const result = judgeContrast.analyzeJudgeContrast(f);
  assert.equal(result.adopted, true);
  const { firstAttempts: historicFirsts, ...historicGates } = analyzeReasoningOff(f).gates;
  const { firstAttempts, ...gates } = result.gates;
  assert.equal(historicFirsts, false);
  assert.equal(firstAttempts, true);
  assert.deepEqual(gates, historicGates);
  assert.equal(judgeContrast.analyzeJudgeContrast({ ...f, mode: 'offline' }).adopted, false);

  for (const phase of [
    { firstVisible: 180021 }, { firstVisible: null }, { firstReasoning: 21 }, { lastReasoning: 21 }, { lastReasoning: undefined },
  ]) {
    const broken = structuredClone(f.outcomes);
    Object.assign(broken[2].attempts[0].phaseMs, phase);
    assert.equal(judgeContrast.analyzeJudgeContrast({ ...f, outcomes: broken }).gates.firstAttempts, false);
  }
});

test('after resume, a new local attempt 1 cannot replace the original plan-first or disappear from timing', () => {
  const f = fixture();
  const cell = f.outcomes[17];
  const first = cell.attempts[0];
  Object.assign(first, { processIndex: 1, failureKind: 'timeout', elapsedMs: 180000 });
  first.phaseMs.firstVisible = null;
  cell.attempts.push({ ...f.attempt(cell.id, 0), processIndex: 2 });
  const result = judgeContrast.analyzeJudgeContrast(f);
  assert.equal(result.adopted, false);
  assert.equal(result.cells[17].firstAttempt.processIndex, 1);
  assert.equal(result.cells[17].first.passed, false);
  assert.equal(result.retries[0].processIndex, 2);
  assert.deepEqual(result.elapsed.batch, { planned: 18, sent: 18, measured: 18, timeouts: 1, errors: 0, medianMs: 1850, p90Ms: 2600 });

  first.sent = false;
  const blocked = judgeContrast.analyzeJudgeContrast(f);
  assert.equal(blocked.firstAttempts.qualify, 17);
  assert.equal(blocked.elapsed.batch.sent, 17);
});

test('judge contrast renders the auditable evidence and keeps missing outcomes out of agreement', () => {
  const f = fixture();
  const first = f.outcomes[0].attempts[0];
  Object.assign(first, { attemptPath: '_processes/1/r1/normal/calls/judge-4-1-1.json', processIndex: 1, pid: 42,
    reportedProvider: 'Parasail', failureKind: 'judge_partial_failure', detail: 'M2: M0 anchor mismatch', reasoningTokens: null,
    rejectedAnswers: { M2: { answer: true, evidence: { misconception: 9 } } } });
  f.outcomes[0].attempts.push({ ...f.attempt(f.outcomes[0].id, 0), processIndex: 2, pid: 43 });
  f.outcomes[0].verdict.answers.M0.evidence.misconception = 6;
  f.outcomes[0].verdict.answers.V1 = { answer: true, evidence: { prompt: 7 } };
  f.outcomes[1].verdict.answers.M0 = { answer: false, evidence: {} };
  f.outcomes.pop();
  const { limits } = f;
  const budget = { attempts: 20, requestedOutputTokens: 2000, ...limits };
  const metadata = { id: 'contrast', identityId: 'locked-id', preregistrationSha256: 'locked-plan',
    candidate: 'Qwen3 235B Instruct / Parasail', policyVersion: 'fixture-policy', route: { id: 'qwen3-fixture', provider: 'Parasail' },
    verification: { budget } };
  const analysis = judgeContrast.analyzeJudgeContrast({ ...f, limits, budget: { ...budget, attempts: 19, requestedOutputTokens: 1900 } });
  const report = judgeContrast.renderJudgeContrastReport(analysis, metadata);
  assert.equal(report, judgeContrast.renderJudgeContrastReport(analysis, metadata));
  assert.match(report, /①g.*no freeze evidence/);
  assert.match(report, /Do not adopt Qwen3 235B Instruct \/ Parasail/);
  assert.match(report, /r1\/normal.*?_processes\/1\/r1\/normal\/calls\/judge-4-1-1\.json.*?Parasail/);
  assert.match(report, /Rejected raw answers[\s\S]*?M2=Yes misconception=#9/);
  assert.match(report, /r1\/normal.*M0.*misconception=#3.*misconception=#6/);
  assert.match(report, /r1\/answer_dump.*M0.*Yes.*No/);
  assert.match(report, /r1\/normal.*A1=No.*A2=No.*V1=Yes prompt=#7.*V2=No|r1\/normal.*V1=Yes prompt=#7.*V2=No.*A1=No.*A2=No/);
  assert.match(report, /R1-student-score-cards.*unstarted/);
  assert.match(report, /Refusal distribution/);
  assert.match(report, /20\/30/);
  assert.match(report, /2000\/3000/);
  assert.match(report, /directed retest/i);
  assert.doesNotMatch(report, /r1\/normal \| V1 \|/);
});

test('judge contrast leaves an unsettled send unlinked and does not infer provider refusal', () => {
  const f = fixture();
  const cell = f.outcomes.at(-1);
  delete cell.verdict;
  cell.attempts = [{ attempt: 1, sent: true, callId: 'unsettled-send', processIndex: 1, pid: 42, failureKind: 'unsettled' }];
  Object.assign(f.outcomes[0].attempts[0], { finish_reason: 'content_filter', failureKind: 'provider_failure' });
  Object.assign(f.outcomes[1].attempts[0], { failureKind: 'provider_failure' });
  const analysis = judgeContrast.analyzeJudgeContrast(f);
  const report = judgeContrast.renderJudgeContrastReport(analysis, { ...metadata, candidate: 'HY4-capped' });
  assert.equal(analysis.adopted, false);
  assert.equal(analysis.usage.requestedOutputTokens, 1700);
  assert.match(report, /1\/18 real sends lack an observed allowance/);
  assert.match(report, /1\/18 sent plan-firsts lack elapsed time/);
  assert.match(report, /\| explicit provider refusal \/ content filter \| 1 \| 0 \|/);
  assert.match(report, /\| provider_failure \| 1 \| 0 \|/);
  assert.match(report, /\| R1-student-score-cards \| unsettled-send \| yes \|/);
  assert.doesNotMatch(report, /\[unsettled-send\]/);
});
