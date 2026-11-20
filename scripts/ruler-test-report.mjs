import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { targets } from '../config/e2.mjs';
import { policy, rounds } from '../config/e1.mjs';
import { runId } from '../contracts/artifacts/schema.mjs';
import { executionSuccess, hash, infraFailure, message, nonblank, record, requireThat } from '../contracts/core/schema.mjs';
import { loadRulerSplit, testPlan } from '../contracts/dataset/ruler-expand.mjs';
import { bind, dimensions, directDimension, parseNumberedJudgement } from '../contracts/judge/schema.mjs';
import { verifyRun } from '../src/run-receipts.mjs';

const scenario = 'ruler-expand';
const conditions = Object.keys(targets);
const draws = 2000;
const thresholds = { valid: 0.9, hits: 0.8, minimumDelta: 1 };
const outputs = { report: 'test-report.md', calculations: 'test-calculations.json', auditDraft: 'test-audit-draft.json' };
const freezeUrl = new URL('../contracts/judge/ruler-freeze.json', import.meta.url);
const pathOf = ({ taskId, condition }) => `${taskId}/${condition}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const whole = x => Number.isSafeInteger(x) && x >= 0;
const positive = x => whole(x) && x > 0;
const levels = [0, 1, 2];
const coord = ({ taskId, condition }) => ({ taskId, condition });
const callCoord = ({ role, turn, call, attempt, attemptPath }) => ({ role, turn, call, attempt, attemptPath });
const fieldsMatch = (row, expected, label) => {
  for (const [field, value] of Object.entries(expected)) requireThat(same(row?.[field], value), `${label}: ${field} mismatch`);
};
function json(path, bytes = readFileSync(path)) {
  try { return JSON.parse(bytes); }
  catch (error) { throw new Error(`${path}: invalid JSON (${error.message})`); }
}

function index(rows, expected, label) {
  requireThat(Array.isArray(rows), `${label}: expected an array`);
  const indexed = new Map();
  for (const row of rows) {
    requireThat(record(row), `${label}: expected an object`);
    const key = pathOf(row);
    requireThat(expected.has(key) && !indexed.has(key), `${label}: unplanned or duplicate ${key}`);
    indexed.set(key, row);
  }
  return indexed;
}

function loadRun(root, id) {
  const dir = join(root, id);
  const receiptPath = suffix => join(root, '_receipts', `${id}${suffix}`);
  const verification = verifyRun(root, id);
  requireThat(verification.verified, `--verify-run ${id}: ${[...verification.missing, ...verification.invalid].join('; ')}`);
  const start = json(receiptPath('.start.json'));
  const process = json(receiptPath('.process.json'));
  const anchored = (path, digest) => {
    const bytes = readFileSync(path);
    requireThat(hash(bytes) === digest, `${path}: digest differs from receipt`);
    return json(path, bytes);
  };
  requireThat(hash(start) === process.startHash, 'start receipt differs from process digest');
  const evaluation = anchored(receiptPath('.json'), process.evaluationSha256);
  const manifest = anchored(join(dir, 'manifest.json'), evaluation.manifestSha256);
  const result = anchored(join(dir, 'result.json'), evaluation.resultSha256);
  const header = { id, scenario, phase: 'test', mode: 'real' };
  for (const [label, value] of Object.entries({ evaluation, manifest, result })) fieldsMatch(value, header, label);
  fieldsMatch(start, { clean: true, mode: 'real' }, 'startup');
  fieldsMatch(start.parameters?.values, { scenario, phase: 'test', mode: 'real' }, 'startup parameters');
  requireThat(start.parameters?.flags?.includes('--confirm-cost') && !process.error && typeof result.acceptance === 'boolean', 'missing cost confirmation or completed evaluation');
  fieldsMatch(manifest.writer, { pid: start.pid, startedAt: start.startedAt }, 'manifest writer');
  fieldsMatch(manifest.checkReceipt, { head: start.head, command: 'npm run check', status: 'passed' }, 'manifest check receipt');
  requireThat(positive(manifest.checkReceipt.passed) && Date.parse(manifest.checkReceipt.checkedAt) <= Date.parse(start.startedAt), 'invalid check receipt count or timestamp');
  fieldsMatch(process, { acceptance: result.acceptance, exitCode: result.acceptance ? 0 : 1 }, 'process receipt');
  const { identity, identityId, limits, budget } = manifest;
  requireThat(record(identity) && identityId === hash({ mode: 'real', scenario, identity }) && identityId === evaluation.identityId, 'evaluation identity mismatch');
  fieldsMatch(identity, { phase: 'test', planned: manifest.planned, limits }, 'test identity');
  requireThat(positive(identity.maxFailures) && identity.maxFailures <= 25, 'invalid registered test failure limit');
  requireThat(positive(limits?.maxAttempts) && positive(limits.maxRequestedOutputTokens) && [budget?.typicalCalls, budget?.maxCalls, budget?.maxOutputTokens].every(positive) && budget.maxCalls >= limits.maxAttempts && budget.maxOutputTokens >= limits.maxRequestedOutputTokens, 'invalid budget or limits');
  requireThat(Number(start.parameters.values.max_attempts ?? budget.maxCalls) === limits.maxAttempts && Number(start.parameters.values.max_requested_output_tokens ?? budget.maxOutputTokens) === limits.maxRequestedOutputTokens, 'startup limits mismatch');

  const freezeBytes = readFileSync(freezeUrl);
  const freeze = json(freezeUrl, freezeBytes);
  fieldsMatch(identity.freeze, { ...freeze, recordSha256: hash(freezeBytes) }, 'frozen record');
  requireThat(identityId !== freeze.training.identityId, 'test identity reuses training identity');
  const { policyVersion, judgeRoute, sources, ...frozenFields } = freeze.identity;
  fieldsMatch(identity, frozenFields, 'frozen identity');
  fieldsMatch(identity.policy, { version: policyVersion }, 'frozen policy');
  fieldsMatch(identity, { policy }, 'frozen configuration');
  fieldsMatch(identity.routes?.judge, judgeRoute, 'frozen judge route');
  fieldsMatch(identity.sources, sources, 'frozen sources');
  fieldsMatch(identity.sources, { 'contracts/judge/ruler-freeze.json': hash(freezeBytes) }, 'frozen record source');
  for (const [path, digest] of Object.entries(sources)) {
    requireThat(hash(readFileSync(new URL(`../${path}`, import.meta.url))) === digest, `local frozen source mismatch: ${path}`);
  }
  const split = loadRulerSplit();
  const splitSha256 = hash(readFileSync(new URL('../data/ruler-expand-v1.json', import.meta.url)));
  fieldsMatch(freeze, { testSha256: split.testSha256, splitSha256 }, 'frozen test dataset');
  fieldsMatch(identity.dataset, { seed: split.seed, testSha256: split.testSha256, splitSha256 }, 'identity test dataset');
  fieldsMatch(identity.sentinel, { trials: 4, minValid: 3 }, 'identity N sentinel');
  const families = split.test.map((taskId, i) => ({ taskId, ...split.items[taskId], condition: conditions[i % conditions.length] }));
  const expected = new Set(families.flatMap(pair => [pathOf({ ...pair, condition: 'normal' }), pathOf(pair)]));
  const planned = index(manifest.planned, expected, 'manifest plan');
  requireThat(planned.size === expected.size && same(manifest.planned, testPlan(split)), 'manifest plan does not match the ordered 50 locked cells');
  const cells = index(result.cells, expected, 'result cells');
  requireThat(same(result.cells.map(coord), manifest.planned.slice(0, cells.size)), 'result cells are not a prefix of the ordered test plan');
  const frozen = index(evaluation.frozen, expected, 'frozen transcripts');
  const graded = index(evaluation.graded, expected, 'graded judgements');
  for (const [key, artifact] of frozen) requireThat(cells.has(key) && artifact.path === `${key}/transcript.json`, `unexpected transcript receipt: ${key}`);
  for (const [key, artifact] of graded) requireThat(frozen.has(key) && artifact.path === `${key}/judge.json` && cells.get(key)?.validTotal === true, `unexpected judge receipt: ${key}`);
  for (const [key, cell] of cells) {
    fieldsMatch(cell, { id: cell.condition, recorded: true }, key);
    if (cell.status === executionSuccess) {
      fieldsMatch(cell, { scored: true, validTotal: true }, key);
      requireThat(!cell.failure && graded.has(key), `successful cell has no anchored judge receipt: ${key}`);
    } else {
      fieldsMatch(cell, { status: infraFailure, scored: false, validTotal: false, total: null }, key);
      requireThat(cell.failure?.status === infraFailure && nonblank(cell.failure.kind), `failed cell has no failure coordinates: ${key}`);
    }
  }
  const n = families.filter(row => row.condition === 'no_teach');
  const sentinelCells = n.slice(0, 4).map(row => cells.get(pathOf(row)));
  const { sentinel, stop } = result;
  const sentinelValid = sentinelCells.filter(row => row?.validTotal).length;
  fieldsMatch(sentinel, { planned: 4, attempted: sentinelCells.filter(Boolean).length, valid: sentinelValid }, 'N sentinel');
  requireThat([null, 'failure_limit', 'budget_exhausted'].includes(stop) && ['passed', 'insufficient_scores', 'insufficient_budget', 'not_reached'].includes(sentinel.status), 'invalid stop or N sentinel state');
  requireThat(sentinel.status === 'not_reached' ? sentinel.attempted < 4 : sentinel.attempted === 4 && (sentinelValid < 3) === (sentinel.status === 'insufficient_scores'), 'N sentinel score rule mismatch');
  requireThat(sentinel.status === 'passed' || n.slice(4).every(row => !cells.has(pathOf(row))), 'N ran beyond a sentinel that did not pass');
  const lastFailure = result.cells.at(-1)?.failure;
  const failedTasks = new Set(result.cells.filter(row => row.status === infraFailure).map(row => row.taskId));
  const expectedStop = failedTasks.size >= identity.maxFailures ? 'failure_limit' : lastFailure?.kind === 'budget_exhausted' ? 'budget_exhausted' : null;
  requireThat(stop === expectedStop && (cells.size === expected.size || stop || ['insufficient_scores', 'insufficient_budget'].includes(sentinel.status)), 'partial result has no matching stop or sentinel reason');
  requireThat(result.acceptance === (cells.size === expected.size && [...cells.values()].every(row => row.validTotal) && stop === null && sentinel.status === 'passed'), 'machine acceptance contradicts result completeness');

  const requests = readFileSync(receiptPath('.requests.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.type === 'request_start');
  requireThat(requests.length === process.requestCount, 'request count differs from process receipt');
  return { root, dir, id, start, verification, evaluation, manifest, result, freeze, split, families, cells, frozen, graded, requests };
}

function readEvidence(run) {
  const cases = new Map(), issues = [], attempts = new Map();
  const failure = (key, path, detail) => issues.push({ cell: key, path, detail });
  const { dir, id, start, freeze, cells, frozen, graded, requests, manifest } = run;
  const expected = new Set(run.manifest.planned.map(pathOf));
  for (const entry of readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^S0-\d+$/.test(entry.name))) {
    for (const name of readdirSync(join(dir, entry.name), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      const key = `${entry.name}/${name.name}`;
      if (!expected.has(key)) failure(key, `${key}/telemetry.json`, 'unplanned cell directory');
    }
  }
  for (const cell of run.manifest.planned) {
    const key = pathOf(cell);
    const transcript = `${key}/transcript.json`, judge = `${key}/judge.json`, telemetry = `${key}/telemetry.json`;
    const info = { ...cell, transcript, judge, telemetry, result: cells.get(key) ?? null, messages: [], scores: null, total: null, judgeAttempt: null };
    cases.set(key, info);
    let problemPath = transcript;
    try {
      if (existsSync(join(dir, transcript))) {
        const bytes = readFileSync(join(dir, transcript));
        const messages = json(transcript, bytes);
        const anchor = frozen.get(key);
        requireThat(Array.isArray(messages) && messages.length <= 2 * rounds + 1, 'invalid public transcript length');
        for (const [i, m] of messages.entries()) {
          fieldsMatch(m, { id: `${id}:${cell.taskId}:${cell.condition}:m:${i + 1}`, role: i % 2 ? 'teacher' : 'learner', turn: Math.ceil(i / 2) }, `public message ${i + 1}`);
          message(m.id, m.role, m.turn, m.text);
        }
        if (anchor) {
          requireThat(anchor.transcriptSha256 === hash(bytes) && messages.length === 2 * rounds + 1, 'frozen transcript digest or message count mismatch');
          fieldsMatch(anchor, { messageIds: messages.map(m => m.id) }, 'frozen transcript binding');
        }
        info.messages = messages;
      } else requireThat(!frozen.has(key), 'anchored transcript not found');
      if (graded.has(key)) {
        problemPath = judge;
        const bytes = readFileSync(join(dir, judge));
        const artifact = json(judge, bytes);
        requireThat(graded.get(key).sha256 === hash(bytes) && info.messages.length, 'anchored judge digest or transcript mismatch');
        const view = bind(info.messages);
        const binding = { ...coord(cell), runId: id, cell: cell.condition, ruler: freeze.identity.ruler, viewHash: view.id, messageIds: info.messages.map(m => m.id) };
        fieldsMatch(artifact.binding, { ...binding, role: 'judge', turn: rounds, call: 1 }, 'judge binding');
        const { attempt } = artifact.binding;
        requireThat(positive(attempt) && attempt <= policy.retries + 1, 'invalid judge binding attempt');
        const rawPath = `${key}/calls/judge-${rounds}-1-${attempt}.json`;
        fieldsMatch(artifact.binding, { attemptPath: rawPath }, 'judge binding');
        info.judgeAttempt = rawPath;
        problemPath = rawPath;
        const raw = json(join(dir, rawPath));
        fieldsMatch(raw, { ...coord(cell), role: 'judge', turn: rounds, call: 1, attempt }, 'raw judge call');
        fieldsMatch(raw.binding, binding, 'raw judge binding');
        const prompt = JSON.parse(raw.context?.messages?.at(-1)?.content);
        fieldsMatch(prompt, { messages: info.messages.map(({ role, text }, i) => ({ n: i + 1, role, text })) }, 'raw judge prompt');
        requireThat(raw.response?.stopReason === 'stop' && Array.isArray(raw.response.content) && !raw.response.content.some(b => b.type === 'toolCall'), 'raw judge response did not terminate normally');
        const text = raw.response.content.filter(b => b.type === 'text').map(b => b.text).join('');
        requireThat(nonblank(text), 'raw judge response has no visible text');
        const scores = parseNumberedJudgement(text, view);
        problemPath = judge;
        const groups = { teaching: Object.fromEntries(dimensions.slice(0, 4).map(d => [d, scores[d]])), consolidation: Object.fromEntries(dimensions.slice(4).map(d => [d, scores[d]])) };
        requireThat(same(groups, artifact.groups) && dimensions.every(d => levels.includes(scores[d].score)), 'parsed judge receipt differs from raw replay');
        const total = dimensions.reduce((sum, d) => sum + scores[d].score, 0);
        fieldsMatch(info.result, { total, directAnswer: scores[directDimension].score }, 'result score');
        info.scores = scores;
        info.total = total;
      }
    } catch (error) { failure(key, problemPath, error.message); }

    if (!existsSync(join(dir, telemetry))) {
      if (info.result) failure(key, telemetry, 'recorded cell has no telemetry file');
      info.scores = null;
      info.total = null;
      continue;
    }
    try {
      const rows = json(join(dir, telemetry));
      requireThat(Array.isArray(rows), 'expected telemetry array');
      for (const row of rows) {
        const callId = `${cell.taskId}:${cell.condition}:${row?.role}:${row?.turn}:${row?.call}:${row?.attempt}`;
        const canonicalPath = `${key}/calls/${row?.role}-${row?.turn}-${row?.call}-${row?.attempt}.json`;
        if (row?.pid !== start.pid) failure(key, telemetry, `PID mismatch at ${callId}: expected ${start.pid}, received ${row?.pid}`);
        if (!['teacher', 'learner', 'judge'].includes(row?.role) || ![row?.turn, row?.call, row?.attempt].every(positive) || row.turn > rounds || row.attempt > policy.retries + 1 || row.taskId !== cell.taskId || row.condition !== cell.condition || row.attemptPath !== canonicalPath || attempts.has(callId)) {
          failure(key, telemetry, `malformed or duplicate call coordinate: ${callId}`);
          continue;
        }
        attempts.set(callId, row);
      }
    } catch (error) { failure(key, telemetry, error.message); }
    if (info.scores) {
      const row = [...attempts.values()].find(row => row.attemptPath === info.judgeAttempt);
      const route = freeze.identity.judgeRoute;
      if (!row || row.pid !== start.pid || row.failureKind !== null || row.model !== route.id || row.provider !== route.provider || row.judgementMode !== route.responseFormat || row.policyVersion !== freeze.identity.policyVersion || row.binding?.viewHash !== bind(info.messages).id) {
        failure(key, telemetry, `successful frozen judge attempt not confirmed: ${info.judgeAttempt}`);
        info.scores = null;
        info.total = null;
      }
    }
  }

  const usageFields = ['input', 'cacheRead', 'cacheWrite', 'output', 'totalTokens'];
  const counter = () => ({ requests: 0, requestedOutputTokens: 0, unknownRequestLimit: 0, reportedUsage: 0, unknownUsage: 0, retries: 0, localTimeouts: 0, reasoningOverages: 0, unknownReasoning: 0, reportedReasoningTokens: 0, measuredTimeCalls: 0, elapsedMs: null, usage: Object.fromEntries(usageFields.map(field => [field, 0])) });
  const telemetry = { ...counter(), pid: start.pid, wallMs: Date.parse(run.verification.endedAt) - Date.parse(start.startedAt), telemetryRows: attempts.size, byRole: Object.fromEntries(['teacher', 'learner', 'judge'].map(role => [role, counter()])), failures: [], overages: [], unloggedAttempts: [] };
  const seen = new Set();
  for (const request of requests) {
    const row = attempts.get(request.callId);
    const requestLimit = positive(row?.requestLimit) ? row.requestLimit : null;
    const knownUsage = usageFields.every(field => whole(row?.usage?.[field]));
    const duplicate = seen.has(request.callId);
    const overage = whole(row?.reasoningTokens) && positive(row?.reasoningLimit) && row.reasoningTokens > row.reasoningLimit;
    if (!row || duplicate || requestLimit === null) failure(null, `../_receipts/${id}.requests.jsonl`, `${request.requestId}: ${!row ? 'missing telemetry' : duplicate ? 'multiple requests at one telemetry coordinate' : 'missing requested output cap'}`);
    seen.add(request.callId);
    for (const out of [telemetry, telemetry.byRole[row?.role]].filter(Boolean)) {
      out.requests++;
      out.requestedOutputTokens += requestLimit ?? 0;
      out.unknownRequestLimit += Number(requestLimit === null);
      out.reportedUsage += Number(knownUsage && !duplicate);
      out.unknownUsage += Number(!knownUsage || duplicate);
      out.retries += Number(row?.attempt > 1);
      out.localTimeouts += Number(!duplicate && row?.detail === 'local request timeout');
      out.reasoningOverages += Number(!duplicate && overage);
      out.unknownReasoning += Number(row?.role === 'judge' && (!whole(row.reasoningTokens) || !positive(row.reasoningLimit) || duplicate));
      if (!duplicate && whole(row?.reasoningTokens)) out.reportedReasoningTokens += row.reasoningTokens;
      if (!duplicate && whole(row?.elapsedMs)) {
        out.measuredTimeCalls++;
        out.elapsedMs = (out.elapsedMs ?? 0) + row.elapsedMs;
      }
      if (!duplicate && knownUsage) for (const field of usageFields) out.usage[field] += row.usage[field];
    }
    if (!duplicate && overage) telemetry.overages.push({ ...coord(row), ...callCoord(row), limit: row.reasoningLimit, reported: row.reasoningTokens });
  }
  for (const [callId, row] of attempts) {
    if (!seen.has(callId)) {
      telemetry.unloggedAttempts.push({ ...coord(row), ...callCoord(row), kind: row.failureKind, detail: row.detail });
      if (!row.failureKind) failure(pathOf(row), row.attemptPath, 'successful telemetry call missing request log entry');
    }
    if (row.failureKind) telemetry.failures.push({ ...coord(row), ...callCoord(row), kind: row.failureKind, detail: row.detail });
  }
  if (requests.length > manifest.limits.maxAttempts || telemetry.requestedOutputTokens > manifest.limits.maxRequestedOutputTokens) failure(null, 'manifest.json', 'observed requests exceeded the registered limit');
  for (const out of [telemetry, ...Object.values(telemetry.byRole)]) if (!out.reportedUsage) out.usage = null;
  return { cases, issues, telemetry };
}

function readAudits(path, identity, families, cases) {
  const reads = new Map();
  if (!path) return { reads, reviewer: null, sha256: null };
  const bytes = readFileSync(path);
  const audit = json(path, bytes);
  fieldsMatch(audit, identity, 'audit identity');
  requireThat(nonblank(audit.reviewer) && Array.isArray(audit.rows), 'audit needs reviewer and rows');
  const taskConditions = new Map(families.map(({ taskId, condition }) => [taskId, condition]));
  for (const row of audit.rows) {
    requireThat(record(row) && taskConditions.has(row.taskId) && taskConditions.get(row.taskId) === row.condition && dimensions.includes(row.dimension), 'audit row has unplanned task, condition, or dimension');
    const { taskId, condition, dimension } = row;
    const key = `${taskId}/${condition}/${dimension}`;
    requireThat(!reads.has(key), `audit duplicate row ${key}`);
    const sides = [['normal', 'normal'], ['bad', condition]];
    for (const [side, actual] of sides) {
      const review = row[side];
      const info = cases.get(`${taskId}/${actual}`);
      const label = `audit ${key} ${side}`;
      requireThat(record(review) && ['yes', 'no', 'unknown'].includes(review.opportunity) && ['supported', 'unsupported', 'unknown'].includes(review.support) && nonblank(review.note), `${label} needs an opportunity, support decision, and note`);
      const available = new Set(info.messages.map(m => m.id));
      const refs = review.messageIds;
      requireThat(Array.isArray(refs) && new Set(refs).size === refs.length && refs.every(id => available.has(id)) && (refs.length > 0 || review.opportunity === 'unknown' && review.support === 'unknown'), `${label} invalid or missing message ID`);
      if (review.support === 'supported') requireThat(refs.some(id => info.scores?.[dimension].evidence.includes(id)), `${label} supported score needs a cited judge binding message ID`);
    }
    reads.set(key, { normal: row.normal, bad: row.bad });
  }
  return { reads, reviewer: audit.reviewer, sha256: hash(bytes) };
}

function dimensionSide(info, dimension, review) {
  const rating = info.scores?.[dimension];
  const slotStates = rating?.evidence_groups.flatMap(group => Object.values(group.slots).map(slot => slot.state)) ?? [];
  const machineOpportunity = slotStates.length && slotStates.every(state => state === 'not_applicable') ? 'no' : 'unknown';
  return {
    condition: info.condition, score: rating?.score ?? null, total: info.total, bound: Boolean(rating),
    opportunity: review?.opportunity ?? machineOpportunity, machineOpportunity,
    support: review?.support ?? 'unknown', review: review ?? null,
    judgeMessageIds: rating?.evidence ?? [], judgeReason: rating?.reason ?? null,
    messageIds: info.messages.map(m => m.id),
    links: { transcript: info.messages.length ? info.transcript : null, judge: rating ? info.judge : null, attempt: info.judgeAttempt, telemetry: info.result ? info.telemetry : null },
    status: info.result?.status ?? 'not_run', failure: info.result?.failure ?? null,
  };
}

function makePairs(run, cases, audit) {
  return run.families.map(meta => {
    const { taskId, condition } = meta;
    const normal = cases.get(`${taskId}/normal`), bad = cases.get(`${taskId}/${condition}`);
    const byDimension = Object.fromEntries(dimensions.map(dimension => {
      const review = audit.reads.get(`${taskId}/${condition}/${dimension}`);
      return [dimension, { normal: dimensionSide(normal, dimension, review?.normal), bad: dimensionSide(bad, dimension, review?.bad) }];
    }));
    const dimension = targets[condition];
    const target = byDimension[dimension];
    const sides = [target.normal, target.bad];
    const delta = sides.every(side => side.bound) ? target.normal.score - target.bad.score : null;
    const totalDelta = Number.isInteger(normal.total) && Number.isInteger(bad.total) ? normal.total - bad.total : null;
    const opportunity = sides.every(side => side.opportunity === 'yes') ? 'yes' : sides.some(side => side.opportunity === 'no') ? 'no' : 'unknown';
    const evidence = sides.some(side => side.support === 'unsupported') ? 'unsupported' : sides.every(side => side.support === 'supported') ? 'supported' : 'unknown';
    const status = delta === null ? 'missingScore' : opportunity === 'no' ? 'noOpportunity' : opportunity === 'unknown' ? 'unknownOpportunity' : evidence === 'unknown' ? 'unknownEvidence' : evidence === 'unsupported' ? 'unsupportedEvidence' : 'eligible';
    return { ...meta, dimension, normal: target.normal, bad: target.bad, targetDelta: delta, totalDelta, status, opportunity, evidence, byDimension,
      auditHash: hash(`${run.split.seed}:audit:${condition}:${taskId}`),
      needsOpportunityAudit: delta !== null && sides.some(side => side.opportunity === 'unknown' && !side.review) };
  });
}

const rate = (hits, n) => n ? hits / n : null;
function wilson(hits, n) {
  if (!n) return null;
  const p = hits / n, z = 1.959963984540054, zz = z ** 2;
  const center = (p + zz / (2 * n)) / (1 + zz / n);
  const offset = z * Math.sqrt(p * (1 - p) / n + zz / (4 * n ** 2)) / (1 + zz / n);
  return [hits === 0 ? 0 : Math.max(0, center - offset), hits === n ? 1 : Math.min(1, center + offset)];
}

function describe(values) {
  const n = values.length;
  const mean = n ? values.reduce((sum, v) => sum + v, 0) / n : null;
  return { n, mean, variance: n > 1 ? values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1) : null };
}

function counts(rows) {
  const planned = rows.length;
  const scored = rows.filter(row => row.totalDelta !== null);
  const rawHits = scored.filter(row => row.totalDelta > 0).length;
  const eligible = rows.filter(row => row.status === 'eligible');
  const hits = eligible.filter(row => row.targetDelta >= thresholds.minimumDelta).length;
  const count = (items, label) => items.filter(row => row.status === label).length;
  return { total: {
    planned, scored: scored.length, hits: rawHits, ties: scored.filter(row => row.totalDelta === 0).length,
    reversals: scored.filter(row => row.totalDelta < 0).length, missingScore: planned - scored.length,
    plannedRate: rate(rawHits, planned), scoredRate: rate(rawHits, scored.length), plannedWilson95: wilson(rawHits, planned), scoredWilson95: wilson(rawHits, scored.length),
  }, target: {
    planned, eligible: eligible.length, hits, ties: eligible.filter(row => row.targetDelta === 0).length, reversals: eligible.filter(row => row.targetDelta < 0).length,
    numericHits: rows.filter(row => row.targetDelta !== null && row.targetDelta >= thresholds.minimumDelta).length,
    missingScore: count(rows, 'missingScore'), noOpportunity: count(rows, 'noOpportunity'), unknownOpportunity: count(rows, 'unknownOpportunity'),
    unknownEvidence: count(rows, 'unknownEvidence'), unsupportedEvidence: count(rows, 'unsupportedEvidence'),
    plannedRate: rate(hits, planned), eligibleRate: rate(hits, eligible.length), validRate: rate(eligible.length, planned),
    plannedWilson95: wilson(hits, planned), eligibleWilson95: wilson(hits, eligible.length), validWilson95: wilson(eligible.length, planned),
    delta: describe(eligible.map(row => row.targetDelta)),
  } };
}

const dimensionsByCondition = ['normal', ...conditions];
function sidesFor(rows, condition, dimension) {
  return condition === 'normal' ? rows.map(row => row.byDimension[dimension].normal) : rows.filter(row => row.condition === condition).map(row => row.byDimension[dimension].bad);
}
function scoreValues(sides) { return sides.filter(side => side.score !== null).map(side => side.score); }
function distributions(rows) {
  return Object.fromEntries(dimensionsByCondition.map(condition => [condition, Object.fromEntries(dimensions.map(dimension => {
    const sides = sidesFor(rows, condition, dimension);
    const values = scoreValues(sides);
    return [dimension, { planned: sides.length, levels: levels.map(level => values.filter(value => value === level).length),
      missing: sides.length - values.length, noOpportunity: sides.filter(side => side.score !== null && side.opportunity === 'no').length,
      unknownOpportunity: sides.filter(side => side.score !== null && side.opportunity === 'unknown').length, ...describe(values) }];
  }))]));
}

function bootstrap(rows, seed) {
  const strata = new Map();
  for (const row of rows) {
    if (!strata.has(row.subject)) strata.set(row.subject, new Map());
    const clusters = strata.get(row.subject);
    if (!clusters.has(row.family)) clusters.set(row.family, []);
    clusters.get(row.family).push(row);
  }
  const groups = [...strata].sort(([a], [b]) => a < b ? -1 : 1).map(([subject, clusters]) => [subject, [...clusters].sort(([a], [b]) => a < b ? -1 : 1).map(([, rows]) => rows)]);
  const estimates = new Map();
  const add = (key, value) => {
    if (!estimates.has(key)) estimates.set(key, []);
    if (value !== null) estimates.get(key).push(value);
  };
  for (let i = 0; i < draws; i++) {
    const sample = groups.flatMap(([subject, clusters]) => clusters.flatMap((_, j) => {
      const u = parseInt(hash(`${seed}:ci:${i}:${subject}:${j}`).slice(0, 8), 16) / 2 ** 32;
      return clusters[Math.floor(u * clusters.length)];
    }));
    for (const condition of conditions) {
      const { total, target } = counts(sample.filter(row => row.condition === condition));
      for (const metric of ['plannedRate', 'scoredRate']) add(`${condition}/total/${metric}`, total[metric]);
      for (const metric of ['plannedRate', 'eligibleRate', 'validRate']) add(`${condition}/target/${metric}`, target[metric]);
      add(`${condition}/target/deltaMean`, target.delta.mean);
    }
    for (const condition of dimensionsByCondition) for (const dimension of dimensions) {
      add(`${condition}/${dimension}`, describe(scoreValues(sidesFor(sample, condition, dimension))).mean);
    }
  }
  return key => {
    const values = estimates.get(key).sort((a, b) => a - b);
    const at = p => {
      const index = p * (values.length - 1), lo = Math.floor(index), hi = Math.ceil(index);
      return values[lo] + (values[hi] - values[lo]) * (index - lo);
    };
    return { interval: values.length ? [at(0.025), at(0.975)] : null, definedDraws: values.length };
  };
}

function calculate(run, evidence, audit, rows) {
  const interval = bootstrap(rows, run.split.seed);
  const tallies = distributions(rows);
  for (const condition of dimensionsByCondition) for (const dimension of dimensions) {
    tallies[condition][dimension].meanBootstrap95 = interval(`${condition}/${dimension}`);
  }
  const subjects = Object.fromEntries([...new Set(rows.map(row => row.subject))].sort().map(subject => {
    const inSubject = rows.filter(row => row.subject === subject);
    return [subject, { questions: inSubject.length, families: new Set(inSubject.map(row => row.family)).size, conditions: Object.fromEntries(conditions.map(condition => {
      const paired = inSubject.filter(row => row.condition === condition);
      const { total, target } = counts(paired);
      return [condition, { planned: target.planned, scored: total.scored, eligible: target.eligible, hits: target.hits }];
    })) }];
  }));
  const groups = Object.fromEntries(conditions.map(condition => {
    const pairs = rows.filter(row => row.condition === condition);
    const { total, target } = counts(pairs);
    for (const [name, value, metrics] of [['total', total, ['plannedRate', 'scoredRate']], ['target', target, ['plannedRate', 'eligibleRate', 'validRate', 'deltaMean']]]) {
      value.bootstrap95 = Object.fromEntries(metrics.map(metric => [metric, interval(`${condition}/${name}/${metric}`)]));
    }
    const ranked = pairs.filter(row => row.targetDelta !== null && row.targetDelta >= thresholds.minimumDelta).sort((a, b) => a.auditHash < b.auditHash ? -1 : 1);
    const sampled = ranked.filter(row => row.opportunity === 'yes').slice(0, 2);
    const auditIncomplete = !audit.reviewer || pairs.some(row => row.needsOpportunityAudit);
    const auditRejected = sampled.some(row => row.evidence !== 'supported');
    const pending = auditIncomplete || auditRejected || condition === 'no_teach' && run.result.sentinel.status !== 'passed';
    const meetsThresholds = target.validRate >= thresholds.valid && target.plannedRate >= thresholds.hits;
    return [condition, { dimension: targets[condition], total, target, meetsThresholds, verdict: pending ? 'pending' : meetsThresholds ? 'passed' : 'failed',
      audit: { sampled: sampled.map(row => row.taskId), provisionalSample: ranked.filter(row => row.opportunity !== 'no').slice(0, 2).map(row => row.taskId),
        rankedDirectionHits: ranked.map(row => ({ taskId: row.taskId, sha256: row.auditHash })),
        unknownOpportunity: pairs.filter(row => row.status === 'unknownOpportunity').map(row => row.taskId), incomplete: auditIncomplete, rejected: auditRejected } }];
  }));
  const verdicts = Object.values(groups).map(group => group.verdict);
  const numericShortfall = conditions.filter(condition => {
    const { planned, missingScore, numericHits } = groups[condition].target;
    return missingScore === 0 && numericHits / planned < thresholds.hits;
  });
  const statisticalVerdict = evidence.issues.length ? 'pending' : numericShortfall.length ? 'failed'
    : verdicts.includes('pending') ? 'pending' : verdicts.includes('failed') ? 'failed' : 'passed';
  return { machineAcceptance: run.result.acceptance, statisticalVerdict, numericShortfall, thresholds, stop: run.result.stop, sentinel: run.result.sentinel,
    verification: run.verification, budget: run.manifest.budget, limits: run.manifest.limits, maxFailures: run.manifest.identity.maxFailures, freeze: run.manifest.identity.freeze,
    telemetry: evidence.telemetry, issues: evidence.issues, audit: { reviewer: audit.reviewer, sha256: audit.sha256 },
    bootstrap: { draws, seed: `${run.split.seed}:ci`, method: 'subject-stratified whole families, percentile 2.5% and 97.5% with linear interpolation; undefined draws omitted' },
    subjects, groups, distributions: tallies, rows };
}

const fmt = x => x === null || x === undefined ? '—' : typeof x !== 'number' || Number.isInteger(x) ? String(x) : x.toFixed(3);
const fraction = (hits, n) => `${hits}/${n} (${n ? `${(100 * hits / n).toFixed(1)}%` : '—'})`;
const ci = bounds => bounds ? `[${bounds.map(fmt).join(', ')}]` : '—';
const boot = value => `${ci(value.interval)} (${value.definedDraws}/${draws})`;
const md = x => String(x).replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');
const link = (label, path) => path ? `[${md(label)}](${path})` : '—';
const table = (columns, rows) => [columns, columns.map(() => '---'), ...rows].map(row => `| ${row.map(md).join(' | ')} |`).join('\n');
const option = value => JSON.stringify(value.replaceAll('\\', '/'));

function render(calc, run, auditPath) {
  const { id } = run;
  const receipt = suffix => `../_receipts/${id}${suffix}`;
  const { machineAcceptance, statisticalVerdict, sentinel, stop, groups, distributions, subjects, telemetry } = calc;
  const verdict = { passed: '通过', failed: '未通过', pending: '待定' };
  const labels = { eligible: '可判定', missingScore: '缺分', noOpportunity: '无机会', unknownOpportunity: '机会不明', unknownEvidence: '证据未确认', unsupportedEvidence: '证据不支持' };
  const callFailure = side => side.failure ? `${side.failure.kind} (${[side.failure.role, side.failure.turn, side.failure.call, side.failure.attempt].map(fmt).join('/')}): ${side.failure.detail ?? ''} ${link('末次原件', side.failure.attemptPath)}` : side.status === 'not_run' ? '未运行' : side.score === null ? '评分未通过报告复核' : '';
  const transfer = groups.sycophant_close.target;
  const shortfall = calc.numericShortfall.map(condition => {
    const { numericHits, planned } = groups[condition].target;
    return `\`${condition}\` ${fraction(numericHits, planned)}`;
  });
  return [
    '# 第 3 步：冻结 v3 的未见题验证',
    `本次预登记 ${run.families.length} 题。冻结 v3 的训练标签由 AI 预标后交用户复核，改动 0/90；这不是独立人工校准。单次运行不能证明跨运行稳定性。`,
    `机器验收 \`${machineAcceptance}\`；统计判定：${verdict[statisticalVerdict]}。N 哨兵 \`${sentinel.status}\`，尝试 ${sentinel.attempted}/${sentinel.planned}，有效 ${sentinel.valid}；停止原因 \`${stop ?? 'none'}\`。`,
    `冻结决定 \`${calc.freeze.decisionCommit}\`，尺子来源 \`${calc.freeze.sourceCommit}\`。身份 \`${run.manifest.identityId}\`。`,
    `原件：${link('manifest', 'manifest.json')} · ${link('result', 'result.json')} · ${link('启动', receipt('.start.json'))} · ${link('进程', receipt('.process.json'))} · ${link('评测', receipt('.json'))} · ${link('请求日志', receipt('.requests.jsonl'))} · ${link('逐项计算与复核结果', outputs.calculations)} · ${link('证据回读草案', outputs.auditDraft)}。`,
    `复核：\`node src/cli.mjs --verify-run ${id} --run-root ${option(run.root)}\`。复算：\`node scripts/ruler-test-report.mjs --run-root ${option(run.root)} --id ${id}${auditPath ? ` --audit ${option(auditPath)}` : ''}\`。`,
    `证据回读：${calc.audit.reviewer ? `${md(calc.audit.reviewer)}，SHA256 \`${calc.audit.sha256}\`` : '未提供'}。机器绑定不代表实际教学机会或证据语义。`,
    '## 预登记判定',
    '总分方向只比较同题 normal 严格高于坏教师，不决定统计验收。目标维要求同题两侧分档有效、绑定可回读、教学机会明确、引用支持分档，且 normal 至少高 1 档。每组有效/计划至少 90%，命中/计划至少 80%。缺分、无机会、机会不明或证据不足都留在计划分母。no_teach 哨兵未通过时，该组待定，不能授予四组通过。',
    '原 40 道测试题的最省档按本次锁定清单换算为 25 道、50 格。按锁定顺序轮换坏教师，四组的计划对数为 7、6、6、6。有效至少 7、6、6、6 对，命中至少 6、5、5、5 对。no_teach 首四题为 S0-71、S0-97、S0-73、S0-70。',
    ...(statisticalVerdict === 'failed' && shortfall.length ? [`即使保留全部原始分档，${shortfall.join('、')} 的目标维数值命中已低于 80% 通过线。本轮不通过；未确认的抽查不改记为通过。`] : []),
    table(['条件 / 目标维', '总分命中/计划', '总分命中/有分', '目标数值方向/计划（未判机会）', '有效/计划', '目标命中/计划', '目标命中/有效', '同档 / 反向', '缺分 / 无机会 / 机会不明 / 证据不明 / 不支持', '统计'], conditions.map(condition => {
      const { dimension, total, target, verdict: status } = groups[condition];
      return [`${condition} / ${dimension}`, fraction(total.hits, total.planned), fraction(total.hits, total.scored), fraction(target.numericHits, target.planned), fraction(target.eligible, target.planned), fraction(target.hits, target.planned), fraction(target.hits, target.eligible), `${target.ties} / ${target.reversals}`, [target.missingScore, target.noOpportunity, target.unknownOpportunity, target.unknownEvidence, target.unsupportedEvidence].join(' / '), verdict[status]];
    })),
    `verification_or_transfer：尺子一致性不足，仅供参考。预登记结果仍按 90% / 80% 和至少 1 档汇报。有效 ${fraction(transfer.eligible, transfer.planned)}，命中 ${fraction(transfer.hits, transfer.planned)}。回读教师是否发起概念检查或迁移，以及学生是否独立解释或应用。`,
    '## 方向与目标分差区间',
    `Wilson 95% 区间给出二项比例。主区间按学科分层、以整题族为单位重抽 ${draws} 次，保留每题完整的配对，种子为 \`${calc.bootstrap.seed}\`。分位数按有效重抽线性插值。括号为定义的重抽数；无样本或未定义用 —，不填 0。样本方差用 n−1。`,
    table(['条件', '总分同档 / 反向 / 缺分', '总分 Wilson 计划 / 有分', '总分重抽 计划 / 有分', '目标有效率 Wilson / 重抽', '目标 Wilson 计划 / 有效', '目标重抽 计划 / 有效', '分差有效 n / 均值 / 方差 / 均值重抽 CI'], conditions.map(condition => {
      const { total, target } = groups[condition];
      return [condition, `${total.ties} / ${total.reversals} / ${total.missingScore}`, `${ci(total.plannedWilson95)} / ${ci(total.scoredWilson95)}`, `${boot(total.bootstrap95.plannedRate)} / ${boot(total.bootstrap95.scoredRate)}`, `${ci(target.validWilson95)} / ${boot(target.bootstrap95.validRate)}`, `${ci(target.plannedWilson95)} / ${ci(target.eligibleWilson95)}`, `${boot(target.bootstrap95.plannedRate)} / ${boot(target.bootstrap95.eligibleRate)}`, `${target.delta.n} / ${fmt(target.delta.mean)} / ${fmt(target.delta.variance)} / ${boot(target.bootstrap95.deltaMean)}`];
    })),
    '## 各条件逐维分布',
    '分布使用复核过的分档。有分的无机会和机会不明单列；无分只计缺分。非目标维未做人工回读时记为不明；裁判全槽标为无机会的表征转换单列。分档 0 不表示无机会。',
    table(['条件', '维度', '0 / 1 / 2', '缺分 / 无机会 / 机会不明', 'n', '均值', '样本方差', '均值重抽 95% CI'], dimensionsByCondition.flatMap(condition => dimensions.map(dimension => {
      const row = distributions[condition][dimension];
      return [condition, dimension, row.levels.join(' / '), [row.missing, row.noOpportunity, row.unknownOpportunity].join(' / '), row.n, fmt(row.mean), fmt(row.variance), boot(row.meanBootstrap95)];
    }))),
    '## 各学科分母',
    table(['学科', '题数', '题族数', ...conditions.map(c => `${c} 计划 / 有分 / 有效 / 命中`)], Object.entries(subjects).map(([subject, row]) => [subject, row.questions, row.families, ...conditions.map(condition => {
      const { planned, scored, eligible, hits } = row.conditions[condition];
      return [planned, scored, eligible, hits].join(' / ');
    })])),
    '## 逐题对照与证据抽查',
    '按锁定数据集顺序排表。抽查在两侧有机会的目标数值方向命中中，按 SHA256(seed + ":audit:" + 条件 + ":" + 题ID) 取前两题。机会不明的两侧须读回。草案先列数值候选及可回读消息 ID，不用它代替审查。',
    table(['题 / 学科 / 题族', '条件', '总分 normal → bad', '目标 normal → bad', '目标分差', '目标状态', 'normal 原件', 'bad 原件', '故障'], calc.rows.map(row => {
      const sideLinks = side => `${link('对话', side.links.transcript)} · ${link('裁判', side.links.judge)} · ${link('遥测', side.links.telemetry)}`;
      return [`${row.taskId} / ${row.subject} / ${row.family}`, row.condition, `${fmt(row.normal.total)} → ${fmt(row.bad.total)}`, `${fmt(row.normal.score)} → ${fmt(row.bad.score)}`, fmt(row.targetDelta), labels[row.status], sideLinks(row.normal), sideLinks(row.bad), [callFailure(row.normal), callFailure(row.bad)].filter(Boolean).join(' / ') || '—'];
    })),
    table(['条件', '正式抽查', '暂列前二', '机会不明', '抽查证据不支持'], conditions.map(condition => {
      const { sampled, provisionalSample, unknownOpportunity, rejected } = groups[condition].audit;
      return [condition, sampled.join(', ') || '—', provisionalSample.join(', ') || '—', unknownOpportunity.join(', ') || '—', rejected ? '是' : '否'];
    })),
    '## 请求和故障',
    `登记常规 ${calc.budget.typicalCalls} 次，预检硬上限 ${calc.budget.maxCalls} 次和 ${calc.budget.maxOutputTokens} 请求输出 token。失败停止上限为 ${calc.maxFailures} 道不同题。下方以实际授权额度为分母。`,
    `启动和进程收据 PID ${telemetry.pid}，总用时 ${fmt(telemetry.wallMs / 1000)} 秒。按记录发送边界计 ${telemetry.requests}/${calc.limits.maxAttempts} 次请求；已知请求输出额度 ${telemetry.requestedOutputTokens}/${calc.limits.maxRequestedOutputTokens} token（额度未知 ${telemetry.unknownRequestLimit} 次）。遥测 ${telemetry.telemetryRows} 条；${telemetry.unloggedAttempts.length} 条无请求日志。未知实际用量不计入实报合计。`,
    table(['角色', '请求', '请求输出额度', '实报 / 未报请求', '重试', '本地超时', '推理超限 / 未知', '实报非缓存输入 / 缓存读 / 缓存写 / 输出 / 合计'], Object.entries({ all: telemetry, ...telemetry.byRole }).map(([role, row]) => [role, row.requests, row.requestedOutputTokens, `${row.reportedUsage} / ${row.unknownUsage}`, row.retries, row.localTimeouts, `${row.reasoningOverages} / ${row.unknownReasoning}`, row.usage ? [row.usage.input, row.usage.cacheRead, row.usage.cacheWrite, row.usage.output, row.usage.totalTokens].join(' / ') : '—'])),
    telemetry.failures.length ? table(['题', '条件', '角色', '轮', '调用', '尝试', '故障', '原件'], telemetry.failures.map(row => [row.taskId, row.condition, row.role, row.turn, row.call, row.attempt, row.detail ?? row.kind, link('原件', row.attemptPath)])) : '未记录调用失败。',
    telemetry.overages.length ? `推理实报超出请求上限 ${telemetry.overages.length} 次。逐次坐标与实报 token 见${link('计算中的 telemetry.overages', outputs.calculations)}。` : '已知推理用量未观察到超限。',
    calc.issues.length ? table(['格子', '复核问题', '原件'], calc.issues.map(issue => [issue.cell ?? 'run', issue.detail, link(issue.path, issue.path)])) : '报告的收据、身份、绑定与遥测一致性复核无异常。',
  ].join('\n\n') + '\n';
}

