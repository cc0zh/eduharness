import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { requireThat } from '../contracts/core/schema.mjs';
import { constructExpectations } from '../src/s1-binary-plan.mjs';

export const candidateOrder = Object.freeze(['haiku', 'gemini', 'qwen']);
const isSha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const proxyCohorts = Object.freeze({ haiku: 'proxy', gemini: 'proxy', qwen: 'original' });
export const reasoningCaps = Object.freeze({ haiku: 1_536, gemini: 3_072, qwen: 0 });
export const adoption = Object.freeze({
  firstCells: 18,
  firstAttempts: 108,
  deadlineMs: 120_000,
  minS1Valid: 14,
  minRatePasses: 3,
  minTargetPasses: 2,
  maxTruthErrors: 2,
});
export const timingDefinition = 'Median and nearest-rank p90 use send-to-end times of successful single-dimension attempts, including compliant retries. Missing timings are counted separately.';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const counter = () => ({ tp: 0, fn: 0, fp: 0, tn: 0, missing: 0 });
const validScore = value => Number.isInteger(value) && value >= 0 && value <= 2 || value === 'N/A';

export function reasoningIssue(key, meter) {
  const cap = reasoningCaps[key];
  if (cap === undefined) return `unknown candidate ${key}`;
  const phase = meter?.phaseMs ?? {};
  const tokens = meter?.reasoningTokens;
  if (key === 'qwen') {
    if (finite(tokens) && tokens > 0) return `reasoning tokens ${tokens} > ${cap}`;
    if (!(phase.firstReasoning === null && phase.lastReasoning === null)) {
      return tokens === 0
        ? 'reasoning delta contradicts zero reported reasoning tokens'
        : 'reasoning delta observation is missing';
    }
    if (tokens === null || tokens === undefined || tokens === 0) return null;
  }
  if (!finite(tokens)) return `${key} reasoning tokens missing`;
  if (tokens > cap) return `${key} reasoning tokens ${tokens} > ${cap}`;
  if (tokens < 0) return `${key} reasoning tokens ${tokens} < 0`;
  return null;
}

function attemptSucceeded(attempt) {
  const meter = attempt?.meter;
  return Boolean(meter && meter.role === 'judge' && !meter.failureKind && !meter.validationCode);
}

function duration(meter) {
  const phase = meter?.phaseMs;
  return finite(phase?.ended) && finite(phase.requestSent) && phase.ended >= phase.requestSent ? phase.ended - phase.requestSent : null;
}

function attemptDimension(attempt, dimensions) {
  const explicit = attempt?.raw?.binding?.dimension ?? attempt?.meter?.dimension ?? attempt?.raw?.dimension;
  if (typeof explicit === 'string' && dimensions.includes(explicit)) return explicit;
  return dimensions[(attempt?.scope?.call ?? 1) - 1];
}

function settledAttemptIssue(key, attempt, deadlineMs) {
  if (!attempt) return 'no settled attempt';
  if (!attempt.sent) return 'attempt not sent';
  const meter = attempt.meter;
  if (!meter) return 'attempt unsettled';
  if (meter.failureKind) return [meter.failureKind, meter.detail].filter(Boolean).join(': ');
  if (meter.validationCode) return `validation ${meter.validationCode}`;
  const phase = meter.phaseMs;
  if (!finite(phase?.requestSent)) return 'send time unobserved';
  if (!finite(phase.firstVisible)) return 'first visible body unobserved';
  if (!finite(phase.ended)) return 'request end unobserved';
  if (phase.firstVisible < phase.requestSent) return 'first visible precedes send';
  if (phase.ended < phase.firstVisible) return 'request end precedes visible body';
  if (phase.ended - phase.requestSent > deadlineMs) return `ended after ${deadlineMs} ms from send`;
  const reasoning = reasoningIssue(key, meter);
  if (reasoning) return reasoning;
  return attemptSucceeded(attempt) ? null : 'no successful dimension verdict';
}

function firstAttemptIssue(key, attempt, deadlineMs) {
  const issue = settledAttemptIssue(key, attempt, deadlineMs);
  return ['no settled attempt', 'attempt not sent'].includes(issue) ? 'first attempt not sent' : issue;
}

function firstAttemptStructuralIssue(attempt) {
  if (!attempt || !attempt.sent) return 'first attempt not sent';
  const meter = attempt.meter;
  if (!meter) return 'first attempt unsettled';
  if (meter.failureKind) return [meter.failureKind, meter.detail].filter(Boolean).join(': ');
  if (meter.validationCode) return `validation ${meter.validationCode}`;
  return attemptSucceeded(attempt) ? null : 'no successful dimension verdict';
}

function compareRates(normal, variant) {
  if (!normal?.possible || !variant?.possible || !finite(normal.points) || !finite(variant.points)) return 'inconclusive';
  const delta = normal.points * variant.possible - variant.points * normal.possible;
  return delta > 0 ? 'lower' : delta < 0 ? 'higher' : 'tie';
}

function scoreOf(cell, dimension) {
  const score = cell?.scoring?.scores?.[dimension];
  return validScore(score) ? score : null;
}

function questionKeys(expectations) {
  const rows = Object.values(expectations ?? {});
  return [...new Set(rows.flatMap(row => Object.keys(row ?? {})))];
}

function answerAt(answers, question) {
  if (!answers) return undefined;
  if (answers[question] && typeof answers[question].answer === 'boolean') return answers[question];
  const dimension = dimensionOfQuestion(question);
  return answers[dimension]?.[question];
}

function compactAttempt(attempt) {
  const meter = attempt.meter;
  return {
    folder: attempt.folder, callId: attempt.callId, processIndex: attempt.processIndex, pid: attempt.pid,
    sent: Boolean(attempt.sent), scope: attempt.scope,
    ...(meter && { meter: {
      attemptPath: meter.attemptPath, callId: meter.callId, role: meter.role, turn: meter.turn, call: meter.call,
      attempt: meter.attempt, elapsedMs: meter.elapsedMs, timeoutMs: meter.timeoutMs, phaseMs: meter.phaseMs,
      reasoningTokens: meter.reasoningTokens, usage: meter.usage, reportedOutputTokens: meter.reportedOutputTokens,
      reportedProvider: meter.reportedProvider, reportedModel: meter.reportedModel, requestLimit: meter.requestLimit,
      retryCount: meter.retryCount, failureKind: meter.failureKind, detail: meter.detail,
      retryFeedback: meter.retryFeedback, validationCode: meter.validationCode, normalizations: meter.normalizations,
    } }),
    ...(attempt.raw && { raw: { binding: attempt.raw.binding, normalized: attempt.raw.normalized } }),
  };
}

function repeatAgreement(cells, questions) {
  const lookup = new Map(cells.filter(cell => cell.repetition && cell.condition).map(cell => [`${cell.repetition}/${cell.condition}`, cell]));
  const repetitions = ['r1', 'r2', 'r3'];
  const pairs = [...repetitions.flatMap((a, i) => repetitions.slice(i + 1).map(b => [a, b])), repetitions];
  return Object.fromEntries(questions.map(question => [question, Object.fromEntries(pairs.map(reps => {
    const values = Object.keys(Object.fromEntries(cells.filter(cell => cell.condition).map(cell => [cell.condition, cell])))
      .map(condition => reps.map(repetition => answerAt(lookup.get(`${repetition}/${condition}`)?.answers, question)?.answer))
      .filter(row => row.every(value => typeof value === 'boolean'));
    return [reps.length === 3 ? 'all' : reps.join('/'),
      [values.filter(row => row.every(value => value === row[0])).length, values.length]];
  }))]));
}

