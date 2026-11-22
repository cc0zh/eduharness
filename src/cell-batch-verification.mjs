import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { filenames } from '../contracts/artifacts/schema.mjs';
import { failure, hash, requireThat } from '../contracts/core/schema.mjs';
import { batchFolders, batchVersion, projectResult, splitProgressForBatch, splitScenario, validateBatchPlan } from './cell-batch-plan.mjs';
import { amount, replayBatchJournal, sha256 } from './cell-batch-journal.mjs';
import { jsonBytes, processDir, readOptional, readRequestEvents, receiptPaths } from './receipt-files.mjs';
import { constructExpectations, requireRegisteredSource, s1PreregistrationFile, s1Scenario, s1SourceId } from './s1-binary-plan.mjs';
import { contrastRegistration, judgeContrastScenario } from './judge-contrast-plan.mjs';
import { bakeoffConcurrency } from './judge-bakeoff-plan.mjs';

const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const readJson = path => JSON.parse(readFileSync(path));
const digest = bytes => bytes ? hash(bytes) : null;

function processIndices(root, id) {
  const prefix = `${id}.p`;
  const indices = new Set([1]);
  for (const name of readdirSync(join(root, '_receipts'))) {
    const match = name.startsWith(prefix) && /^(\d+)\.(?:start\.json|requests\.jsonl|process\.json|evaluation\.json)$/.exec(name.slice(prefix.length));
    if (!match) continue;
    const index = Number(match[1]);
    requireThat(amount(index, 1) && String(index) === match[1] && (index !== 1 || name === `${id}.p1.evaluation.json`), 'invalid process index');
    indices.add(index);
  }
  const ordered = [...indices].sort((a, b) => a - b);
  requireThat(ordered.every((n, i) => n === i + 1), 'missing numbered process');
  return ordered;
}

function live(pid) {
  if (!amount(pid, 1)) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; return true; }
}

export function evidenceFor(manifest, sha, index, resultBytes, result, selected, used) {
  return {
    id: manifest.id, scenario: manifest.scenario, mode: manifest.mode, identityId: manifest.identityId,
    processIndex: index, manifestSha256: sha, resultSha256: hash(resultBytes), acceptance: result.acceptance,
    ...(result.assessment && { passed: result.assessment.passed }),
    ...(manifest.identity.preregistrationSha256 && { preregistrationSha256: manifest.identity.preregistrationSha256 }),
    cells: batchFolders(manifest).flatMap(folder => {
      const record = selected.get(folder);
      return record ? [{ folder, processIndex: record.processIndex, artifacts: record.artifacts }] : [];
    }),
    used: { ...used },
  };
}

