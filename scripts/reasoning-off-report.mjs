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

function firstObservation(attempt, contrast) {
  const phase = attempt?.phaseMs;
  // The telemetry contract records firstVisible only for a nonblank delta.
  const hasOffset = number(phase?.requestSent) && number(phase.firstVisible) && phase.firstVisible >= phase.requestSent;
  const visibleDelayMs = hasOffset ? phase.firstVisible - phase.requestSent : null;
  const issues = [];
  if (attempt?.sent !== true) issues.push('first request not sent');
  if (visibleDelayMs === null) issues.push('first visible delay unobserved');
  else if (visibleDelayMs > deadlineMs) issues.push('first visible after deadline');
  if (!contrast && attempt?.reasoningTokens !== adoption.maxReasoningTokens) issues.push('explicit zero reasoning tokens not established');
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

function usageSummary(mode, attempts, limits, contrast) {
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
    limits, attempts: attempts.length, requests: sent.length, retries: sent.filter(row => contrast ? row.retry : row.attempt > 1).length,
    requestedOutputTokens: sent.reduce((sum, row) => sum + (contrast && !number(row.requestLimit) ? 0 : row.requestLimit), 0),
    provider, knownByField, missingUsage: usageRows.filter(row => row.normalized === null && row.output === null).length,
    ...(contrast && { missingRequestLimits: sent.filter(row => !number(row.requestLimit)).length }),
  };
}

export function analyzeReasoningOff(input) {
  return analyze(input, false);
}

export function analyzeJudgeContrast(input) {
  return analyze(input, true);
}