function usageSummary(key, attempts, batch) {
  const sent = attempts.filter(attempt => attempt.sent);
  const known = sent.map(attempt => {
    const meter = attempt.meter ?? {};
    const usage = meter.usage;
    const observed = usage && (finite(meter.reportedOutputTokens) && meter.reportedOutputTokens > 0
      || Object.values(usage).some(value => finite(value) && value > 0));
    return { meter, usage: observed ? usage : null };
  });
  const provider = {};
  const knownByField = {};
  for (const field of ['input', 'cacheRead', 'output', 'totalTokens', 'reasoningTokens']) {
    const values = known.map(row => field === 'output' ? row.meter.reportedOutputTokens
      : field === 'reasoningTokens' ? row.meter.reasoningTokens : row.usage?.[field]).filter(finite);
    provider[field] = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    knownByField[field] = values.length;
  }
  const cap = reasoningCaps[key];
  return {
    attempts: batch?.used?.attempts ?? attempts.length,
    requests: sent.length,
    retries: sent.filter(attempt => (attempt.meter?.retryCount ?? 0) > 0 || (attempt.scope?.attempt ?? 1) > 1).length,
    requestedOutputTokens: batch?.used?.requestedOutputTokens ?? sent.reduce((sum, attempt) => sum + (attempt.meter?.requestLimit ?? 0), 0),
    limits: batch?.manifest?.limits ?? {},
    provider,
    knownByField,
    missingUsage: known.filter(row => row.usage === null).length,
    missingReasoning: sent.filter(attempt => !finite(attempt.meter?.reasoningTokens)).length,
    reasoningBudget: cap,
    reasoningOverBudget: sent.filter(attempt => finite(attempt.meter?.reasoningTokens) && attempt.meter.reasoningTokens > cap)
      .map(attempt => ({ callId: attempt.callId, processIndex: attempt.processIndex, reasoningTokens: attempt.meter.reasoningTokens, cap })),
  };
}

function cellAnalysis(key, row, selected, attempts, dimensions, deadlineMs) {
  const folder = row.id;
  const cellAttempts = attempts.filter(attempt => attempt.folder === folder);
  const record = selected.get(folder);
  const failure = record?.row?.failure ?? null;
  const scoring = record?.row?.scoring ?? null;
  const groups = dimensions.map((dimension, index) => {
    const list = cellAttempts.filter(attempt => attempt.scope?.call === index + 1);
    const success = list.find(attempt => attemptSucceeded(attempt)) ?? null;
    const qualifyingIssue = success ? settledAttemptIssue(key, success, deadlineMs) : 'no successful dimension verdict';
    return { dimension, call: index + 1, attempts: list, success: Boolean(success), attempt: success,
      qualifyingIssue, qualified: Boolean(success) && qualifyingIssue === null };
  });
  const settledDimensions = groups.filter(group => group.success).length;
  const qualifiedDimensions = groups.filter(group => group.qualified).length;
  const complete = Boolean(record && !failure && scoring && dimensions.every(dimension => validScore(scoring.scores?.[dimension])));
  const first = groups.map(group => {
    const attempt = group.attempts.find(candidate => candidate.scope?.attempt === 1) ?? null;
    return { dimension: group.dimension, call: group.call, attempt,
      structuralIssue: firstAttemptStructuralIssue(attempt), issue: firstAttemptIssue(key, attempt, deadlineMs) };
  });
  const missing = groups.filter(group => !group.success).map(group => {
    const last = group.attempts.at(-1);
    const meter = last?.meter;
    return {
      dimension: group.dimension,
      reason: meter?.failureKind ?? (last ? 'unsettled' : 'not started'),
      callId: meter?.callId ?? last?.callId ?? null,
      detail: meter?.detail ?? null,
      validationCode: meter?.validationCode ?? null,
    };
  });
  const successful = groups.flatMap(group => group.attempts.filter(attempt => attemptSucceeded(attempt)));
  const processIndex = record?.processIndex ?? cellAttempts.find(attempt => attempt.processIndex)?.processIndex ?? null;
  return {
    id: folder,
    repetition: row.repetition ?? null,
    condition: row.condition ?? null,
    complete,
    partial: settledDimensions > 0 && settledDimensions < dimensions.length && !complete,
    noResult: settledDimensions === 0 && !complete,
    conflict: Boolean(failure?.crossDimension),
    settledDimensions,
    qualifiedDimensions,
    qualified: complete && groups.every(group => group.qualified),
    plannedDimensions: dimensions.length,
    scoring,
    answers: record?.judgement?.verdict?.answers ?? null,
    messageIds: record?.judgement?.verdict?.messageIds ?? null,
    anchors: record?.judgement?.verdict?.anchors ?? null,
    anchorMessageIds: record?.judgement?.verdict?.anchorMessageIds ?? null,
    failure,
    processIndex,
    first: first.map(item => ({ ...item, attempt: item.attempt && compactAttempt(item.attempt) })),
    firstPassed: first.filter(item => item.issue === null).length,
    firstStructuralPassed: first.filter(item => item.structuralIssue === null).length,
    firstCompliant: complete && first.every(item => item.issue === null),
    missing,
    attempts: cellAttempts.map(compactAttempt),
    normalizations: {
      raw: successful.reduce((sum, attempt) => sum + (attempt.raw?.normalized?.length ?? 0), 0),
      meter: successful.reduce((sum, attempt) => sum + (attempt.meter?.normalizations?.length ?? 0), 0),
    },
  };
}

function truthSummary(cells, expectations, questions) {
  const matrix = Object.fromEntries(questions.map(question => [question, counter()]));
  const missing = [];
  let truthCells = 0;
  for (const cell of cells) {
    if (!cell.condition || !expectations?.[cell.condition]) continue;
    if (cell.complete) truthCells++;
    for (const question of questions) {
      const expected = expectations[cell.condition][question];
      if (typeof expected !== 'boolean') continue;
      const observed = cell.complete ? answerAt(cell.answers, question)?.answer : undefined;
      if (typeof observed !== 'boolean') {
        matrix[question].missing++;
        missing.push({ cell: cell.id, question, expected,
          reason: cell.missing.find(item => item.dimension === dimensionOfQuestion(question))
            ?.reason ?? cell.failure?.kind ?? 'no complete ruling' });
      } else if (expected) matrix[question][observed ? 'tp' : 'fn']++;
      else matrix[question][observed ? 'fp' : 'tn']++;
    }
  }
  const total = counter();
  for (const row of Object.values(matrix)) for (const field of Object.keys(total)) total[field] += row[field];
  return { cells: truthCells, matrix, total, fp: total.fp, fn: total.fn, errors: total.fp + total.fn, missing };
}