export function readBatch(root, id, { resume = false } = {}) {
  root = resolve(root);
  const runDir = join(root, id);
  const indices = processIndices(root, id);
  if (resume) {
    const last = receiptPaths(root, id, indices.at(-1));
    if (!existsSync(last.process) && live(readJson(last.start).pid)) throw failure('run_conflict', {}, `run ${id} still has an active process`);
  }
  const firstStart = readJson(receiptPaths(root, id).start);
  const manifest = firstStart.batchManifest;
  requireThat(manifest?.batch === batchVersion && manifest.id === id && ['offline', 'real'].includes(manifest.mode), 'run has no matching resumable startup identity');
  const manifestBytes = jsonBytes(manifest);
  const publishedManifest = readOptional(join(runDir, filenames.manifest));
  const materialized = Boolean(publishedManifest);
  const manifestSha256 = hash(manifestBytes);
  requireThat(!materialized || hash(publishedManifest) === manifestSha256, 'manifest digest differs from the initial startup record');
  validateBatchPlan(manifest);
  const { identity, mode, scenario } = manifest;
  const contrast = scenario === judgeContrastScenario;
  const split = splitScenario(scenario) ? splitProgressForBatch(manifest) : undefined;
  const regSha = identity.preregistrationSha256;
  let registrationStored = false;
  if (regSha) {
    const registered = readOptional(join(runDir, s1PreregistrationFile));
    registrationStored = Boolean(registered);
    requireThat(sha256(regSha) && (registered ? hash(registered) === regSha : !materialized), 'preregistration digest differs from the run identity');
    if (registered) {
      const markdown = registered.toString('utf8');
      if (split) {
        const plan = contrastRegistration(markdown);
        const candidate = plan.candidates?.[identity.judgePolicy];
        requireThat(candidate?.runId === (mode === 'real' ? id : identity.registeredId) && same(candidate.policy, identity.policy)
          && (mode === 'offline' || same(candidate.route, identity.routes.judge)) && plan.ruler === identity.ruler
          && same(candidate.limits, manifest.limits) && same(plan.sources, identity.sources) && same(plan.prior, manifest.source.prior)
          && same(plan.queue, manifest.planned) && same(plan.stop, split.rules)
          && same(plan.judgeTransport, identity.judgeTransport) && plan.parentRegistrationSha256 === identity.parentRegistrationSha256
          && same(plan.freeze, identity.freeze) && plan.judgeFingerprint === identity.judgeFingerprint,
        'judge bakeoff preregistration does not match the batch');
      } else if (contrast) {
        const plan = contrastRegistration(markdown);
        requireThat(plan.runId === (mode === 'real' ? id : identity.registeredId) && plan.judgePolicy === identity.judgePolicy
          && plan.ruler === identity.ruler && plan.policyVersion === identity.policy.version
          && same(plan.limits, manifest.limits) && same(plan.sources, identity.sources) && same(plan.prior, manifest.source.prior)
          && same(plan.queue, manifest.planned), 'judge contrast preregistration does not match the batch');
      } else requireRegisteredSource(markdown, manifest.source);
      constructExpectations(markdown);
    }
  }
  const selected = new Map(), processes = [], attempts = [], artifactPaths = new Map();
  const retries = new Map(), lastAttempt = new Map();
  const used = { attempts: 0, requestedOutputTokens: 0 };
  let head, previousSha256, latestResult, priorStamp, latestEvalBytes, latestResultBytes;
  for (const processIndex of indices) {
    try {
      const paths = receiptPaths(root, id, processIndex);
      const startBytes = readFileSync(paths.start), start = JSON.parse(startBytes);
      const endBytes = readOptional(paths.process), end = endBytes && JSON.parse(endBytes);
      const evaluationBytes = readOptional(paths.evaluation);
      const dir = processDir(runDir, processIndex);
      const journalBytes = readOptional(paths.journal);
      const events = journalBytes ? readRequestEvents(paths.journal, journalBytes) : [];
      const launch = start.parameters?.values;
      const expectedScenario = scenario.replace(/-judge-only$/, '');
      const concurrency = Number(launch?.concurrency ?? 1);
      requireThat(start.runId === id && start.mode === mode && date(start.startedAt) && typeof start.clean === 'boolean'
        && /^[a-f0-9]{40,64}$/.test(start.head) && amount(start.pid, 1) && (launch?.scenario ?? 'E1') === expectedScenario, 'invalid startup record');
      requireThat((launch?.preregistration_sha256 ?? undefined) === regSha, 'startup preregistration digest differs');
      requireThat(amount(concurrency, 1, 5), 'invalid startup concurrency');
      if (contrast) requireThat(launch.judge_policy === identity.judgePolicy && (mode !== 'real' || regSha && (processIndex > 1 || concurrency === 4)), 'judge contrast launch differs from registration');
      if (split) requireThat(launch.judge_policy === identity.judgePolicy && (mode !== 'real' || regSha && concurrency === bakeoffConcurrency), 'judge bakeoff launch differs from registration');
      if (identity.judgeTransport) requireThat(indices.length === 1 && start.parameters.flags?.includes('--proxy-from-env')
        && !start.parameters.flags?.includes('--resume'), 'proxy bakeoff requires one explicitly opted-in process');
      for (const [flag, limit, ceiling] of [['max_attempts', 'maxAttempts', 'maxCalls'], ['max_requested_output_tokens', 'maxRequestedOutputTokens', 'maxOutputTokens']]) {
        requireThat(Number(launch?.[flag] ?? manifest.budget[ceiling]) === manifest.limits[limit], `startup limits differ for ${flag}`);
      }
      if (processIndex === 1) {
        head = start.head;
        requireThat(!start.resume && same(manifest.writer, { pid: start.pid, startedAt: start.startedAt }), 'manifest writer differs from the initial startup record');
      } else requireThat(!start.batchManifest && start.head === head && same(start.resume, { processIndex, previousSha256 }) && Date.parse(start.startedAt) >= priorStamp, 'process sequence, HEAD or previous receipt digest differs');
      if (mode === 'real') requireThat(start.clean && manifest.checkReceipt?.head === head && start.parameters.flags?.includes('--confirm-cost')
        && (scenario !== s1Scenario || regSha && manifest.source?.runId === s1SourceId), 'real preflight provenance mismatch');
      if (end) {
        requireThat(end.runId === id && end.head === head && end.pid === start.pid && end.startHash === hash(start) && date(end.endedAt)
          && Date.parse(end.endedAt) >= Date.parse(start.startedAt) && amount(end.exitCode, 0, 255) && [null, false, true].includes(end.acceptance), 'process receipt differs from startup record');
        requireThat(journalBytes && end.processIndex === processIndex && end.journalSha256 === hash(journalBytes), 'process journal digest differs from process receipt');
      }
      priorStamp = Date.parse(end?.endedAt ?? events.at(-1)?.timestamp ?? start.startedAt);
      const empty = !evaluationBytes && !existsSync(dir) && events.length === 0 && (!end || end.acceptance === null && end.exitCode !== 0);
      requireThat(empty || materialized, 'missing original manifest for a process with activity');
      const replay = empty ? { concurrency, requestCount: 0, peakInFlight: 0, cells: [], attempts: [], downshifts: [], stop: null }
        : replayBatchJournal({ dir, events, start, end, manifest, manifestSha256, processIndex, used, retries, lastAttempt, selected, artifactPaths, split });
      requireThat(!end || end.requestCount === replay.requestCount, 'requestCount differs from request log');
      const interrupted = !end || end.acceptance === null;
      if (end?.evaluationSha256 || !interrupted) requireThat(evaluationBytes && end.evaluationSha256 === hash(evaluationBytes), 'evaluation receipt digest differs from process receipt');
      if (evaluationBytes) {
        requireThat(!replay.pending, 'published process contains unsettled cells');
        const resultBytes = readFileSync(join(dir, filenames.result)), result = JSON.parse(resultBytes);
        requireThat(typeof result.runDir === 'string' && same(result, projectResult(manifest, result.runDir, selected, split)), 'result does not match its plan-ordered cells');
        requireThat(same(JSON.parse(evaluationBytes), evidenceFor(manifest, manifestSha256, processIndex, resultBytes, result, selected, used)), 'evaluation receipt disagrees with result, artifacts or budget');
        if (!interrupted) requireThat(end.acceptance === result.acceptance && end.exitCode === (result.acceptance ? 0 : 1) && !end.error, 'completion differs from the process receipt');
        latestEvalBytes = evaluationBytes;
        latestResultBytes = resultBytes;
        latestResult = result;
      } else requireThat(interrupted, 'finished process has no evaluation receipt');
      previousSha256 = hash([hash(startBytes), digest(journalBytes), digest(endBytes), digest(evaluationBytes)]);
      const { attempts: processAttempts, pending: _pending, ...summary } = replay;
      attempts.push(...processAttempts.map(attempt => ({ ...attempt, processIndex, pid: start.pid })));
      processes.push({ processIndex, pid: start.pid, startedAt: start.startedAt, ...(end && { endedAt: end.endedAt, exitCode: end.exitCode, ...(end.error && { error: end.error }) }), interrupted, ...summary });
    } catch (error) {
      throw Error(`process ${processIndex}: ${error.message}`);
    }
  }
  const latest = processes.at(-1);
  if (!latest.interrupted) {
    requireThat(same(readFileSync(receiptPaths(root, id).latest), latestEvalBytes) && same(readFileSync(join(runDir, filenames.result)), latestResultBytes), 'published evaluation or result differs from process originals');
    for (const { artifacts, folder, processIndex } of selected.values()) for (const [path, sha] of Object.entries(artifacts)) {
      requireThat(digest(readOptional(join(runDir, path))) === sha, `published ${folder} (process ${processIndex}) digest differs for ${path}`);
    }
  }
  return { manifest, manifestSha256, materialized, registrationStored, selected, used, retries, lastAttempt, head, previousSha256, processes, latest, latestResult, attempts, artifactPaths, split };
}

