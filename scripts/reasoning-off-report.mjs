import { reasoningOffPolicy } from '../config/judge-reasoning-off.mjs';
import { cellIds } from '../contracts/artifacts/schema.mjs';
import { binaryDimensions, binaryGates, binaryQuestions } from '../contracts/judge/binary.mjs';
import { assessS1, s1Path, s1Plan, s1Repetitions, s1Targets } from '../src/s1-binary-plan.mjs';
import { confusion } from './s1-binary-report.mjs';

export const adoption = Object.freeze({ maxReasoningTokens: 0, minS1Valid: 14, minRatePasses: 3, minTargetPasses: 2, maxTruthErrors: 2 });
const questions = Object.keys(binaryQuestions);
export const unchangedQuestions = Object.freeze(questions.filter(key => !['V1', 'V2', 'A1', 'A2'].includes(key)));
const firstAttemptCount = 18;
const diagnosticCount = 6;
const deadlineMs = reasoningOffPolicy.judge.timeoutMs;
const number = value => Number.isFinite(value) && value >= 0;
const observedBit = (answers, question) => answers?.[question]?.answer;

function firstObservation(attempt) {
  const phase = attempt?.phaseMs;
  // The telemetry contract records firstVisible only for a nonblank delta.
  const hasOffset = number(phase?.requestSent) && number(phase.firstVisible) && phase.firstVisible >= phase.requestSent;
  const visibleDelayMs = hasOffset ? phase.firstVisible - phase.requestSent : null;
  const issues = [];
  if (attempt?.sent !== true) issues.push('first request not sent');
  if (visibleDelayMs === null) issues.push('first visible delay unobserved');
  else if (visibleDelayMs > deadlineMs) issues.push('first visible after deadline');
  if (attempt?.reasoningTokens !== adoption.maxReasoningTokens) issues.push('explicit zero reasoning tokens not established');
  if (number(phase?.firstReasoning) || number(phase?.lastReasoning)) issues.push('contradictory reasoning delta observed');
  else if (phase?.firstReasoning !== null || phase?.lastReasoning !== null) issues.push('missing reasoning delta observation');
  return { visibleDelayMs, issues, passed: issues.length === 0 };
}

function agreement(groups) {
  const known = groups.filter(values => values.every(value => value !== undefined && value !== null));
  return [known.filter(values => values.every(value => value === values[0])).length, known.length];
}

const repeatSets = [...s1Repetitions.flatMap((a, i) => s1Repetitions.slice(i + 1).map(b => [a, b])), s1Repetitions];
const repeatsBy = (fields, get) => Object.fromEntries(fields.map(key => [key, Object.fromEntries(repeatSets.map(repeats => [
  repeats.length === 3 ? 'all' : repeats.join('/'),
  agreement(cellIds.map(condition => repeats.map(repetition => get(s1Path({ repetition, condition }), key)))),
]))]));

function outcomeKind(attempt) {
  if (attempt.failureKind === 'timeout' || attempt.detail === 'local request timeout') return 'timeout';
  return attempt.failureKind ? 'error' : 'ok';
}

