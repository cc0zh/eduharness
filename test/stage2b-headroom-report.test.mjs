import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { splitDimensions, splitQuestions } from '../contracts/judge/binary-v3.mjs';
import { buildHeadroomReport, renderHeadroomReport } from '../scripts/stage2b-headroom-report.mjs';

const [repair, support, agency, struggle, pivot, verify] = splitDimensions;
const fraction = (flips, pairs = 4) => ({ flips, pairs, rate: pairs ? flips / pairs : null, sufficient: pairs >= 3 });
const history = JSON.stringify({ v3: {
  dimensions: Object.fromEntries(splitDimensions.map(dimension => [dimension, {
    score: fraction([support, pivot].includes(dimension) ? 1 : 0),
    questionBits: fraction([repair, support, pivot].includes(dimension) ? 1 : 0), anyQuestion: fraction(0),
  }])),
  questions: Object.fromEntries(Object.values(splitQuestions).flatMap(Object.keys).map(question => [question, fraction(question === 'M2' ? 1 : 0)])),
} });

function fixture() {
  const result = { id: 'synthetic', mode: 'real', scenario: 'stage2b-headroom', acceptance: false,
    stop: 'synthetic stop', used: { attempts: 13, requestedOutputTokens: 21 }, cells: [] };
  const evidence = new Map();
  function add(taskId, student, repetition, status, score, differingText = false) {
    const folder = `${repetition}/${taskId}/${student}`;
    const attempt = role => ({ role, turn: 4, call: 1, attempt: 1, processIndex: 1, callId: `${folder}:${role}:4:1:1`,
      attemptPath: `${folder}/calls/${role}-4-1-1.json`, failureKind: null });
    const learner = attempt('learner');
    const teacher = attempt('teacher');
    const judgeCall = attempt('judge');
    const cell = { folder, taskId, family: 'fixture', student, repetition, status };
    result.cells.push(cell);
    if (status === 'failed') {
      learner.failureKind = 'output_truncated';
      cell.failure = { kind: 'output_truncated', role: 'learner', turn: 4, call: 1, attempt: 1 };
      evidence.set(folder, { telemetry: [teacher, learner, judgeCall] });
      return;
    }
    if (status !== 'scored') return;
    const transcript = [
      { id: `${folder}/m1`, role: 'learner', turn: 0, text: '合成开头' },
      { id: `${folder}/m2`, role: 'teacher', turn: 1, text: differingText ? '另一句' : '合成回答' },
      { id: `${folder}/m3`, role: 'learner', turn: 1, text: '合成续句' },
    ];
    const answers = Object.fromEntries(Object.values(splitQuestions).flatMap(Object.keys).map(question => [question, { answer: false }]));
    Object.assign(answers, { A1: { answer: true, evidence: { step: 3, choice: null } }, V1: { answer: true, evidence: { prompt: 2 } } });
    const scores = { [repair]: score, [support]: 2, [agency]: 1, [struggle]: 'N/A', [pivot]: 'bad', [verify]: 0 };
    const bindings = Object.fromEntries(splitDimensions.map((dim, idx) => [dim, {
      ...judgeCall, call: idx + 1, callId: `${folder}:judge:4:${idx + 1}:1`, attemptPath: `${folder}/calls/judge-4-${idx + 1}-1.json`,
    }]));
    const judge = { binding: { dimensions: bindings }, verdict: { answers, anchors: { [repair]: { misconception: 1 } },
      scoring: { scores, applicable: Object.keys(scores).filter(dim => Number.isInteger(scores[dim])) } } };
    evidence.set(folder, { transcript, judge, telemetry: [teacher, learner, ...Object.values(bindings)] });
  }
  add('T1', 'default', 'r1', 'scored', 0);
  add('T1', 'default', 'r2', 'scored', 2);
  add('T1', 'stubborn', 'r1', 'scored', 'N/A');
  add('T1', 'stubborn', 'r2', 'scored', 2, true);
  add('T1', 'answer-seeker', 'r1', 'scored', 2);
  add('T1', 'answer-seeker', 'r2', 'failed');
  add('T2', 'default', 'r1', 'paused');
  add('T2', 'default', 'r2', 'not_started');
  return { result, evidence };
}

test('retains observations in an unaccepted run and keeps zero, N/A and missing distinct', () => {
  const { result, evidence } = fixture();
  const report = buildHeadroomReport(result, evidence, history);
  assert.equal(report.acceptance, false);
  assert.deepEqual(report.used, result.used);
  assert.deepEqual(report.summaries.overall[repair], {
    planned: 8, observed: 5, applicable: 4, applicableRate: 0.8, missing: 3,
    counts: { 0: 1, 1: 0, 2: 3, 'N/A': 1 }, mean: 1.5, points: 6, possible: 8, headroom: 2, meanHeadroom: 0.5,
  });
  assert.equal(report.summaries.students.default[repair].planned, 4);
  assert.equal(report.summaries.repetitions.r1[repair].meanHeadroom, 1);
  assert.equal(report.summaries.repetitions.r2[repair].headroom, 0);
  assert.equal(report.summaries.overall[pivot].mean, null);
  assert.equal(report.summaries.overall[pivot].observed, 0);
  assert.equal(report.summaries.overall[struggle].mean, null);
  assert.equal(report.summaries.overall[struggle].applicableRate, 0);
});