export function verifyBatchRun(root, id) {
  const paths = receiptPaths(root, id);
  const runDir = join(root, id);
  const marked = (path, predicate) => { try { return predicate(readJson(path)); } catch { return false; } };
  if (!existsSync(join(runDir, '_processes')) && !existsSync(paths.evaluation)
    && !marked(paths.start, row => Object.hasOwn(row, 'batchManifest')) && !marked(paths.process, row => Object.hasOwn(row, 'journalSha256'))
    && !marked(paths.latest, row => Object.hasOwn(row, 'processIndex')) && !marked(join(runDir, filenames.manifest), row => row.batch === batchVersion)) return;
  try {
    const { latest, head, manifest, used, retries, latestResult, processes } = readBatch(root, id);
    const requestCount = processes.reduce((n, process) => n + process.requestCount, 0);
    return {
      runId: id, verified: !latest.interrupted, conclusion: latest.interrupted ? 'unfinished' : 'complete',
      missing: latest.interrupted ? [latest.endedAt ? 'final evaluation' : 'process receipt'] : [], invalid: [], head, mode: manifest.mode,
      startedAt: processes[0].startedAt, endedAt: latest.endedAt, exitCode: latest.exitCode,
      acceptance: latest.interrupted ? null : latestResult.acceptance, requestCount, observedRequestCount: requestCount,
      budget: { ...manifest.limits, ...used }, peakInFlight: Math.max(...processes.map(process => process.peakInFlight)), processes,
      ...(manifest.scenario === judgeContrastScenario && { retriesByKind: Object.fromEntries(retries) }),
    };
  } catch (error) {
    return { runId: id, verified: false, conclusion: 'invalid', missing: [], invalid: [error.message] };
  }
}