function dimensionOfQuestion(question) {
  const prefix = question[0];
  return { M: 'misconception_repair', S: 'support_escalation_and_fading', A: 'agency_handoff',
    P: 'productive_struggle', R: 'representation_pivot', V: 'verification_or_transfer' }[prefix];
}

function pairedSummary(cells, targets) {
  const lookup = new Map(cells.filter(cell => cell.repetition && cell.condition).map(cell => [`${cell.repetition}/${cell.condition}`, cell]));
  const targetHits = Object.fromEntries(Object.keys(targets).map(condition => [condition, 0]));
  let ratePasses = 0;
  const paired = ['r1', 'r2', 'r3'].map(repetition => {
    const normal = lookup.get(`${repetition}/normal`);
    const pairs = Object.entries(targets).map(([condition, dimension]) => {
      const variant = lookup.get(`${repetition}/${condition}`);
      const totalDirection = compareRates(normal?.scoring, variant?.scoring);
      const normalScore = scoreOf(normal, dimension);
      const variantScore = scoreOf(variant, dimension);
      const targetDelta = Number.isInteger(normalScore) && Number.isInteger(variantScore) ? normalScore - variantScore : null;
      const targetStatus = targetDelta === null ? 'inconclusive' : targetDelta > 0 ? 'lower' : targetDelta < 0 ? 'higher' : 'tie';
      if (targetStatus === 'lower') targetHits[condition]++;
      return { condition, dimension, totalDirection, normalScore, variantScore, targetStatus };
    });
    if (pairs.every(pair => pair.totalDirection === 'lower')) ratePasses++;
    return { repetition, pairs };
  });
  return { paired, targetHits, ratePasses };
}

function candidateSummary(candidate, dimensions, expectations, targets, run, gate, order) {
  const base = { key: candidate.key, label: candidate.label ?? candidate.key, runId: candidate.runId,
    route: candidate.route ?? null, policy: candidate.policy ?? null, available: false, verified: false, mode: null,
    gates: { a: false, b: false, c: false, d: false, e: false }, eligible: false,
    counts: { planned: gate.firstCells, complete: 0, firstComplete: 0, qualified: 0, partial: 0, conflict: 0, noResult: 0, s1Planned: 15, s1Complete: 0 },
    firstCompliance: { passed: 0, planned: gate.firstAttempts },
    firstStructural: { passed: 0, planned: gate.firstAttempts },
    qualifiedCompliance: { passed: 0, planned: gate.firstAttempts },
    postRetryCompliance: { passed: 0, planned: gate.firstAttempts }, maxTruthErrors: gate.maxTruthErrors, crossDimensions: 0,
    normalizations: { raw: 0, meter: 0, total: 0 },
    truth: { cells: 0, matrix: {}, total: counter(), errors: 0, missing: [] },
    rates: { paired: [], targetHits: Object.fromEntries(Object.keys(targets).map(key => [key, 0])), ratePasses: 0 },
    timing: { measured: 0, medianMs: null, p90Ms: null, definition: timingDefinition },
    usage: { attempts: 0, requests: 0, retries: 0, requestedOutputTokens: 0, limits: {}, provider: {}, knownByField: {},
      missingUsage: 0, missingReasoning: 0, reasoningBudget: reasoningCaps[candidate.key], reasoningOverBudget: [] },
    pids: [], cells: [], missingCells: [], agreement: { questions: {} },
    checks: { requestCount: null, observedRequests: 0, requestCountMatches: false, exitCode: null, acceptance: null } };
  if (!run?.batch) return { ...base, error: run?.error ?? 'run unavailable' };
  const { batch, verification } = run;
  const manifest = batch.manifest;
  const attempts = batch.attempts ?? [];
  const cells = manifest.planned.map(row => cellAnalysis(candidate.key, row, batch.selected, attempts, dimensions, gate.deadlineMs));
  const complete = cells.filter(cell => cell.complete);
  const s1 = cells.filter(cell => cell.repetition && cell.condition);
  const s1Complete = s1.filter(cell => cell.complete).length;
  const questions = questionKeys(expectations);
  const truth = truthSummary(cells, expectations, questions);
  const rates = pairedSummary(cells, targets);
  const firstCompliance = cells.reduce((sum, cell) => sum + cell.firstPassed, 0);
  const firstStructural = cells.reduce((sum, cell) => sum + cell.firstStructuralPassed, 0);
  const firstComplete = cells.filter(cell => cell.complete && cell.firstCompliant).length;
  const qualifiedComplete = cells.filter(cell => cell.qualified).length;
  const qualifiedCompliance = cells.reduce((sum, cell) => sum + cell.qualifiedDimensions, 0);
  const gateA = manifest.planned.length === gate.firstCells && cells.length === gate.firstCells
    && cells.every(cell => cell.qualified);
  const gateB = s1Complete >= gate.minS1Valid;
  const gateC = rates.ratePasses >= gate.minRatePasses;
  const gateD = Object.values(rates.targetHits).every(hit => hit >= gate.minTargetPasses);
  const gateE = truth.errors <= gate.maxTruthErrors;
  const allGates = { a: gateA, b: gateB, c: gateC, d: gateD, e: gateE };
  const measured = attempts.filter(attempt => attempt.sent && attemptSucceeded(attempt)).map(attempt => duration(attempt.meter))
    .filter(finite).sort((a, b) => a - b);
  const timing = {
    measured: measured.length,
    sent: attempts.filter(attempt => attempt.sent).length,
    failed: attempts.filter(attempt => attempt.sent && attempt.meter?.failureKind).length,
    missingElapsed: attempts.filter(attempt => attempt.sent && duration(attempt.meter) === null).length,
    medianMs: measured.length ? (measured[Math.floor((measured.length - 1) / 2)] + measured[Math.floor(measured.length / 2)]) / 2 : null,
    p90Ms: measured.length ? measured[Math.ceil(0.9 * measured.length) - 1] : null,
    definition: timingDefinition,
  };
  const usage = usageSummary(candidate.key, attempts, batch);
  const normalizations = cells.reduce((sum, cell) => ({
    raw: sum.raw + cell.normalizations.raw,
    meter: sum.meter + cell.normalizations.meter,
    total: sum.total + Math.max(cell.normalizations.raw, cell.normalizations.meter),
  }), { raw: 0, meter: 0, total: 0 });
  const pids = (batch.processes ?? []).map(process => ({ processIndex: process.processIndex, pid: process.pid,
    interrupted: process.interrupted, requestCount: process.requestCount, exitCode: process.exitCode }));
  const verified = verification?.verified === true;
  return {
    ...base, available: true, verified, mode: manifest.mode,
    identity: manifest.identity, checks: {
      requestCount: verification?.requestCount ?? null,
      observedRequests: usage.requests,
      requestCountMatches: verification?.requestCount === usage.requests,
      exitCode: verification?.exitCode ?? null,
      acceptance: verification?.acceptance ?? null,
    },
    gates: allGates,
    maxTruthErrors: gate.maxTruthErrors,
    eligible: manifest.mode === 'real' && verified && Object.values(allGates).every(Boolean),
    counts: {
      planned: cells.length,
      complete: complete.length,
      firstComplete,
      qualified: qualifiedComplete,
      partial: cells.filter(cell => cell.partial).length,
      conflict: cells.filter(cell => cell.conflict).length,
      noResult: cells.filter(cell => cell.noResult).length,
      s1Planned: s1.length,
      s1Complete,
    },
    firstCompliance: { passed: firstCompliance, planned: gate.firstAttempts },
    firstStructural: { passed: firstStructural, planned: gate.firstAttempts },
    qualifiedCompliance: { passed: qualifiedCompliance, planned: gate.firstAttempts },
    postRetryCompliance: { passed: cells.reduce((sum, cell) => sum + cell.settledDimensions, 0), planned: gate.firstAttempts },
    crossDimensions: cells.filter(cell => cell.conflict).length,
    normalizations,
    truth,
    notApplicableGates: Object.fromEntries(['M0', 'S0', 'P0', 'R0'].map(question => {
      const expected = s1.filter(cell => expectations?.[cell.condition]?.[question] === false);
      return [question, { planned: expected.length, correct: expected.filter(cell => cell.complete && answerAt(cell.answers, question)?.answer === false).length,
        missing: expected.filter(cell => !cell.complete).length }];
    })),
    rates,
    timing,
    usage,
    pids,
    pidCheck: null,
    cells,
    missingCells: cells.filter(cell => !cell.complete).map(cell => ({ id: cell.id, settledDimensions: cell.settledDimensions,
      missing: cell.missing, failure: cell.failure })),
    agreement: { questions: repeatAgreement(cells, questions) },
    order: order.indexOf(candidate.key),
  };
}