function analyze({ mode, queue, outcomes, expected, history, limits, budget }, contrast) {
  const byId = new Map(outcomes.map(row => [row.id, row]));
  const cells = queue.map(plan => {
    const outcome = byId.get(plan.id);
    const attempts = outcome?.attempts ?? [];
    const firstAttempt = (contrast ? attempts[0] : attempts.find(row => row.attempt === 1)) ?? null;
    return { ...plan, recorded: outcome?.recorded ?? Boolean(outcome), verdict: outcome?.verdict ?? null, failure: outcome?.failure ?? null,
      attempts, firstAttempt, first: firstObservation(firstAttempt, contrast) };
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
  const attempts = cells.flatMap(cell => cell.attempts.map((row, i) => ({ ...row, cellId: cell.id, ...(contrast && { retry: i > 0 }) })));
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
    s1, truthErrors, matrix, gateRates, v1Agreement, repeatAgreement, elapsed, usage: usageSummary(mode, attempts, limits, contrast),
    retries: attempts.filter(row => contrast ? row.retry : row.attempt > 1),
    ...(contrast && { budget, v1Contrast: contrastV1(byCell, historical) }) };
}

function contrastV1(byCell, historical) {
  return s1Plan.flatMap(coordinate => {
    const id = s1Path(coordinate);
    return unchangedQuestions.map(question => ({ id, question, prior: historical.get(id)?.answers?.[question],
      current: byCell.get(id)?.verdict?.answers?.[question] }));
  });
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

function answerText(item) {
  if (typeof item?.answer !== 'boolean') return '—';
  const refs = Object.entries(item.evidence ?? {}).filter(([, n]) => Number.isInteger(n)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([slot, n]) => `${slot}=#${n}`).join(' ');
  return `${item.answer ? 'Yes' : 'No'}${refs ? ` ${refs}` : ''}`;
}

function cellLink(cell, contrast) {
  return cell.recorded && (!contrast || cell.verdict || cell.failure) ? transcript(cell.id) : cell.id;
}

function renderAnswers(cells, contrast) {
  return table(['Cell / transcript', 'Points / possible', 'Dimension scores', 'Answers and evidence'], cells.map(cell => {
    const { answers, scoring } = cell.verdict ?? {};
    return [cellLink(cell, contrast), scoring ? `${scoring.points}/${scoring.possible}` : '—',
      scoring && binaryDimensions.map(key => `${key}=${scoring.scores[key]}`).join('; '),
      contrast ? questions.map(key => `${key}=${answerText(answers?.[key])}`).join('; ') : answers && questions.map(key => {
        const item = answers[key];
        if (!item) return `${key}=—`;
        const refs = Object.entries(item.evidence).filter(([, n]) => n !== null).map(([slot, n]) => `${slot}=#${n}`).join(' ');
        return `${key}=${item.answer ? `Yes${refs ? ` ${refs}` : ''}` : 'No'}`;
      }).join('; ')];
  }));
}

export function renderReasoningOffReport(analysis, metadata) {
  return render(analysis, metadata, false);
}

export function renderJudgeContrastReport(analysis, metadata) {
  return render(analysis, metadata, true);
}

function render(analysis, { id, pid, identityId, preregistrationSha256, candidate, policyVersion, route, verification }, contrast) {
  const { mode, adopted, gates, cells, firstAttempts, s1, truthErrors, matrix, gateRates, v1Agreement, repeatAgreement, elapsed, usage, retries } = analysis;
  const heads = contrast ? [...attemptHeads, 'Process / PID', 'Reported provider'] : attemptHeads;
  const attemptRow = row => {
    const cols = attemptCells(row);
    if (!contrast) return cols;
    if (row && !row.attemptPath) cols[0] = row.callId;
    return [...cols, row && `${display(row.processIndex)} / ${display(row.pid)}`, row?.reportedProvider];
  };
  const reasoningPhase = phase => contrast && phase === null ? 'no delta' : display(phase);
  const firstTable = table(['Cell / transcript', ...heads, 'First visible from send ms', 'First / last reasoning ms', 'First-request issues', 'Cell verdict'], cells.map(cell => [
    cellLink(cell, contrast),
    ...attemptRow(cell.firstAttempt), cell.first.visibleDelayMs,
    `${reasoningPhase(cell.firstAttempt?.phaseMs?.firstReasoning)} / ${reasoningPhase(cell.firstAttempt?.phaseMs?.lastReasoning)}`, cell.first.issues.join('; ') || 'none',
    cell.verdict ? 'compliant' : cell.failure ? [cell.failure.kind, cell.failure.detail].filter(Boolean).join(': ') : cell.recorded ? 'no compliant verdict' : 'unstarted',
  ]));
  const perQuestion = table(['Question', ...s1Repetitions, 'All'], Object.entries(v1Agreement).map(([key, counts]) => [key, ...Object.values(counts).map(fraction)]));
  const consistency = rows => table(['Item', 'r1/r2', 'r1/r3', 'r2/r3', 'All three'], Object.entries(rows).map(([key, counts]) => [key, ...Object.values(counts).map(fraction)]));
  const latency = table(['Cohort', 'Planned', 'Sent or matched', 'Measured', 'Timeouts', 'Other errors', 'Median ms', 'p90 ms'], [
    [contrast ? '①g batch, plan-first requests' : '①d batch, first requests', elapsed.batch],
    [contrast ? '①g S1, same matched pairs' : '①d S1, same matched pairs', elapsed.matchedS1.current],
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
  const name = contrast ? candidate : 'HY4 reasoning-off';
  const firstRule = contrast ? 'had observed null first and last reasoning timestamps (no reasoning delta). Reported reasoning tokens are descriptive only; missing counts are not zero.' : 'reported zero reasoning tokens without a reasoning delta.';
  const identity = `identity \`${identityId}\`. Preregistration SHA256 \`${preregistrationSha256}\`. [Manifest](manifest.json) · [Preregistration](preregistration.md) · [Full replay](verify-run.json)`;
  const receipts = `[Start receipt](../_receipts/${id}.start.json) · [Process receipt](../_receipts/${id}.process.json) · [Request log](../_receipts/${id}.requests.jsonl)`;
  return [
    `# ${contrast ? '①g' : '①d'} ${name} experiment · no freeze evidence`,
    contrast ? `Run \`${id}\` in \`${mode}\` mode, ${identity}\n\nPolicy \`${policyVersion}\`. Planned route \`${typeof route === 'string' ? route : JSON.stringify(route)}\`. Reported providers appear in the call audit when observed.`
      : `Run \`${id}\` in \`${mode}\` mode, PID ${pid}, ${identity} · ${receipts}`,
    `## Adoption decision\n\n**${adopted ? `Adopt ${name} for this experiment.` : `Do not adopt ${name} on this evidence.`}**`,
    ...(mode !== 'real' ? ['Offline results are synthetic and never model evidence or adoption evidence.'] : []),
    ...(contrast || adopted ? [] : ['Qwen3 235B Instruct/Parasail is a prospective fallback. This report does not switch routes.']),
    contrast ? 'The locked sequence tests Qwen first and HY4-capped only if Qwen is not adopted. Each side uses one model and the same 18 locked samples, including the S1 extreme conditions. This is not freeze evidence. Next, rerun S1 and the directed retest with the final evaluation identity.'
      : 'After steps 2 and 3 are merged, rerun S1 and the perturbation retest with the final evaluation identity.',
    `- (a) ${label(gates.firstAttempts)}. ${firstAttempts.qualify}/${firstAttempts.planned} first requests were sent, had nonblank visible text within ${firstAttempts.deadlineMs} ms of request send, and ${firstRule} Retries cannot replace first requests.\n- (b) ${label(gates.s1Valid)}. ${s1.valid}/${s1.planned} compliant S1 verdicts; need ${adoption.minS1Valid}. The final valid retry can supply a verdict.\n- (c) ${label(gates.ratePasses)}. ${s1.ratePasses}/3 repetitions have all four bad conditions strictly below normal on applicable score rate.\n- (d) ${label(gates.targetPasses)}. Each target needs ${adoption.minTargetPasses}/3 strict hits: ${Object.entries(s1.targetHits).map(([condition, n]) => `${s1Targets[condition]} ${n}/3`).join(', ')}. Missing scores, ties, and N/A do not hit.\n- (e) ${label(gates.truthErrors)}. Definite construction errors: ${truthErrors} FP + FN combined; maximum ${adoption.maxTruthErrors}. Missing observations are separate, not zeros.`,
    `## S1 paired rates and target dimensions\n\n${paired}`,
    `## Construction truth and applicability\n\nOnly preregistered definite Yes or No bits enter the confusion matrix. Normal is not construction truth.\n\n${confusionTable}\n\nGate No means N/A. Each observed rate uses only known gate answers. Gate rates do not add adoption criteria.\n\n${gatesTable}`,
    `## Agreement\n\nAgreement is not correctness. v1 comparisons match the same condition and repetition, and use only 15 unchanged questions. V1, V2, A1, and A2 are excluded. Each denominator counts pairs with both answers, out of five planned pairs per repeat and 15 overall.\n\n${perQuestion}\n\nRepeat agreement matches the same condition across repeats. Each denominator counts conditions with all required observations, out of five planned conditions. N/A is a category for dimension agreement.\n\n### By question\n\n${consistency(repeatAgreement.questions)}\n\n### By dimension\n\n${consistency(repeatAgreement.dimensions)}`,
    `## First-request elapsed time\n\nElapsed includes failed requests with an observed duration. Median uses the middle value or the mean of the two middle values. p90 uses nearest rank. The S1 comparison uses ${elapsed.matchedS1.matched}/${s1.planned} matched condition/repetition pairs with both first-request durations. Missing durations and unstarted cells do not contribute to quantiles. The six old diagnostic attempts used 360 s and are not equivalent to the 180 s experiment.\n\n${latency}\n\n### Matched S1 attempts\n\n${matchedRows}\n\n### Historical diagnostic attempts\n\n${diagnosticRows}`,
    `## Requests and output allowance\n\n- Real requests / hard cap: ${usage.requests}/${usage.limits.maxAttempts}. This includes ${usage.retries} sent retries. Recorded attempts in this run: ${usage.attempts}.\n- Issued output token allowance / hard cap: ${usage.requestedOutputTokens}/${usage.limits.maxRequestedOutputTokens}. Allowance is not usage.\n- Provider-known tokens by field, with reporting counts: ${Object.entries(usage.provider).map(([key, sum]) => `${key} ${display(sum)} (${usage.knownByField[key]}/${usage.requests} requests)`).join(', ')}. ${usage.missingUsage}/${usage.requests} requests lack observed usage. Output uses the provider's reported output count, not a normalized zero placeholder.`,
    ...(contrast ? contrastAudit(analysis, verification?.budget ?? analysis.budget) : []),
    `## Cell audit in plan order\n\n${contrast ? 'Call IDs link to raw attempts when available. The first observation for each cell is its first attempt across all processes.' : 'Each call ID links to the raw attempt.'} A cell can have visible text but no compliant verdict.\n\n${firstTable}\n\n### Retry attempts\n\n${retries.length ? table([contrast ? 'Cell' : 'Cell / transcript', ...heads], retries.map(row => [contrast ? row.cellId : transcript(row.cellId), ...attemptRow(row)])) : 'No retries recorded.'}\n\n### Published answers\n\nEach #n refers to the linked transcript.\n\n${renderAnswers(cells, contrast)}`,
  ].join('\n\n') + '\n';
}

function contrastAudit({ cells, elapsed, usage, v1Contrast }, budget) {
  const refused = row => [row.finish_reason, row.failureKind].some(kind => ['content_filter', 'refusal', 'provider_refusal'].includes(kind));
  const kind = row => refused(row) ? 'explicit provider refusal / content filter' : outcomeKind(row) === 'timeout' ? 'timeout' : row.failureKind ?? 'no recorded failure';
  const counts = new Map();
  for (const cell of cells) {
    for (const [i, row] of cell.attempts.entries()) {
      if (!row.sent) continue;
      const category = kind(row);
      if (!counts.has(category)) counts.set(category, [0, 0]);
      counts.get(category)[i === 0 ? 0 : 1]++;
    }
  }
  const distribution = table(['Recorded outcome', 'Sent plan-firsts', 'Sent retries'],
    [...counts.keys()].sort().map(key => [key, ...counts.get(key)]));
  const matched = v1Contrast.filter(({ prior, current }) => typeof prior?.answer === 'boolean' && typeof current?.answer === 'boolean');
  const cited = matched.filter(({ prior, current }) => prior.answer && current.answer);
  const sameCitations = cited.filter(({ prior, current }) => answerText(prior) === answerText(current)).length;
  const changes = matched.filter(({ prior, current }) => answerText(prior) !== answerText(current));
  const contrasts = table(['S1 cell', 'Question', 'Historical v1', 'Current'], changes.map(({ id, question, prior, current }) =>
    [id, question, answerText(prior), answerText(current)]));
  const rejected = cells.flatMap(cell => cell.attempts.flatMap(row => row.rejectedAnswers ? [[cellLink(cell, true),
    row.attemptPath ? attemptLink(row) : row.callId, diag(row),
    questions.filter(question => row.rejectedAnswers[question]).map(question => `${question}=${answerText(row.rejectedAnswers[question])}`).join('; ')]] : []));
  const missing = cells.filter(cell => !cell.verdict);
  const reservedAttempts = `${display(budget?.attempts)}/${display(budget?.maxAttempts)}`;
  const reservedOutput = `${display(budget?.requestedOutputTokens)}/${display(budget?.maxRequestedOutputTokens)}`;
  return [
    `### Verified reservations and missingness\n\n- Reserved attempts / cap: ${reservedAttempts}. Reserved output token allowance / cap: ${reservedOutput}. Reservations can include unsent attempts.\n- ${usage.missingRequestLimits}/${usage.requests} real sends lack an observed allowance and are not included in the issued allowance sum.\n- ${elapsed.batch.sent - elapsed.batch.measured}/${elapsed.batch.sent} sent plan-firsts lack elapsed time. ${elapsed.batch.planned - elapsed.batch.sent}/${elapsed.batch.planned} plan-firsts were not sent or had no send evidence.\n- Missing compliant verdicts (${missing.length}/${elapsed.batch.planned}): ${missing.map(cell => cell.id).join(', ') || 'none'}.`,
    `## Refusal distribution\n\nOnly explicit provider refusal or content-filter telemetry counts as refusal. Generic failures and absent telemetry do not establish refusal.\n\n${distribution}`,
    `## Unchanged v1 bits and citations\n\n${matched.length}/${v1Contrast.length} locked question pairs have both bits. ${sameCitations}/${cited.length} matched Yes/Yes pairs use the same citation slots and message numbers. Differences below are descriptive. V1, V2, A1 and A2 are excluded.\n\n${changes.length ? contrasts : 'No differences among observed pairs.'}`,
    `## Rejected raw answers\n\nThe following citations were extractable from rejected responses. They did not count as verdicts or enter agreement.\n\n${rejected.length ? table(['Cell / transcript', 'Raw attempt', 'Rejection', 'Extracted answers and citations'], rejected) : 'No rejected citations available.'}`,
  ];
}