test('pairs on task and profile and compares only public role/text for input identity', () => {
  const { result, evidence } = fixture();
  const report = buildHeadroomReport(result, evidence, history);
  assert.deepEqual(report.consistency.overall[repair], {
    planned: 4, observed: 2, oneSided: 1, neither: 1,
    applicability: { matched: 1, pairs: 2, rate: 0.5 }, score: { matched: 0, pairs: 2, rate: 0 },
    bothApplicable: { matched: 0, pairs: 1, rate: 0 }, meanAbsoluteDifference: 2,
  });
  assert.equal(report.consistency.overall[struggle].score.rate, 1);
  assert.equal(report.consistency.overall[struggle].bothApplicable.rate, null);
  assert.equal(report.consistency.students.stubborn[repair].applicability.rate, 0);
  assert.equal(report.pairs[0].sameInput, true);
  assert.equal(report.pairs[1].sameInput, false);
  assert.equal(report.pairs[2].sameInput, null);
  assert.deepEqual(report.pairs[2].oneSided, { r1: [repair, support, agency, struggle, verify], r2: [] });
  assert.deepEqual(report.profileDifferences[repair][0], {
    students: ['default', 'stubborn'], difference: 1, applicable: [2, 1], pairedApplicable: 1,
    meanAbsoluteDifference: 2, withinObservedRepeatDifference: true,
  });
  assert.equal(report.profileDifferences[pivot][0].withinObservedRepeatDifference, null);
});

test('maps citations and judge call IDs, keeps mixed-role failure coordinates and leaves candidate attribution pending', () => {
  const { result, evidence } = fixture();
  const report = buildHeadroomReport(result, evidence, history);
  const first = report.cells[0];
  assert.deepEqual(first.questions.A1, { answer: true, messageIds: { step: `${first.folder}/m3`, choice: null },
    callId: `${first.folder}:judge:4:3:1`, processIndex: 1, attemptPath: `${first.folder}/calls/judge-4-3-1.json` });
  assert.equal(first.questions.M0.messageIds.misconception, `${first.folder}/m1`);
  assert.equal(first.scores[pivot], null);
  assert.equal(report.cells[5].failure.role, 'learner');
  assert.equal(report.cells[5].failedAttempts.length, 1);
  assert.equal(report.cells[5].failedAttempts[0].callId, `${report.cells[5].folder}:learner:4:1:1`);
  assert.equal(report.cells[5].failedAttempts[0].failureKind, 'output_truncated');
  assert.equal(report.history[repair].questions.M2.flips, 1);
  assert.equal(report.history[support].score.rate, 0.25);
  const md = renderHeadroomReport(report);
  assert.match(md, /A1.*跟算/);
  assert.match(md, /V1.*事后话术/);
  assert.match(md, /r1\/T1\/default\/m3/);
  assert.match(md, /r2\/T1\/answer-seeker:learner:4:1:1/);
  assert.match(md, /差异可能含裁判噪声/);
  assert.match(md, /题位翻转.*分档未动/);
  assert.match(md, /只报告可见差异，不声称区分画像/);
  assert.match(md, /候选依据待人工回读/);
  assert.doesNotMatch(md + JSON.stringify(report), /合成开头|合成回答|合成续句/);
});

test('rejects a scored cell with an empty transcript or an out-of-range evidence reference', () => {
  const { result, evidence } = fixture();
  const row = evidence.get(result.cells[0].folder);
  row.judge.verdict.answers.A1.evidence.step = 4;
  assert.throws(() => buildHeadroomReport(result, evidence, history), /A1.step/);
  row.transcript = [];
  assert.throws(() => buildHeadroomReport(result, evidence, history), /transcript/);
  row.transcript = [{ id: 'm1', role: 'learner', turn: 0, text: '  ' }];
  assert.throws(() => buildHeadroomReport(result, evidence, history), /transcript/);
});

test('rejects malformed, truncated, empty and trailing-text historical JSON', () => {
  const { result, evidence } = fixture();
  for (const input of ['garbage', history.slice(0, -1), '', `${history}\nextra`]) {
    assert.throws(() => buildHeadroomReport(result, evidence, input), SyntaxError);
  }
  assert.throws(() => buildHeadroomReport(result, evidence, '{}'), /invalid stage 1 flip rate/);
});

test('CLI rejects an unverified run before reading scored artifacts or historical JSON', () => {
  const result = spawnSync(process.execPath, ['scripts/stage2b-headroom-report.mjs', 'synthetic-missing-report-run',
    '.tmp/scratch/stage2b-headroom/unused-report-fixture', 'do-not-read-missing-history.json'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verified real/);
  assert.doesNotMatch(result.stderr, /ENOENT/);
});