function timing(planned, attempts) {
  const values = attempts.map(row => row.elapsedMs).filter(number).sort((a, b) => a - b);
  const n = values.length;
  return {
    planned, sent: attempts.length, measured: n, timeouts: attempts.filter(row => outcomeKind(row) === 'timeout').length,
    errors: attempts.filter(row => outcomeKind(row) === 'error').length,
    medianMs: n ? (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2 : null,
    p90Ms: n ? values[Math.ceil(0.9 * n) - 1] : null,
  };
}

function usageSummary(mode, attempts, limits) {
  const sent = mode === 'real' ? attempts.filter(row => row.sent) : [];
  const usageRows = sent.map(row => ({
    // The normalized usage object can be all zero when the stream never reports usage.
    normalized: row.usage && (number(row.reportedOutputTokens) || Object.values(row.usage).some(value => number(value) && value > 0)) ? row.usage : null,
    output: number(row.reportedOutputTokens) ? row.reportedOutputTokens : null,
  }));
  const knownByField = {}, provider = {};
  for (const key of ['input', 'cacheRead', 'output', 'totalTokens']) {
    const values = usageRows.map(row => key === 'output' ? row.output : row.normalized?.[key]).filter(number);
    knownByField[key] = values.length;
    provider[key] = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  return {
    limits, attempts: attempts.length, requests: sent.length, retries: sent.filter(row => row.attempt > 1).length,
    requestedOutputTokens: sent.reduce((sum, row) => sum + row.requestLimit, 0),
    provider, knownByField, missingUsage: usageRows.filter(row => row.normalized === null && row.output === null).length,
  };
}

export function analyzeReasoningOff({ mode, queue, outcomes, expected, history, limits }) {
  const byId = new Map(outcomes.map(row => [row.id, row]));
  const cells = queue.map(plan => {
    const outcome = byId.get(plan.id);
    const attempts = outcome?.attempts ?? [];
    const firstAttempt = attempts.find(row => row.attempt === 1) ?? null;
    return { ...plan, recorded: Boolean(outcome), verdict: outcome?.verdict ?? null, failure: outcome?.failure ?? null,
      attempts, firstAttempt, first: firstObservation(firstAttempt) };
  });
  const byCell = new Map(cells.map(row => [row.id, row]));
  const samples = s1Plan.map(coordinate => {
    const verdict = byCell.get(s1Path(coordinate))?.verdict;
    return { id: coordinate.condition, repetition: coordinate.repetition, answers: verdict?.answers, scoring: verdict?.scoring };
  });
  const { paired, targetHits, ratePasses } = assessS1(samples);
  const s1 = { planned: s1Plan.length, valid: samples.filter(row => row.answers && row.scoring).length, paired, targetHits, ratePasses };
  const matrix = confusion(expected, samples);
  const truthErrors = matrix.total.fp + matrix.total.fn;
  const gateRates = Object.fromEntries(Object.keys(binaryGates).map(key => {
    const answers = samples.map(row => observedBit(row.answers, key));
    return [key, { notApplicable: answers.filter(bit => bit === false).length, applicable: answers.filter(bit => bit === true).length,
      missing: answers.filter(bit => typeof bit !== 'boolean').length }];
  }));
  const historical = new Map(history.s1.map(row => [row.id, row]));
  const v1Agreement = Object.fromEntries(unchangedQuestions.map(key => [key, Object.fromEntries([...s1Repetitions, 'all'].map(repetition => {
    const matched = s1Plan.filter(row => repetition === 'all' || row.repetition === repetition).map(row => s1Path(row));
    return [repetition, agreement(matched.map(id => [observedBit(byCell.get(id)?.verdict?.answers, key), observedBit(historical.get(id)?.answers, key)]))];
  }))]));
  const repeatAgreement = {
    questions: repeatsBy(questions, (id, key) => observedBit(byCell.get(id)?.verdict?.answers, key)),
    dimensions: repeatsBy(binaryDimensions, (id, key) => byCell.get(id)?.verdict?.scoring.scores[key]),
  };

  const qualify = cells.filter(cell => cell.first.passed).length;
  const gates = {
    firstAttempts: cells.length === firstAttemptCount && qualify === firstAttemptCount,
    s1Valid: s1.valid >= adoption.minS1Valid,
    ratePasses: ratePasses >= adoption.minRatePasses,
    targetPasses: Object.values(targetHits).every(hit => hit >= adoption.minTargetPasses),
    truthErrors: truthErrors <= adoption.maxTruthErrors,
  };
  const attempts = cells.flatMap(cell => cell.attempts.map(row => ({ ...row, cellId: cell.id })));
  const matchedRows = s1Plan.map(coordinate => {
    const id = s1Path(coordinate);
    const first = byCell.get(id)?.firstAttempt;
    return { id, current: first?.sent ? first : null, historical: historical.get(id) ?? null };
  });
  const measuredPairs = matchedRows.filter(row => number(row.current?.elapsedMs) && number(row.historical?.elapsedMs));
  const elapsed = {
    batch: timing(firstAttemptCount, cells.map(cell => cell.firstAttempt).filter(row => row?.sent)),
    matchedS1: { rows: matchedRows, matched: measuredPairs.length,
      current: timing(s1Plan.length, measuredPairs.map(row => row.current)),
      historical: timing(s1Plan.length, measuredPairs.map(row => row.historical)) },
    timeoutDiagnostics: { ...timing(diagnosticCount, history.timeouts), rows: history.timeouts },
  };
  return { mode, adopted: mode === 'real' && Object.values(gates).every(Boolean), gates, cells, firstAttempts: { planned: firstAttemptCount, qualify, deadlineMs },
    s1, truthErrors, matrix, gateRates, v1Agreement, repeatAgreement, elapsed, usage: usageSummary(mode, attempts, limits),
    retries: attempts.filter(row => row.attempt > 1) };
}

const display = value => value ?? '—';
const escape = value => String(display(value)).replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
const table = (header, rows) => [header, header.map(() => '---'), ...rows].map(row => `| ${row.map(escape).join(' | ')} |`).join('\n');
const fraction = ([n, total]) => `${n}/${total}`;
const label = passed => passed ? 'pass' : 'fail';
const transcript = id => `[${id}](${id}/transcript.json)`;
const diag = row => [row?.failureKind, row?.detail].filter(Boolean).join(': ') || '—';
const attemptLink = row => `[${row.callId}](${row.attemptPath})`;
const usageText = usage => usage ? `${display(usage.input)} / ${display(usage.cacheRead)} / ${display(usage.output)} / ${display(usage.totalTokens)}` : 'missing';
const attemptCells = row => row ? [attemptLink(row), row.sent ? 'yes' : 'no', row.elapsedMs, row.reasoningTokens,
  row.reportedOutputTokens, row.requestLimit, usageText(row.usage), diag(row)] : Array(8).fill('—');
const attemptHeads = ['Call ID / raw attempt', 'Sent', 'Elapsed ms', 'Reasoning tokens', 'Reported output tokens', 'Output allowance', 'Usage I / C / O / T', 'Attempt failure'];

function renderAnswers(cells) {
  return table(['Cell / transcript', 'Points / possible', 'Dimension scores', 'Answers and evidence'], cells.map(cell => {
    const { answers, scoring } = cell.verdict ?? {};
    return [cell.recorded ? transcript(cell.id) : cell.id, scoring ? `${scoring.points}/${scoring.possible}` : '—',
      scoring && binaryDimensions.map(key => `${key}=${scoring.scores[key]}`).join('; '),
      answers && questions.map(key => {
        const item = answers[key];
        if (!item) return `${key}=—`;
        const refs = Object.entries(item.evidence).filter(([, n]) => n !== null).map(([slot, n]) => `${slot}=#${n}`).join(' ');
        return `${key}=${item.answer ? `Yes${refs ? ` ${refs}` : ''}` : 'No'}`;
      }).join('; ')];
  }));
}

export function renderReasoningOffReport(analysis, { id, pid, identityId, preregistrationSha256 }) {
  const { mode, adopted, gates, cells, firstAttempts, s1, truthErrors, matrix, gateRates, v1Agreement, repeatAgreement, elapsed, usage, retries } = analysis;
  const firstTable = table(['Cell / transcript', ...attemptHeads, 'First visible from send ms', 'First / last reasoning ms', 'First-request issues', 'Cell verdict'], cells.map(cell => [
    cell.recorded ? transcript(cell.id) : cell.id,
    ...attemptCells(cell.firstAttempt), cell.first.visibleDelayMs,
    `${display(cell.firstAttempt?.phaseMs?.firstReasoning)} / ${display(cell.firstAttempt?.phaseMs?.lastReasoning)}`, cell.first.issues.join('; ') || 'none',
    cell.verdict ? 'compliant' : cell.failure ? [cell.failure.kind, cell.failure.detail].filter(Boolean).join(': ') : cell.recorded ? 'no compliant verdict' : 'unstarted',
  ]));
  const perQuestion = table(['Question', ...s1Repetitions, 'All'], Object.entries(v1Agreement).map(([key, counts]) => [key, ...Object.values(counts).map(fraction)]));
  const consistency = rows => table(['Item', 'r1/r2', 'r1/r3', 'r2/r3', 'All three'], Object.entries(rows).map(([key, counts]) => [key, ...Object.values(counts).map(fraction)]));
  const latency = table(['Cohort', 'Planned', 'Sent or matched', 'Measured', 'Timeouts', 'Other errors', 'Median ms', 'p90 ms'], [
    ['①d batch, first requests', elapsed.batch], ['①d S1, same matched pairs', elapsed.matchedS1.current],
    ['Historical v1 S1, same matched pairs', elapsed.matchedS1.historical], ['Historical diagnostics, first requests', elapsed.timeoutDiagnostics],
  ].map(([name, row]) => [name, row.planned, row.sent, row.measured, row.timeouts, row.errors, row.medianMs, row.p90Ms]));
  const matchedRows = table(['S1 cell', 'Current elapsed ms', 'Current failure', 'Historical elapsed ms', 'Historical failure', 'Pair'],
    elapsed.matchedS1.rows.map(({ id: cellId, current, historical }) => [cellId, current?.elapsedMs, diag(current), historical?.elapsedMs, diag(historical),
      number(current?.elapsedMs) && number(historical?.elapsedMs) ? 'matched' : 'not matched']));
  const diagnosticRows = table(['Historical diagnostic ID', 'Elapsed ms', 'Failure'], elapsed.timeoutDiagnostics.rows.map(row => [row.id, row.elapsedMs, diag(row)]));
  const paired = table(['Repeat', 'Bad condition', 'Applicable rate direction', 'Target dimension', 'Normal score', 'Bad score', 'Target direction'], s1.paired.flatMap(({ repetition, pairs }) => pairs.map(pair => [
    repetition, pair.condition, pair.totalDirection, pair.dimension, pair.normal, pair.variant, pair.targetStatus,
  ])));
  const confusionTable = table(['Question', 'TP', 'FN', 'FP', 'TN', 'Missing expected Yes', 'Missing expected No'], [...Object.entries(matrix.questions), ['Total', matrix.total]].map(([key, row]) => [
    key, row.tp, row.fn, row.fp, row.tn, row.missingYes, row.missingNo,
  ]));
  const gatesTable = table(['Gate', 'Observed N/A rate', 'Applicable Yes', 'Missing', 'Expected applicable retained', 'Expected N/A retained'], Object.entries(gateRates).map(([key, row]) => {
    const truth = matrix.gates[key];
    return [key, fraction([row.notApplicable, row.notApplicable + row.applicable]), row.applicable, row.missing, fraction([truth.tp, truth.tp + truth.fn]), fraction([truth.tn, truth.tn + truth.fp])];
  }));
  return [
    '# ①d HY4 reasoning-off experiment · no freeze evidence',
    `Run \`${id}\` in \`${mode}\` mode, PID ${pid}, identity \`${identityId}\`. Preregistration SHA256 \`${preregistrationSha256}\`. [Manifest](manifest.json) · [Preregistration](preregistration.md) · [Full replay](verify-run.json) · [Start receipt](../_receipts/${id}.start.json) · [Process receipt](../_receipts/${id}.process.json) · [Request log](../_receipts/${id}.requests.jsonl)`,
    `## Adoption decision\n\n**${adopted ? 'Adopt HY4 reasoning-off for this experiment.' : 'Do not adopt HY4 reasoning-off on this evidence.'}**`,
    ...(mode !== 'real' ? ['Offline results are synthetic and never model evidence or adoption evidence.'] : []),
    ...(adopted ? [] : ['Qwen3 235B Instruct/Parasail is a prospective fallback. This report does not switch routes.']),
    `After steps 2 and 3 are merged, rerun S1 and the perturbation retest with the final evaluation identity.`,
    `- (a) ${label(gates.firstAttempts)}. ${firstAttempts.qualify}/${firstAttempts.planned} first requests were sent, had nonblank visible text within ${firstAttempts.deadlineMs} ms of request send, and reported zero reasoning tokens without a reasoning delta. Retries cannot replace first requests.\n- (b) ${label(gates.s1Valid)}. ${s1.valid}/${s1.planned} compliant S1 verdicts; need ${adoption.minS1Valid}. The final valid retry can supply a verdict.\n- (c) ${label(gates.ratePasses)}. ${s1.ratePasses}/3 repetitions have all four bad conditions strictly below normal on applicable score rate.\n- (d) ${label(gates.targetPasses)}. Each target needs ${adoption.minTargetPasses}/3 strict hits: ${Object.entries(s1.targetHits).map(([condition, n]) => `${s1Targets[condition]} ${n}/3`).join(', ')}. Missing scores, ties, and N/A do not hit.\n- (e) ${label(gates.truthErrors)}. Definite construction errors: ${truthErrors} FP + FN combined; maximum ${adoption.maxTruthErrors}. Missing observations are separate, not zeros.`,
    `## S1 paired rates and target dimensions\n\n${paired}`,
    `## Construction truth and applicability\n\nOnly preregistered definite Yes or No bits enter the confusion matrix. Normal is not construction truth.\n\n${confusionTable}\n\nGate No means N/A. Each observed rate uses only known gate answers. Gate rates do not add adoption criteria.\n\n${gatesTable}`,
    `## Agreement\n\nAgreement is not correctness. v1 comparisons match the same condition and repetition, and use only 15 unchanged questions. V1, V2, A1, and A2 are excluded. Each denominator counts pairs with both answers, out of five planned pairs per repeat and 15 overall.\n\n${perQuestion}\n\nRepeat agreement matches the same condition across repeats. Each denominator counts conditions with all required observations, out of five planned conditions. N/A is a category for dimension agreement.\n\n### By question\n\n${consistency(repeatAgreement.questions)}\n\n### By dimension\n\n${consistency(repeatAgreement.dimensions)}`,
    `## First-request elapsed time\n\nElapsed includes failed requests with an observed duration. Median uses the middle value or the mean of the two middle values. p90 uses nearest rank. The S1 comparison uses ${elapsed.matchedS1.matched}/${s1.planned} matched condition/repetition pairs with both first-request durations. Missing durations and unstarted cells do not contribute to quantiles. The six old diagnostic attempts used 360 s and are not equivalent to the 180 s experiment.\n\n${latency}\n\n### Matched S1 attempts\n\n${matchedRows}\n\n### Historical diagnostic attempts\n\n${diagnosticRows}`,
    `## Requests and output allowance\n\n- Real requests / hard cap: ${usage.requests}/${usage.limits.maxAttempts}. This includes ${usage.retries} sent retries. Recorded attempts in this run: ${usage.attempts}.\n- Issued output token allowance / hard cap: ${usage.requestedOutputTokens}/${usage.limits.maxRequestedOutputTokens}. Allowance is not usage.\n- Provider-known tokens by field, with reporting counts: ${Object.entries(usage.provider).map(([key, sum]) => `${key} ${display(sum)} (${usage.knownByField[key]}/${usage.requests} requests)`).join(', ')}. ${usage.missingUsage}/${usage.requests} requests lack observed usage. Output uses the provider's reported output count, not a normalized zero placeholder.`,
    `## Cell audit in plan order\n\nEach call ID links to the raw attempt. A cell can have visible text but no compliant verdict.\n\n${firstTable}\n\n### Retry attempts\n\n${retries.length ? table(['Cell / transcript', ...attemptHeads], retries.map(row => [transcript(row.cellId), ...attemptCells(row)])) : 'No retries recorded.'}\n\n### Published answers\n\nEach #n refers to the linked transcript.\n\n${renderAnswers(cells)}`,
  ].join('\n\n') + '\n';
}