export function selection(candidates, order = candidateOrder) {
  const eligible = candidates.filter(candidate => candidate.eligible);
  const ranking = [...eligible].sort((a, b) =>
    (a.truth?.errors ?? Number.MAX_SAFE_INTEGER) - (b.truth?.errors ?? Number.MAX_SAFE_INTEGER)
    || (b.firstStructural?.passed ?? -1) - (a.firstStructural?.passed ?? -1)
    || (a.timing?.p90Ms ?? Number.MAX_SAFE_INTEGER) - (b.timing?.p90Ms ?? Number.MAX_SAFE_INTEGER)
    || order.indexOf(a.key) - order.indexOf(b.key));
  return {
    selected: ranking[0]?.key ?? null,
    ranking: ranking.map(candidate => candidate.key),
    eligible: eligible.map(candidate => candidate.key),
    rule: 'All five gates must pass on a verified real run. Rank by fewest false positives plus false negatives, then highest structural first-attempt count out of 108, then lowest send-to-end p90 of successful single-dimension attempts, then Haiku, Gemini, Qwen.',
  };
}

export function proxyProvenance({ entries, proxyAddendumSha256, originalRegistrationSha256, plannedCount = 18 } = {}) {
  requireThat(isSha256(proxyAddendumSha256), 'proxy addendum sha256 must be a 64-character hex digest');
  requireThat(isSha256(originalRegistrationSha256), 'original registration sha256 must be a 64-character hex digest');
  requireThat(Array.isArray(entries) && entries.length === 3, 'proxy cohort needs exactly three runs');
  const byKey = Object.fromEntries(entries.map(entry => [entry?.key, entry]));
  requireThat(candidateOrder.every(key => byKey[key]), 'proxy cohort is missing a candidate run');
  const planned = byKey[candidateOrder[0]].batch?.manifest?.planned;
  requireThat(Array.isArray(planned) && planned.length === plannedCount,
    `proxy cohort manifest.planned must have exactly ${plannedCount} slots`);
  const expectations = byKey[candidateOrder[0]].expectations;
  const candidates = {};
  for (const key of candidateOrder) {
    const { batch, verification } = byKey[key];
    const mode = batch?.manifest?.mode;
    requireThat(mode === 'real', `${key} cohort run must be a real run`);
    requireThat(verification?.verified === true, `${key} cohort run must be verified`);
    requireThat(same(batch.manifest.planned, planned), `${key} manifest.planned differs within the cohort`);
    requireThat(same(byKey[key].expectations, expectations), `${key} expectation table differs within the cohort`);
    const identity = batch.manifest.identity ?? {};
    const digest = identity.preregistrationSha256;
    const transport = identity.judgeTransport;
    const parent = identity.parentRegistrationSha256;
    if (key === 'qwen') {
      requireThat(digest === originalRegistrationSha256, 'qwen must carry the original registration digest');
      requireThat(transport === undefined, 'qwen must not carry judgeTransport');
      requireThat(parent === undefined, 'qwen must not carry parentRegistrationSha256');
    } else {
      requireThat(digest === proxyAddendumSha256, `${key} must carry the proxy addendum registration digest`);
      requireThat(transport?.proxied === true && typeof transport.proxySource === 'string' && transport.proxySource.length > 0,
        `${key} must carry a proxied judgeTransport with a proxySource env name`);
      requireThat(parent === originalRegistrationSha256, `${key} must name the original registration as parent`);
    }
    candidates[key] = {
      cohort: proxyCohorts[key], runId: batch.manifest.id, mode,
      preregistrationSha256: digest,
      parentRegistrationSha256: parent ?? null,
      judgeTransport: transport
        ? { proxied: transport.proxied === true, proxySource: transport.proxySource }
        : null,
    };
  }
  return {
    cohort: 'proxy-vs-original',
    proxyAddendumSha256, originalRegistrationSha256, plannedCount,
    candidates,
    historicalOriginals: 'not measured in this proxy cohort',
  };
}

function historicalComparison(qwen, historical) {
  if (!historical?.batch || historical.verification?.verified !== true) return { available: false, error: historical?.error ?? 'verified historical run unavailable' };
  const oldSelected = historical.batch.selected;
  const old = historical.batch.manifest.planned.map(row => {
    const record = oldSelected.get(row.id);
    const scoring = record?.row?.scoring;
    const complete = Boolean(record && !record.row.failure && scoring && Object.values(scoring.scores ?? {}).every(validScore));
    return { id: row.id, complete, scoring, answers: record?.judgement?.verdict?.answers ?? null };
  });
  const oldMap = new Map(old.map(row => [row.id, row]));
  const splitMap = new Map(qwen.cells.map(cell => [cell.id, cell]));
  const matched = qwen.cells.filter(cell => cell.complete && oldMap.get(cell.id)?.complete).map(cell => {
    const historicalScores = oldMap.get(cell.id).scoring.scores;
    const splitScores = cell.scoring.scores;
    const same = [...new Set([...Object.keys(splitScores), ...Object.keys(historicalScores)])]
      .filter(dimension => splitScores[dimension] === historicalScores[dimension]).length;
    return { id: cell.id, splitScores, historicalScores, same };
  });
  const splitCompleteIds = new Set(qwen.cells.filter(cell => cell.complete).map(cell => cell.id));
  const historicalCompleteIds = new Set(old.filter(row => row.complete).map(row => row.id));
  const questionAgreement = Object.fromEntries(Object.keys(qwen.agreement.questions).map(question => {
    const values = matched.map(row => {
      const splitCell = splitMap.get(row.id);
      const historicalCell = oldMap.get(row.id);
      return [answerAt(splitCell?.answers, question)?.answer, answerAt(historicalCell?.answers, question)?.answer];
    }).filter(pair => pair.every(value => typeof value === 'boolean'));
    return [question, [values.filter(pair => pair[0] === pair[1]).length, values.length]];
  }));
  return {
    available: true,
    runId: historical.batch.manifest.id,
    planned: qwen.cells.length || historical.batch.manifest.planned.length,
    historicalPlanned: historical.batch.manifest.planned.length,
    splitComplete: splitCompleteIds.size,
    historicalComplete: historicalCompleteIds.size,
    matched: matched.length,
    rows: matched,
    splitOnly: [...splitCompleteIds].filter(id => !historicalCompleteIds.has(id)),
    historicalOnly: [...historicalCompleteIds].filter(id => !splitCompleteIds.has(id)),
    dimensionAgreement: Object.fromEntries([...new Set(matched.flatMap(row => Object.keys(row.splitScores)))]
      .map(dimension => [dimension, {
        same: matched.filter(row => row.splitScores[dimension] === row.historicalScores[dimension]).length,
        total: matched.length,
      }])),
    questionAgreement,
    caveat: 'Historical ①g used one whole-pack v2 request per cell with a 180 s timeout. The split run uses six dimension requests per cell with a 120 s timeout, different retry and stop rules, and a v3 output schema. Matched cells show a descriptive difference, not an isolated effect of splitting.',
  };
}