function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }

const usage = 'node scripts/ruler-test-report.mjs [--run-root runs] --id <run-id> [--audit <audit.json>]';
try {
  const { values } = parseArgs({ options: { 'run-root': { type: 'string', default: 'runs' }, id: { type: 'string' }, audit: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) console.log(usage);
  else {
    requireThat(nonblank(values['run-root']) && (!Object.hasOwn(values, 'audit') || nonblank(values.audit)), usage);
    const id = runId(values.id);
    const run = loadRun(resolve(values['run-root']), id);
    const evidence = readEvidence(run);
    const identity = { version: 1, runId: id, identityId: run.manifest.identityId, manifestSha256: run.evaluation.manifestSha256, resultSha256: run.evaluation.resultSha256 };
    const auditPath = values.audit ? resolve(values.audit) : null;
    requireThat(!Object.values(outputs).some(name => join(run.dir, name) === auditPath), 'audit input must not be a report output path');
    const audit = readAudits(auditPath, identity, run.families, evidence.cases);
    const rows = makePairs(run, evidence.cases, audit);
    const calc = { ...identity, ...calculate(run, evidence, audit, rows) };
    const draft = { ...identity, reviewer: null,
      schema: { opportunity: ['yes', 'no', 'unknown'], support: ['supported', 'unsupported', 'unknown'], messageIds: 'existing IDs in that side’s transcript; supported requires at least one judge binding ID', note: 'explain the opportunity and whether the referenced behavior supports the assigned score' },
      rankedDirectionHits: Object.fromEntries(conditions.map(condition => [condition, calc.groups[condition].audit.rankedDirectionHits])),
      rows: rows.map(({ taskId, condition, dimension, normal, bad, targetDelta, needsOpportunityAudit }) => ({ taskId, condition, dimension, targetDelta, needsOpportunityAudit, normal, bad })),
    };
    writeJson(join(run.dir, outputs.auditDraft), draft);
    writeJson(join(run.dir, outputs.calculations), calc);
    writeFileSync(join(run.dir, outputs.report), render(calc, run, auditPath));
    console.log(`${join(run.dir, outputs.report)}\nMachine acceptance: ${calc.machineAcceptance}. Statistical verdict: ${calc.statisticalVerdict}.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
