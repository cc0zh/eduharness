import assert from 'node:assert/strict';
import test from 'node:test';

const report = await import('../scripts/judge-bakeoff-report.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});

const dimensions = ['misconception_repair', 'support_escalation_and_fading', 'agency_handoff',
  'productive_struggle', 'representation_pivot', 'verification_or_transfer'];
const questionIds = {
  misconception_repair: ['M0', 'M1', 'M2', 'M3'],
  support_escalation_and_fading: ['S0', 'S1', 'S2', 'S3'],
  agency_handoff: ['A1', 'A2'],
  productive_struggle: ['P0', 'P1', 'P2', 'P3'],
  representation_pivot: ['R0', 'R1', 'R2'],
  verification_or_transfer: ['V1', 'V2'],
};
const questions = Object.values(questionIds).flat();
const conditions = ['normal', 'answer_dump', 'lecture', 'sycophant_close', 'no_teach'];
const targets = {
  answer_dump: 'productive_struggle',
  lecture: 'agency_handoff',
  sycophant_close: 'verification_or_transfer',
  no_teach: 'misconception_repair',
};
const definite = {
  answer_dump: { S1: false, S2: false, S3: true, P1: true, P2: false, R2: false },
  lecture: { S1: false, S2: false, P2: false, R2: false },
  sycophant_close: { M1: false, M3: false, S1: false, S2: false, S3: false, P2: false, P3: false,
    R0: false, R1: false, R2: false, V1: false, V2: false },
  no_teach: { M1: false, M3: false, S1: false, S2: false, S3: false, P1: false, P2: false, P3: false,
    R0: false, R1: false, R2: false, V1: false, V2: false },
};
const expectations = Object.fromEntries(['normal', ...conditions.slice(1)].map(condition => [condition,
  Object.fromEntries(questions.map(question => [question, definite[condition]?.[question] ?? null]))]));
const plan = [...['r1', 'r2', 'r3'].flatMap(repetition => conditions.map(condition => ({
  id: `${repetition}/${condition}`, repetition, condition, sourceRunId: 'fixture', archive: `fixture/${repetition}/${condition}`,
  transcriptSha256: 'a'.repeat(64),
}))), ...['A2-assigned-multiplier', 'R0-still-learner-origin', 'R1-student-score-cards'].map(id => ({
  id, sourceRunId: 'fixture', archive: `fixture/${id}`, transcriptSha256: 'b'.repeat(64),
}))];
const budgets = { haiku: 1536, gemini: 3072, qwen: 0 };
const elapsed = { haiku: 10_000, gemini: 20_000, qwen: 30_000 };
const providers = { haiku: 'anthropic', gemini: 'google', qwen: 'parasail' };

function answers(condition, flips = {}) {
  const flat = Object.fromEntries(questions.map(question => {
    const answer = Object.hasOwn(flips, question) ? flips[question] : definite[condition]?.[question] ?? false;
    return [question, { answer, evidence: answer ? { opening: 2 } : {} }];
  }));
  return Object.fromEntries(dimensions.map((dimension, index) => [dimension,
    Object.fromEntries(Object.entries(questionIds)[index][1].map(question => [question, flat[question]]))]));
}

function scoringFor(condition, override) {
  const scores = Object.fromEntries(dimensions.map(dimension =>
    [dimension, condition === 'normal' ? 2 : dimension === targets[condition] ? 0 : 1]));
  if (override) Object.assign(scores, override);
  const applicable = dimensions.filter(dimension => scores[dimension] !== 'N/A');
  const points = applicable.reduce((sum, dimension) => sum + scores[dimension], 0);
  return { ruler: 'e1-binary-v3', scores, applicable, points, possible: 2 * applicable.length,
    rate: applicable.length ? points / (2 * applicable.length) : null };
}

function meterFor(key, folder, call, attempt = 1) {
  const elapsedMs = elapsed[key] + call * 10;
  const reasoning = key === 'qwen' ? 0 : key === 'haiku' ? 1_000 : 2_000;
  const callId = `${folder}:judge:4:${call}:${attempt}`;
  return {
    role: 'judge', turn: 4, call, attempt, callId, attemptPath: `${folder}/calls/judge-4-${call}-${attempt}.json`,
    phaseMs: {
      requestSent: 1_000, headersReceived: 1_010, firstByte: 1_020,
      firstReasoning: key === 'qwen' ? null : 1_030, lastReasoning: key === 'qwen' ? null : 1_040,
      firstVisible: 1_050, ended: 1_000 + elapsedMs,
    },
    elapsedMs, timeoutMs: 120_000, reasoningTokens: reasoning, reasoningLimit: budgets[key],
    usage: { input: 1_000, cacheRead: 200, output: 500, totalTokens: 1_700 }, reportedOutputTokens: 500,
    reportedProvider: providers[key], reportedModel: key, retryCount: 0, requestLimit: key === 'haiku' ? 2_048 : key === 'gemini' ? 4_096 : 8_192,
    validationCode: null, normalizations: [], pid: 4_000, processIndex: 1,
  };
}

function makeBatch({ key = 'qwen', mode = 'real', scoreOverride, truthFlips = {}, partial = {}, cross = {},
  unstarted = new Set(), missingUsage = new Set(), late = new Set(), missingReasoning = new Set(), retries = {} } = {}) {
  const selected = new Map();
  const attempts = [];
  for (const row of plan) {
    const folder = row.id;
    const dimensionLimit = partial[folder];
    const conflict = cross[folder];
    const started = !unstarted.has(folder);
    if (started) {
      for (const [index, dimension] of dimensions.entries()) {
        const call = index + 1;
        const failed = dimensionLimit !== undefined && index >= dimensionLimit;
        if (failed) {
          for (let attempt = 1; attempt <= 3; attempt++) {
            const callId = `${folder}:judge:4:${call}:${attempt}`;
            attempts.push({
              folder, callId, processIndex: 1, pid: 4_000, sent: { type: 'request_start' },
              scope: { role: 'judge', turn: 4, call, attempt },
              meter: { ...meterFor(key, folder, call, attempt), failureKind: 'judge_partial_failure', validationCode: 'structure',
                detail: attempt === 3 ? 'third dimension attempt invalid' : 'invalid JSON document' },
              raw: { binding: { dimension }, normalized: [] },
            });
          }
          continue;
        }
        const retried = retries[folder] === call;
        if (retried) {
          const callId = `${folder}:judge:4:${call}:1`;
          attempts.push({ folder, callId, processIndex: 1, pid: 4_000, sent: { type: 'request_start' },
            scope: { role: 'judge', turn: 4, call, attempt: 1 },
            meter: { ...meterFor(key, folder, call, 1), failureKind: 'judge_partial_failure', validationCode: 'structure',
              detail: 'invalid JSON document' },
            raw: { binding: { dimension }, normalized: [] } });
        }
        const meter = meterFor(key, folder, call, retried ? 2 : 1);
        if (missingUsage.has(`${folder}:${index}`)) meter.usage = undefined;
        if (late.has(`${folder}:${index}`)) {
          meter.phaseMs.ended = meter.phaseMs.requestSent + 130_000;
          meter.elapsedMs = 130_000;
        }
        if (missingReasoning.has(`${folder}:${index}`)) meter.reasoningTokens = null;
        attempts.push({ folder, callId: meter.callId, processIndex: 1, pid: 4_000, sent: { type: 'request_start' },
          scope: { role: 'judge', turn: 4, call, attempt: retried ? 2 : 1 }, meter, raw: { binding: { dimension }, normalized: [] } });
      }
    }
    const complete = started && dimensionLimit === undefined && !conflict;
    if (complete) {
      selected.set(folder, { folder, processIndex: 1,
        row: { id: folder, ...(row.repetition && { repetition: row.repetition }), ...(row.condition && { condition: row.condition }),
          scoring: scoringFor(row.condition, scoreOverride?.[folder]) },
        judgement: { verdict: { answers: answers(row.condition, truthFlips[folder]), messageIds: {}, normalized: [],
          scoring: scoringFor(row.condition, scoreOverride?.[folder]) }, binding: { dimensions: Object.fromEntries(dimensions.map((dimension, i) => [dimension, { call: i + 1, processIndex: 1 }])) } } });
    } else if (conflict) {
      selected.set(folder, { folder, processIndex: 1,
        row: { id: folder, ...(row.repetition && { repetition: row.repetition }), ...(row.condition && { condition: row.condition }),
          failure: { status: 'infra_failure', kind: 'judge_partial_failure', detail: 'S3 and P1 disagree across dimension judgements',
            callId: `${folder}:judge:4:6:1`, dimension: 'verification_or_transfer',
            crossDimension: { code: 'S3_P1', dimensions: { support_escalation_and_fading: {}, productive_struggle: {} } } } },
        judgement: undefined });
    }
  }
  const sent = attempts.filter(attempt => attempt.sent);
  return {
    manifest: {
      id: `fixture-${key}`, mode, scenario: 'S1-judge-bakeoff',
      identity: { ruler: 'e1-binary-v3', version: 'evaluation-identity-v5', judgeOutputContract: 'judge-output-v5',
        policy: { version: `policy-${key}`, judge: { timeoutMs: 120_000 } } },
      planned: plan.map(row => ({ ...row })),
      limits: { maxAttempts: 324, maxRequestedOutputTokens: 324 * 8_192 },
      writer: { pid: 4_000 },
    },
    selected, attempts, used: { attempts: attempts.length, requestedOutputTokens: attempts.length * 4_096 },
    processes: [{ processIndex: 1, pid: 4_000, interrupted: false, requestCount: sent.length, exitCode: 1 }],
    latest: { processIndex: 1, interrupted: false, exitCode: 1, acceptance: false }, latestResult: null,
  };
}

function candidate(key) {
  return { key, label: `${key} label`, runId: `run-${key}`, policy: { judge: { reasoningBudget: budgets[key] } }, route: { id: key } };
}

function fixture(options = {}) {
  const keys = options.keys ?? ['haiku', 'gemini', 'qwen'];
  return {
    candidates: keys.map(candidate), dimensions, expectations, targets,
    runs: Object.fromEntries(keys.map(key => [key, { batch: makeBatch({ ...options, key }), verification: {
      runId: `run-${key}`, verified: true, conclusion: 'complete', exitCode: 1, acceptance: false,
      requestCount: makeBatch({ ...options, key }).attempts.filter(attempt => attempt.sent).length,
      processes: [{ processIndex: 1, pid: 4_000, interrupted: false, requestCount: 0 }],
      budget: { maxAttempts: 324, maxRequestedOutputTokens: 2_654_208, attempts: 0, requestedOutputTokens: 0 },
    } }])),
  };
}

test('analysis passes all five gates on complete real batches and computes fixed denominators', () => {
  assert.ok(report, 'the bakeoff report module must exist');
  const result = report.analysis(fixture());
  assert.equal(result.candidates.length, 3);
  for (const row of result.candidates) {
    assert.deepEqual(row.gates, { a: true, b: true, c: true, d: true, e: true });
    assert.equal(row.eligible, true);
    assert.equal(row.counts.complete, 18);
    assert.equal(row.counts.firstComplete, 18);
    assert.equal(row.counts.qualified, 18);
    assert.equal(row.counts.partial, 0);
    assert.equal(row.counts.noResult, 0);
    assert.deepEqual(row.firstCompliance, { passed: 108, planned: 108 });
    assert.deepEqual(row.postRetryCompliance, { passed: 108, planned: 108 });
    assert.deepEqual(row.firstStructural, { passed: 108, planned: 108 });
    assert.equal(row.truth.errors, 0);
    assert.equal(row.timing.measured > 0, true);
  }
  assert.equal(result.candidateAgreement.length, 3);
  assert.deepEqual(result.candidateAgreement[0].total, [342, 342]);
  assert.equal(result.selection.selected, 'haiku');
});

test('selection ranks eligible candidates by truth errors, first compliance, p90, then fixed model order', () => {
  const rows = [
    { key: 'haiku', eligible: true, truth: { errors: 1 }, firstStructural: { passed: 108 }, firstCompliance: { passed: 108 }, timing: { p90Ms: 10 } },
    { key: 'gemini', eligible: true, truth: { errors: 0 }, firstStructural: { passed: 104 }, firstCompliance: { passed: 104 }, timing: { p90Ms: 20 } },
    { key: 'qwen', eligible: true, truth: { errors: 0 }, firstStructural: { passed: 106 }, firstCompliance: { passed: 102 }, timing: { p90Ms: 30 } },
  ];
  assert.equal(report.selection(rows).selected, 'qwen');
  const tie = rows.map(row => ({ ...row, truth: { errors: 0 }, firstStructural: { passed: 108 }, timing: { p90Ms: 10 } }));
  assert.equal(report.selection(tie.reverse()).selected, 'haiku');
  const ineligible = rows.map(row => ({ ...row, eligible: false }));
  assert.equal(report.selection(ineligible).selected, null);
});

test('offline or unverified candidates are never eligible for adoption', () => {
  const offline = report.analysis(fixture({ keys: ['haiku'], mode: 'offline' }));
  assert.equal(offline.candidates[0].eligible, false);
  assert.equal(offline.selection.selected, null);
  const broken = fixture({ keys: ['haiku'] });
  broken.runs.haiku.verification.verified = false;
  const unverified = report.analysis(broken);
  assert.equal(unverified.candidates[0].eligible, false);
  assert.equal(unverified.selection.selected, null);
});

test('partial and cross-dimension cells count settled dimensions and list every missing dimension with reason and callId', () => {
  const partial = { 'r1/normal': 2 };
  const cross = { 'r1/answer_dump': true };
  const flips = { 'r1/normal': { M0: true } };
  const result = report.analysis(fixture({ keys: ['qwen'], partial, cross, truthFlips: flips }));
  const row = result.candidates[0];
  assert.equal(row.counts.complete, 16);
  assert.equal(row.counts.partial, 1);
  assert.equal(row.counts.noResult, 0);
  const normal = row.cells.find(cell => cell.id === 'r1/normal');
  assert.equal(normal.complete, false);
  assert.equal(normal.settledDimensions, 2);
  assert.equal(normal.missing.length, 4);
  assert.ok(normal.missing.every(item => item.reason && item.callId));
  const conflict = row.cells.find(cell => cell.id === 'r1/answer_dump');
  assert.equal(conflict.failure.crossDimension.code, 'S3_P1');
  assert.equal(conflict.complete, false);
  assert.equal(row.crossDimensions, 1);
  assert.equal(row.missingCells.length, 2);
  assert.equal(row.truth.errors, 0, 'incomplete cells must not enter construction truth');
  assert.equal(row.truth.cells, 13);
  assert.equal(row.truth.total.missing, Object.keys(definite.answer_dump).length);
});

test('truth and agreement use only complete cells and keep missing denominators visible', () => {
  const flips = { 'r1/lecture': { P2: true } };
  const result = report.analysis(fixture({ keys: ['qwen'], truthFlips: flips, unstarted: new Set(['r2/normal', 'r3/normal']) }));
  const row = result.candidates[0];
  assert.equal(row.truth.errors, 1);
  assert.equal(row.truth.fp, 1);
  assert.equal(row.gates.e, true);
  assert.equal(row.gates.b, false);
  assert.equal(row.counts.complete, 16);
  assert.equal(row.counts.noResult, 2);
  assert.equal(row.missingCells.length, 2);
  const agreement = row.agreement.questions.M0;
  assert.deepEqual(agreement['r1/r2'], [4, 4]);
  assert.deepEqual(agreement.all, [4, 4]);
  assert.deepEqual(row.agreement.questions.P2['r1/r2'], [3, 4]);
});

test('reasoning compliance applies each candidate cap and the Qwen delta rule', () => {
  assert.match(report.reasoningIssue('haiku', { reasoningTokens: null, phaseMs: { firstReasoning: null, lastReasoning: null } }), /missing/);
  assert.match(report.reasoningIssue('gemini', { reasoningTokens: 4_000, phaseMs: {} }), /3072/);
  assert.equal(report.reasoningIssue('qwen', { reasoningTokens: null, phaseMs: { firstReasoning: null, lastReasoning: null } }), null);
  assert.match(report.reasoningIssue('qwen', { reasoningTokens: 0, phaseMs: { firstReasoning: 2, lastReasoning: 3 } }), /delta/);
  assert.match(report.reasoningIssue('qwen', { reasoningTokens: 7, phaseMs: { firstReasoning: 2, lastReasoning: 3 } }), /7/);
  assert.equal(report.reasoningIssue('haiku', { reasoningTokens: 1_536, phaseMs: {} }), null);
});

test('a settled attempt after 120 seconds or missing reasoning fails gate (a)', () => {
  const late = report.analysis(fixture({ keys: ['haiku'], late: new Set(['r1/normal:0']) }));
  assert.equal(late.candidates[0].gates.a, false);
  assert.equal(late.candidates[0].counts.firstComplete, 17);
  assert.equal(late.candidates[0].counts.qualified, 17);
  assert.deepEqual(late.candidates[0].firstStructural, { passed: 108, planned: 108 });
  assert.equal(late.candidates[0].firstCompliance.passed, 107);
  const missing = report.analysis(fixture({ keys: ['gemini'], missingReasoning: new Set(['r1/normal:0']) }));
  assert.equal(missing.candidates[0].gates.a, false);
  const qwen = report.analysis(fixture({ keys: ['qwen'], missingReasoning: new Set(['r1/normal:0']) }));
  assert.equal(qwen.candidates[0].gates.a, true);
});

test('gate (a) accepts a compliant retry and keeps the first-attempt rate descriptive', () => {
  const result = report.analysis(fixture({ keys: ['qwen'], retries: { 'r1/normal': 1 } }));
  const row = result.candidates[0];
  assert.equal(row.gates.a, true);
  assert.equal(row.counts.qualified, 18);
  assert.equal(row.counts.firstComplete, 17);
  assert.equal(row.firstCompliance.passed, 107);
  assert.equal(row.postRetryCompliance.passed, 108);
});

test('usage counts missing provider reports and PID checks show whether requests can still be running', () => {
  const result = report.analysis(fixture({ keys: ['qwen'], missingUsage: new Set(['r1/normal:0', 'r2/lecture:3']) }));
  const row = result.candidates[0];
  assert.equal(row.usage.missingUsage, 2);
  assert.equal(row.usage.requests > 0, true);
  assert.equal(row.usage.provider.reasoningTokens, 0);
  assert.equal(row.usage.requestedOutputTokens, row.usage.attempts * 4_096);
  const dead = report.checkPids([{ processIndex: 1, pid: 10 }, { processIndex: 2, pid: 11 }], () => false);
  assert.equal(dead.allTerminated, true);
  const live = report.checkPids([{ processIndex: 1, pid: 10 }], () => true);
  assert.equal(live.allTerminated, false);
});

test('timing uses send to stream end and ignores local parsing time', () => {
  const input = fixture({ keys: ['haiku'] });
  for (const attempt of input.runs.haiku.batch.attempts) attempt.meter.elapsedMs += 500;
  const { timing } = report.analysis(input).candidates[0];
  assert.equal(timing.p90Ms, 10_060);
});

test('rendered candidate detail links every started cell and attempt to the verified _processes original', () => {
  const result = report.analysis(fixture({ keys: ['qwen'], partial: { 'r1/normal': 2 } }));
  const markdown = report.renderCandidateReport(result.candidates[0], { root: 'runs', outDir: '.tmp/scratch/judge-bakeoff' });
  assert.match(markdown, /_processes\/1\/r1\/normal\/transcript\.json/);
  assert.match(markdown, /_processes\/1\/r1\/lecture\/judge\.json/);
  assert.match(markdown, /slot=#|No Yes answers/);
  assert.match(markdown, /_processes\/1\/r1\/normal\/calls\/judge-4-1-1\.json/);
  assert.match(markdown, /_processes\/1\/r1\/normal\/calls\/judge-4-3-3\.json/);
  const main = report.renderReport(result, { root: 'runs', outDir: '.tmp/scratch/judge-bakeoff' });
  assert.match(main, /\[detail\]\(qwen-report\.md\)/);
  assert.match(main, /108/);
});