function candidatePairAgreement(summaries, questions) {
  const pairs = [];
  for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) {
    const left = summaries[i], right = summaries[j];
    const rightCells = new Map(right.cells.filter(cell => cell.complete && cell.answers).map(cell => [cell.id, cell]));
    const matched = left.cells.filter(cell => cell.complete && cell.answers && rightCells.has(cell.id));
    const perQuestion = Object.fromEntries(questions.map(question => {
      const values = matched.map(cell => [answerAt(cell.answers, question)?.answer, answerAt(rightCells.get(cell.id).answers, question)?.answer])
        .filter(row => row.every(value => typeof value === 'boolean'));
      return [question, [values.filter(row => row[0] === row[1]).length, values.length]];
    }));
    const all = Object.values(perQuestion);
    pairs.push({ left: left.key, right: right.key, cells: matched.length, questions: perQuestion,
      total: [all.reduce((sum, row) => sum + row[0], 0), all.reduce((sum, row) => sum + row[1], 0)] });
  }
  return pairs;
}

export function analysis({ candidates, dimensions, expectations, targets, runs, historical = null, order = candidateOrder, gate = adoption }) {
  requireThat(Array.isArray(candidates) && candidates.length >= 1 && candidates.length <= 3 && dimensions?.length === 6,
    'bakeoff needs one to three candidates and six dimensions');
  const summaries = candidates.map(candidate => candidateSummary(candidate, dimensions, expectations, targets,
    runs[candidate.key] ?? runs[candidate.runId], gate, order));
  const qwen = summaries.find(candidate => candidate.key === 'qwen');
  const questions = questionKeys(expectations);
  return {
    gate,
    dimensions,
    expectations,
    targets,
    candidates: summaries,
    selection: selection(summaries, order),
    candidateAgreement: candidatePairAgreement(summaries, questions),
    comparison: qwen ? historicalComparison(qwen, historical) : null,
  };
}

const escape = value => String(value ?? '—').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
const table = (head, rows) => [`| ${head.map(escape).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.map(escape).join(' | ')} |`)].join('\n');
const fraction = (n, total) => `${n ?? '—'}/${total ?? '—'}`;
const answer = value => value === true ? 'Yes' : value === false ? 'No' : '—';
const score = value => value === undefined ? '—' : value;
const label = value => value ? 'pass' : 'fail';

function linkFor(root, outDir, run, path) {
  return relative(resolve(outDir), resolve(root, run, path)).replaceAll('\\', '/');
}

function cellLinks(cell, root, outDir, run) {
  if (!cell.processIndex) return { transcript: '—', attempts: '—' };
  const transcript = `[\`${cell.id}\`](${linkFor(root, outDir, run, `_processes/${cell.processIndex}/${cell.id}/transcript.json`)})`;
  const judge = cell.complete
    ? `[judge.json](${linkFor(root, outDir, run, `_processes/${cell.processIndex}/${cell.id}/judge.json`)})`
    : '—';
  const attempts = cell.attempts.filter(attempt => attempt.meter?.attemptPath).map(attempt =>
    `[${attempt.scope.call}:${attempt.scope.attempt}](${linkFor(root, outDir, run, `_processes/${attempt.processIndex}/${attempt.meter.attemptPath}`)})`);
  return { transcript, judge, attempts: attempts.join(' ') || '—' };
}

function answerCitations(cell, questions) {
  const yes = questions.flatMap(question => {
    const item = answerAt(cell.answers, question);
    if (item?.answer !== true) return [];
    const dimension = dimensionOfQuestion(question);
    const anchor = question === 'M0' || question === 'R0';
    const ids = anchor ? cell.anchorMessageIds?.[dimension] ?? {} : cell.messageIds?.[question] ?? cell.messageIds?.[dimension]?.[question] ?? {};
    const refs = Object.entries((anchor ? cell.anchors?.[dimension] : item.evidence) ?? {}).filter(([, number]) => Number.isInteger(number))
      .map(([slot, number]) => `${slot}=#${number}${ids[slot] ? `→${ids[slot]}` : ''}`).join(' ');
    return [`${question}${refs ? ` ${refs}` : ''}`];
  });
  return yes.length ? yes.join('; ') : 'No Yes answers';
}

