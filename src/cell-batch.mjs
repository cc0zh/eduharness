import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { filenames } from '../contracts/artifacts/schema.mjs';
import { failure, hash, requireThat } from '../contracts/core/schema.mjs';
import { attemptStop, batchFolders, batchPolicy, batchVersion, callIdFor, cellRow, covers, numericScores, projectResult, replayJudge, retryClass, retryStop } from './cell-batch-plan.mjs';
import { cellArtifacts } from './cell-batch-journal.mjs';
import { evidenceFor, readBatch } from './cell-batch-verification.mjs';
import { checkSnapshot } from './real-preflight.mjs';
import { atomicBytes, atomicJson, jsonBytes, processDir } from './receipt-files.mjs';
import { s1PreregistrationFile } from './s1-binary-plan.mjs';

export async function runCellBatch({ root, id, concurrency = 1, resume, openRun }, values, execute, preregistration) {
  const policy = batchPolicy(values);
  const runDir = join(root, id);
  const manifestPath = join(runDir, filenames.manifest);
  let manifest, manifestSha256, history, recorder;
  if (resume) {
    const snapshot = checkSnapshot();
    try {
      history = readBatch(root, id, { resume: true });
      ({ manifest, manifestSha256 } = history);
      requireThat(snapshot.head === history.head, `HEAD differs: original ${history.head}, current ${snapshot.head}`);
      requireThat(manifest.identity.preregistrationSha256 === values.identity.preregistrationSha256, 'preregistration SHA256 differs from original run');
      for (const path of new Set([...Object.keys(manifest.identity.sources), ...Object.keys(values.identity.sources)])) {
        requireThat(manifest.identity.sources[path] === values.identity.sources[path], `source hash differs for ${path}`);
      }
      requireThat(values.identityId === manifest.identityId, 'evaluation identity differs from original run');
    } catch (error) {
      if (error.failure?.kind === 'run_conflict') throw error;
      throw failure('resume_rejected', {}, `cannot resume ${id}: ${error.message}`);
    }
    if (!history.latest.interrupted && batchFolders(manifest).every(folder => history.selected.has(folder) && !history.selected.get(folder).row.failure)) return history.latestResult;
    recorder = openRun({ resume: { processIndex: history.latest.processIndex + 1, head: history.head, previousSha256: history.previousSha256 } });
    if (!history.materialized) {
      mkdirSync(runDir, { recursive: true });
      if (preregistration && !history.registrationStored) atomicBytes(join(runDir, s1PreregistrationFile), preregistration);
      atomicJson(manifestPath, manifest);
    }
  } else {
    recorder = openRun({ manifest: { ...values, batch: batchVersion } });
    manifest = recorder.start.batchManifest;
    mkdirSync(runDir);
    if (preregistration) atomicBytes(join(runDir, s1PreregistrationFile), preregistration);
    manifestSha256 = atomicJson(manifestPath, manifest);
  }

  recorder.beginBatch(manifestSha256, concurrency);
  const { processIndex } = recorder;
  const writer = { pid: recorder.start.pid, startedAt: recorder.start.startedAt, processIndex };
  const dir = processDir(runDir, processIndex);
  mkdirSync(dir, { recursive: true });
  const selected = history?.selected ?? new Map();
  const used = history?.used ?? { attempts: 0, requestedOutputTokens: 0 };
  const retries = history?.retries ?? new Map();
  const lastAttempt = history?.lastAttempt ?? new Map();
  const folders = batchFolders(manifest);
  const pending = folders.filter(folder => !selected.has(folder) || selected.get(folder).row.failure);
  const running = new Set(), active = new Map(), waiters = new Set();
  let activeLimit = concurrency, stop, fatal;
  const wake = () => { for (const resolve of waiters) resolve(); waiters.clear(); };
  const abort = error => { fatal ??= error; wake(); };
  const append = event => {
    try { recorder.append(event); }
    catch (error) { abort(error); throw error; }
  };
  const stopFailure = scope => failure('batch_stopped', scope, 'batch stopped; no new model attempts are admitted');

  const requestRecorder = { append(event) {
    if (event.type === 'request_start') {
      if ((stop && stop.kind !== 'budget_exhausted') || fatal) throw stopFailure({ callId: event.callId });
      const reservation = active.get(event.callId);
      if (!reservation || reservation.sent) {
        const rejected = failure('configuration', { callId: event.callId }, `transport tried to send without a fresh reservation: ${event.callId}`);
        abort(rejected);
        throw rejected;
      }
      reservation.sent = true;
    }
    append(event);
  } };

  function launch(folder) {
    append({ type: 'cell_start', folder });
    const meters = [];
    const control = {
      judgeReasoningOff: Boolean(policy.judge.reasoning),
      judgePolicy: manifest.identity.judgePolicy,
      async before(scope, limit) {
        if (meters.at(-1)?.meter.rateLimited && !stop && !fatal) await new Promise(resolve => setTimeout(resolve, 100));
        while (!stop && !fatal && active.size >= activeLimit) await new Promise(resolve => waiters.add(resolve));
        const callId = callIdFor(folder, scope);
        if (stop || fatal) throw stopFailure({ ...scope, callId });
        const previous = lastAttempt.get(folder);
        const retry = retryStop(policy, previous, retries, callId);
        if (retry) {
          append({ type: 'retry_stop', folder, scope, limit, ...retry });
          stop = retry;
          wake();
          throw failure(retry.failureKind, { ...scope, callId }, 'run-wide retry limit for this failure kind');
        }
        if (!covers(manifest.limits, used, limit)) {
          append({ type: 'budget_stop', callId, folder, scope, limit });
          stop = { kind: 'budget_exhausted', callId };
          wake();
          throw failure(stop.kind, { ...scope, callId }, 'remaining request budget cannot cover the next attempt');
        }
        append({ type: 'reserve', callId, folder, scope, limit, inFlight: active.size + 1 });
        const kind = retryClass(policy, previous);
        if (kind) retries.set(kind, (retries.get(kind) ?? 0) + 1);
        used.attempts++;
        used.requestedOutputTokens += limit;
        active.set(callId, { folder });
      },
      settle(meter, messages) {
        const { callId } = meter;
        const bytes = readFileSync(join(dir, meter.attemptPath));
        const sha256 = hash(bytes);
        const downshift = meter.rateLimited && activeLimit > 1 ? { from: activeLimit, to: activeLimit - 1, callId } : undefined;
        const finished = manifest.mode === 'offline' || active.get(callId)?.sent;
        if (policy.retriesPerKind !== undefined && finished) lastAttempt.set(folder, meter);
        const exhausted = !stop ? attemptStop(policy, meter, retries) : undefined;
        meters.push({ meter, sha256 });
        let judgement, cell;
        if (meter.role === 'judge' && !meter.failureKind) {
          judgement = replayJudge(manifest, folder, messages, meter, JSON.parse(bytes));
          atomicJson(join(dir, folder, filenames.judge), judgement);
          const row = cellRow(manifest, folder, judgement.verdict ? judgement : { scores: numericScores(judgement) });
          cell = { folder, row, artifacts: cellArtifacts(dir, folder, meters, {}) };
        }
        append({ type: 'settle', callId, meter, sha256, downshift, stop: exhausted, cell });
        if (cell) selected.set(folder, { ...cell, processIndex, judgement, messages });
        active.delete(callId);
        if (downshift) activeLimit--;
        stop ??= exhausted;
        wake();
      },
    };
    const job = execute(folder, { runDir: dir, writer, recorder: requestRecorder, control }).then(outcome => {
      if (fatal || !outcome.failure) return;
      if ([...active.values()].some(reservation => reservation.folder === folder)) throw Object.assign(new Error(outcome.failure.detail), { failure: outcome.failure });
      const row = cellRow(manifest, folder, outcome);
      const artifacts = cellArtifacts(dir, folder, meters, outcome);
      append({ type: 'cell_commit', folder, row, artifacts });
      selected.set(folder, { folder, processIndex, row, artifacts });
      if (!stop) { stop = { kind: 'cell_failure', folder }; wake(); }
    }).catch(abort).finally(() => running.delete(job));
    running.add(job);
  }

  let next = 0;
  while (true) {
    try {
      while (!stop && !fatal && next < pending.length && running.size < activeLimit) launch(pending[next++]);
    } catch (error) { abort(error); }
    if (!running.size) break;
    await Promise.race(running);
  }
  if (fatal) throw fatal;

  const result = projectResult(manifest, runDir, selected);
  for (const folder of folders) {
    const entry = selected.get(folder);
    if (!entry) continue;
    for (const old of history?.artifactPaths.get(folder) ?? []) if (!Object.hasOwn(entry.artifacts, old)) {
      try { unlinkSync(join(runDir, old)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const [path, sha] of Object.entries(entry.artifacts)) {
      const bytes = readFileSync(join(processDir(runDir, entry.processIndex), path));
      requireThat(hash(bytes) === sha, `cannot publish changed original: ${path} (process ${entry.processIndex})`);
      atomicBytes(join(runDir, path), bytes, true);
    }
  }
  const resultBytes = jsonBytes(result);
  atomicBytes(join(dir, filenames.result), resultBytes);
  atomicBytes(join(runDir, filenames.result), resultBytes, true);
  recorder.publishEvaluation(evidenceFor(manifest, manifestSha256, processIndex, resultBytes, result, selected, used));
  return result;
}