export function renderCandidateReport(candidate, { root = 'runs', outDir = '.' } = {}) {
  const { counts, gates, truth, rates, usage, timing, firstCompliance } = candidate;
  const gateTable = table(['Gate', 'Result', 'Observed', 'Planned'], [
    ['(a) complete cells with six compliant settled attempts', label(gates.a), counts.qualified, counts.planned],
    ['(b) complete S1 cells', label(gates.b), counts.s1Complete, counts.s1Planned],
    ['(c) repetitions with all four bad teachers below normal', label(gates.c), rates.ratePasses, 3],
    ['(d) target-dimension strict hits', label(gates.d), Object.values(rates.targetHits).reduce((sum, n) => sum + n, 0), 12],
    ['(e) false positives plus false negatives', label(gates.e), truth.errors, candidate.maxTruthErrors ?? 2],
  ]);
  const firstTable = table(['Compliance stage', 'Count', 'Planned'], [
    ['Structural first attempts, used in the ranking', candidate.firstStructural.passed, candidate.firstStructural.planned],
    ['First attempts within time and reasoning budget', firstCompliance.passed, firstCompliance.planned],
    ['(a) qualifying settled attempts: each dimension\'s successful attempt within 120 s and its reasoning cap', candidate.qualifiedCompliance.passed, candidate.qualifiedCompliance.planned],
    ['After retries: any compliant dimension settlement', candidate.postRetryCompliance.passed, candidate.postRetryCompliance.planned],
  ]);
  const paired = table(['Repetition', 'Condition', 'Dimension', 'Applicable rate direction', 'Normal', 'Variant', 'Target'],
    rates.paired.flatMap(row => row.pairs.map(pair => [row.repetition, pair.condition, pair.dimension, pair.totalDirection,
      pair.normalScore, pair.variantScore, pair.targetStatus])));
  const matrix = table(['Question', 'TP', 'FN', 'FP', 'TN', 'Missing', 'Expected errors'],
    [...Object.entries(truth.matrix), ['Total', truth.total]].map(([question, row]) => [question, row.tp, row.fn, row.fp, row.tn, row.missing,
      row.fp + row.fn]));
  const gatesNA = table(['N/A gate', 'Correct', 'Planned', 'Missing'], Object.entries(candidate.notApplicableGates ?? {})
    .map(([id, row]) => [id, row.correct, row.planned, row.missing]));
  const missingTable = table(['Cell', 'Settled dimensions', 'Missing dimension', 'Reason', 'Call ID', 'Validation'],
    candidate.missingCells.flatMap(cell => cell.missing.length
      ? cell.missing.map(item => [cell.id, `${cell.settledDimensions}/${candidate.plannedDimensions ?? 6}`, item.dimension, item.reason, item.callId, item.validationCode])
      : [[cell.id, `${cell.settledDimensions}/${candidate.plannedDimensions ?? 6}`, '—', cell.failure?.crossDimension?.code ?? cell.failure?.kind ?? 'no result', cell.failure?.callId, cell.failure?.detail]]));
  const agreement = table(['Question', 'r1/r2', 'r1/r3', 'r2/r3', 'All three'],
    Object.entries(candidate.agreement.questions).map(([question, values]) => [question, ...['r1/r2', 'r1/r3', 'r2/r3', 'all']
      .map(key => fraction(...values[key]))]));
  const cellRows = candidate.cells.map(cell => {
    const links = cellLinks(cell, root, outDir, candidate.runId);
    return [links.transcript, cell.complete ? 'complete' : cell.conflict ? 'cross-dimension conflict' : cell.partial ? 'partial' : 'no result',
      `${cell.settledDimensions}/${cell.plannedDimensions}`, links.judge, links.attempts,
      cell.failure ? [cell.failure.kind, cell.failure.crossDimension?.code ?? cell.failure.detail].filter(Boolean).join(': ') : '—'];
  });
  const answerRows = candidate.cells.map(cell => [cellLinks(cell, root, outDir, candidate.runId).transcript,
    cell.complete ? answerCitations(cell, Object.keys(candidate.agreement.questions)) : 'See the per-dimension attempts above.',
    cellLinks(cell, root, outDir, candidate.runId).judge]);
  const pidTable = table(['Process', 'PID', 'Interrupted', 'Requests', 'Exit code'], candidate.pids.map(pid => [pid.processIndex, pid.pid,
    pid.interrupted ? 'yes' : 'no', pid.requestCount, pid.exitCode]));
  return [
    `# ${candidate.label} · judge bakeoff detail`,
    `Run \`${candidate.runId}\` in \`${candidate.mode ?? 'unknown'}\` mode. Verified: ${candidate.verified ? 'yes' : 'no'}. Eligible: ${candidate.eligible ? 'yes' : 'no'}.`,
    `## Gates\n\n${gateTable}`,
    `## Counts\n\n- Complete cells: ${counts.complete}/${counts.planned}. Cells meeting (a): ${counts.qualified}/${counts.planned}. Partial: ${counts.partial}. Cross-dimension conflict: ${counts.conflict}. No result: ${counts.noResult}.\n- Complete S1 cells: ${counts.s1Complete}/${counts.s1Planned}.\n- Structural first-attempt dimensions: ${candidate.firstStructural.passed}/${candidate.firstStructural.planned}. First-attempt dimensions within the deadline and reasoning budget: ${firstCompliance.passed}/${firstCompliance.planned} (descriptive). (a) qualifying settled dimensions: ${candidate.qualifiedCompliance.passed}/${candidate.qualifiedCompliance.planned}. Dimensions with a compliant settlement after retries: ${candidate.postRetryCompliance.passed}/${candidate.postRetryCompliance.planned}. Successful partial dimensions stay counted even when their cell never assembles.\n\n${firstTable}`,
    `## S1 paired rates and target dimensions\n\n${paired}`,
    `## Construction truth\n\nError counts use the observed answers of complete cells. Unobserved answers enter the Missing column.\n\n${matrix}\n\n${gatesNA}`,
    `## Missing planned cells\n\nEvery incomplete cell is listed with each missing dimension, its reason and call ID. A cross-dimension conflict is a cell-level failure after all six dimensions settled.\n\n${missingTable}`,
    `## Agreement\n\nPer-question agreement uses complete S1 cells. Each denominator is the number of conditions with all compared answers observed; missing cells reduce the denominator and stay visible.\n\n${agreement}`,
    `## Timing\n\n${timingDefinition} Measured ${timing.measured} settled successful dimension attempts. Sent ${timing.sent}; failed ${timing.failed}; missing elapsed values ${timing.missingElapsed}. Median ${timing.medianMs ?? '—'} ms, p90 ${timing.p90Ms ?? '—'} ms.`,
    `## Usage and caps\n\n- Reserved attempts: ${usage.attempts}/${usage.limits.maxAttempts ?? '—'}. Sent requests: ${usage.requests}; retries: ${usage.retries}.\n- Reserved output allowance: ${usage.requestedOutputTokens}/${usage.limits.maxRequestedOutputTokens ?? '—'} tokens. Allowance is not usage.\n- Provider usage, with known counts: ${Object.entries(usage.provider).map(([field, sum]) => `${field} ${sum ?? '—'} (${usage.knownByField[field]}/${usage.requests})`).join(', ')}. Missing usage: ${usage.missingUsage}/${usage.requests}. Missing reported reasoning: ${usage.missingReasoning}.\n- Reasoning over the ${usage.reasoningBudget} token budget: ${usage.reasoningOverBudget.length ? usage.reasoningOverBudget.map(row => `${row.callId}=${row.reasoningTokens}`).join(', ') : 'none'}.\n- Normalization entries: raw ${candidate.normalizations.raw}, meter ${candidate.normalizations.meter}. Cross-dimension conflicts: ${candidate.crossDimensions}.\n- Verification request count: ${candidate.checks.requestCount ?? '—'}; observed sends: ${candidate.checks.observedRequests}; match: ${candidate.checks.requestCountMatches ? 'yes' : 'no'}.\n- PID termination: ${candidate.pidCheck ? (candidate.pidCheck.allTerminated ? 'all recorded processes have exited' : 'at least one recorded PID is still live') : 'see pid-check artifact'}.\n\n${pidTable}`,
    `## Cell and attempt audit\n\nEvery started cell links to its original transcript, every attempt under \`_processes\`, and a complete cell's verified judge original. Attempt labels are call:attempt. Open the judge original for the published verdict and message IDs.\n\n${table(['Cell / transcript', 'Status', 'Dimensions', 'Judge original', 'Attempt originals', 'Failure'], cellRows)}`,
    `## Published answers and citations\n\nEach Yes answer lists its raw evidence slots as \`slot=#number\`, followed by the bound source message ID after the arrow. No answers and all other slots stay in the linked judge.json. Partial cells have no assembled judge.json; their per-dimension raw attempts are the answer originals.\n\n${table(['Cell / transcript', 'Yes answers with citations', 'Judge original'], answerRows)}`,
    `## Report links\n\n[Back to the candidate table](bakeoff-report.md) · \`${candidate.runId}\` original paths are relative to the run root.`,
  ].join('\n\n') + '\n';
}

export function renderReport(result, { root = 'runs', outDir = '.' } = {}) {
  const provenance = result.provenance;
  const proxyCohort = provenance?.cohort === 'proxy-vs-original';
  const rows = result.candidates.map(candidate => [
    `[detail](${candidate.key}-report.md)`, candidate.label, `\`${candidate.runId}\``, candidate.mode ?? '—', candidate.verified ? 'yes' : 'no',
    `${candidate.counts.qualified}/${candidate.counts.planned}`, `${candidate.counts.s1Complete}/${candidate.counts.s1Planned}`,
    `${candidate.rates.ratePasses}/3`, `${candidate.rates.targetHits.answer_dump}/3`, `${candidate.rates.targetHits.lecture}/3`,
    `${candidate.rates.targetHits.sycophant_close}/3`, `${candidate.rates.targetHits.no_teach}/3`,
    `${candidate.truth.errors}/${result.gate.maxTruthErrors}`, `${candidate.firstStructural.passed}/${candidate.firstStructural.planned}`,
    `${candidate.firstCompliance.passed}/${candidate.firstCompliance.planned}`,
    `${candidate.postRetryCompliance.passed}/${candidate.postRetryCompliance.planned}`, candidate.timing.medianMs ?? '—',
    candidate.timing.p90Ms ?? '—', candidate.normalizations.total, candidate.crossDimensions, candidate.eligible ? 'yes' : 'no',
  ]);
  const gateTable = table(['Candidate', 'Label', 'Run', 'Mode', 'Verified', '(a) qualified cells', '(b) S1', '(c) rate',
    '(d) answer_dump', '(d) lecture', '(d) sycophant_close', '(d) no_teach', '(e) errors', 'Structural first',
    'First timed (descriptive)', 'After retry', 'Median ms', 'p90 ms', 'Normalizations', 'Cross', 'Eligible'], rows);
  const pairQuestions = Object.keys(result.candidates[0]?.agreement?.questions ?? {});
  const agreementRows = pairQuestions.map(question => [question, ...result.candidateAgreement.map(pair =>
    fraction(...(pair.questions[question] ?? [0, 0])))]);
  const pairAgreement = result.candidateAgreement.length
    ? table(['Question', ...result.candidateAgreement.map(pair => `${pair.left}/${pair.right} (${pair.cells} cells)`)], agreementRows)
    : 'No candidate pairs.';
  const usageTable = table(['Candidate', 'Reserved attempts / cap', 'Sent', 'Retries', 'Output allowance / cap',
    'Missing usage', 'Missing reasoning', 'Request count match', 'PIDs terminated'], result.candidates.map(candidate => [
    candidate.key,
    `${candidate.usage.attempts}/${candidate.usage.limits.maxAttempts ?? '—'}`,
    candidate.usage.requests, candidate.usage.retries,
    `${candidate.usage.requestedOutputTokens}/${candidate.usage.limits.maxRequestedOutputTokens ?? '—'}`,
    `${candidate.usage.missingUsage}/${candidate.usage.requests}`, candidate.usage.missingReasoning,
    candidate.checks.requestCountMatches ? 'yes' : 'no',
    candidate.pidCheck ? (candidate.pidCheck.allTerminated ? 'yes' : 'no') : 'see artifact',
  ]));
  const comparison = result.comparison;
  const comparisonTable = comparison?.available && comparison.rows.length ? table(['Cell', 'Split dimensions', '①g dimensions', 'Equal'],
    comparison.rows.map(row => [row.id,
      result.dimensions.map(dimension => `${dimension}=${score(row.splitScores[dimension])}`).join('; '),
      result.dimensions.map(dimension => `${dimension}=${score(row.historicalScores[dimension])}`).join('; '), `${row.same}/6`]))
    : 'No matched complete cells to compare.';
  const provenanceSection = provenance ? [
    `## Cohort provenance`,
    `Registered cohort: \`${provenance.cohort}\`. ${proxyCohort
      ? 'Two proxied candidates are compared against the untouched original Qwen run under identical gates and ranking. Every value below is read from each run manifest identity and its registered preregistration, not inferred.'
      : 'Provenance is read from each run manifest identity and its registered preregistration.'}`,
    table(['Candidate', 'Cohort', 'Run', 'Mode', 'Preregistration SHA256', 'Parent SHA256', 'Judge transport', 'Proxy source'],
      candidateOrder.filter(key => provenance.candidates?.[key]).map(key => {
        const row = provenance.candidates[key];
        return [key, row.cohort, `\`${row.runId}\``, row.mode, `\`${row.preregistrationSha256}\``,
          row.parentRegistrationSha256 ? `\`${row.parentRegistrationSha256}\`` : '—',
          row.judgeTransport ? (row.judgeTransport.proxied ? 'proxied' : 'direct') : 'none',
          row.judgeTransport?.proxySource ?? '—'];
      })),
    ...(proxyCohort
      ? [`Addendum preregistration \`${provenance.proxyAddendumSha256}\` parents the original registration \`${provenance.originalRegistrationSha256}\` on the ${provenance.plannedCount} shared slots. The original ①h Haiku and Gemini direct runs are infrastructure-only failures and are not measured; this proxy supplement re-measures them through the registered transport. Original ①g whole-pack observations remain available as comparison context.`]
      : []),
  ].join('\n\n') : null;
  return [
    proxyCohort
      ? '# Judge bakeoff ①h proxy supplement · Haiku/Gemini proxied versus original Qwen'
      : '# Judge bakeoff ①h · three-candidate adoption report',
    `Selection: **${result.selection.selected ?? 'none'}**. ${result.selection.selected ? `Eligible candidates: ${result.selection.eligible.join(', ')}.` : 'No candidate passed every gate on verified real artifacts.'}`,
    `## Selection rule\n\n${result.selection.rule}`,
    ...(provenanceSection ? [provenanceSection] : []),
    `## Candidate table\n\n${gateTable}`,
    `## Candidate-to-candidate per-question agreement\n\nEach denominator counts matched complete cells where both candidates answered that question. This compares split runs; it is not a correctness score.\n\n${pairAgreement}`,
    `## Usage and verification\n\n${usageTable}`,
    `## Gates\n\n- (a) 18/18 complete cells. For each of the six dimensions, the successful settled attempt (first or retry) was actually sent, passed local validation, and returned its full visible JSON within 120 s of send; reported reasoning stays within that candidate's cap. A cross-dimension conflict does not qualify.\n- (b) At least 14/15 complete S1 cells; any locally valid complete cell counts.\n- (c) 3/3 repetitions have all four bad teachers strictly below the same-repetition normal applicable score rate.\n- (d) Each target dimension is strictly lower in at least 2/3 repetitions.\n- (e) Definite construction false positives plus false negatives at most 2; missing bits are separate.\n\nThe five gates follow the ①d preregistration, with (a) and (b) updated for ①h as supplied. Construction truth uses only complete cells. First-attempt and after-retry compliance are descriptive; the first-attempt count is only a tie-break.`,
    `## Qwen split versus ①g whole-pack\n\n${proxyCohort ? 'Not recomputed in this proxy cohort. This supplement compares proxy Haiku and Gemini against the original Qwen run under the same gates. The original ①h Haiku and Gemini direct runs are infrastructure-only failures, while the original ①g whole-pack run keeps its own comparison observations as historical context.' : comparisonTable}`,
    ...(proxyCohort ? [] : comparison?.available ? [
      `Matched complete cells: ${comparison.matched}. Split complete: ${comparison.splitComplete}/${comparison.planned}. ①g complete: ${comparison.historicalComplete}/${comparison.historicalPlanned}. Split-only: ${comparison.splitOnly.join(', ') || 'none'}. ①g-only: ${comparison.historicalOnly.join(', ') || 'none'}.`,
      `Dimension agreement on matched cells: ${Object.keys(comparison.dimensionAgreement).length ? Object.entries(comparison.dimensionAgreement).map(([dimension, row]) => `${dimension} ${fraction(row.same, row.total)}`).join(', ') : 'none (no matched complete cells)'}.`,
      `Per-question agreement on matched cells: ${Object.keys(comparison.questionAgreement).length ? Object.entries(comparison.questionAgreement).map(([question, row]) => `${question} ${fraction(row[0], row[1])}`).join(', ') : 'none (no matched complete cells)'}.`,
      `**Caveat.** ${comparison.caveat}`,
    ] : [`**Caveat.** ${comparison?.error ?? 'Historical ①g run unavailable.'} The historical absence is shown rather than imputed.`]),
    `## Reproduction\n\n\`\`\`sh\nnode scripts/judge-bakeoff-report.mjs --run-root ${root} --out ${outDir}${proxyCohort ? ` --proxy-addendum-sha256 ${provenance.proxyAddendumSha256}` : ''}\n\`\`\``,
    `Machine data: [bakeoff.json](bakeoff.json). Per-candidate details: ${result.candidates.map(candidate => `[${candidate.key}](${candidate.key}-report.md)`).join(', ')}.`,
  ].join('\n\n') + '\n';
}

export function checkPids(processes, probe = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'ESRCH' ? false : true; }
}) {
  const rows = processes.map(row => ({ ...row, live: probe(row.pid) }));
  return { rows, allTerminated: rows.every(row => !row.live) };
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function main({ runRoot = 'runs', outDir = '.tmp/scratch/judge-bakeoff', proxyAddendumSha256 = null } = {}) {
  const { splitJudgeCandidates } = await import('../config/judge-bakeoff.mjs');
  const { splitDimensions } = await import('../contracts/judge/binary-v3.mjs');
  const { readBatch } = await import('../src/cell-batch-verification.mjs');
  const { verifyRun } = await import('../src/run-receipts.mjs');
  const root = resolve(runRoot);
  const out = resolve(outDir);
  mkdirSync(out, { recursive: true });
  let proxyPlan = null;
  if (proxyAddendumSha256) {
    const plan = await import('../src/judge-bakeoff-plan.mjs');
    proxyPlan = { runIds: plan.proxyBakeoffRunIds, original: plan.originalBakeoffRegistrationSha256 };
    requireThat(proxyPlan.runIds?.haiku && proxyPlan.runIds?.gemini && isSha256(proxyPlan.original),
      'proxy bakeoff plan exports (proxyBakeoffRunIds, originalBakeoffRegistrationSha256) are unavailable');
  }
  const runIds = Object.fromEntries(candidateOrder.map(key => [key, splitJudgeCandidates[key].runId]));
  if (proxyPlan) { runIds.haiku = proxyPlan.runIds.haiku; runIds.gemini = proxyPlan.runIds.gemini; }
  let expectations, sharedRegistration, provenance = null;
  const runs = {};
  const entries = [];
  for (const key of candidateOrder) {
    const candidate = { key, ...splitJudgeCandidates[key], runId: runIds[key] };
    const run = {};
    try {
      const verification = verifyRun(root, runIds[key]);
      const batch = readBatch(root, runIds[key]);
      const digest = batch.manifest.identity.preregistrationSha256;
      const expected = constructExpectations(readFileSync(join(root, runIds[key], 'preregistration.md'), 'utf8'));
      if (!proxyPlan) {
        requireThat(!sharedRegistration || sharedRegistration === digest, 'candidate preregistration digest differs');
        sharedRegistration = digest;
      }
      expectations = expected;
      Object.assign(run, { batch, verification });
      write(join(out, `${runIds[key]}.verify-run.json`), verification);
      write(join(out, `${runIds[key]}.pid-check.json`), { runId: runIds[key], ...checkPids(batch.processes ?? []) });
      entries.push({ key, batch, verification, expectations: expected });
    } catch (error) {
      run.error = error.message;
    }
    runs[key] = run;
  }
  let historical = null;
  if (proxyPlan) {
    const failed = candidateOrder.map(key => runs[key].error).filter(Boolean);
    requireThat(!failed.length, `proxy cohort run failed: ${failed.join('; ')}`);
    provenance = proxyProvenance({ entries, proxyAddendumSha256, originalRegistrationSha256: proxyPlan.original });
    expectations = entries.find(entry => entry.key === 'qwen')?.expectations ?? entries[0].expectations;
  } else {
    try {
      historical = { batch: readBatch(root, 'round2-qwen-judge-01'), verification: verifyRun(root, 'round2-qwen-judge-01') };
    } catch (error) { historical = { error: error.message }; }
  }
  const candidates = candidateOrder.map(key => ({ key, ...splitJudgeCandidates[key], runId: runIds[key] }));
  const result = analysis({ candidates, dimensions: splitDimensions, expectations, targets: {
    answer_dump: 'productive_struggle', lecture: 'agency_handoff', sycophant_close: 'verification_or_transfer',
    no_teach: 'misconception_repair',
  }, runs, historical });
  if (provenance) result.provenance = provenance;
  for (const candidate of result.candidates) if (candidate.pids.length) candidate.pidCheck = checkPids(candidate.pids);
  write(join(out, 'bakeoff.json'), result);
  writeFileSync(join(out, 'bakeoff-report.md'), renderReport(result, { root, outDir: out }));
  for (const candidate of result.candidates) writeFileSync(join(out, `${candidate.key}-report.md`), renderCandidateReport(candidate, { root, outDir: out }));
  return { probe: out, selected: result.selection.selected, ranking: result.selection.ranking,
    reports: result.candidates.map(candidate => join(out, `${candidate.key}-report.md`)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { 'run-root': { type: 'string', default: 'runs' }, out: { type: 'string', default: '.tmp/scratch/judge-bakeoff' }, 'proxy-addendum-sha256': { type: 'string' } } });
  main({ runRoot: values['run-root'], outDir: values.out, proxyAddendumSha256: values['proxy-addendum-sha256'] ?? null })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
