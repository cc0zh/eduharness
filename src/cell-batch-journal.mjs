import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { rounds } from '../config/e1.mjs';
import { filenames } from '../contracts/artifacts/schema.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { bindBinary } from '../contracts/judge/binary.mjs';
import { splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { attemptFile, attemptStop, batchFolders, callIdFor, cellRow, covers, numericScores, replayJudge, retryClass, retryStop, verifyDialogue } from './cell-batch-plan.mjs';
import { judgeContrastScenario } from './judge-contrast-plan.mjs';
import { replaySplitJudge, splitBinding } from './split-judge-replay.mjs';
import { finishInterruptedSplit, reserveSplit, settleSplit, splitMaxAttempts, splitNext } from './split-judge-state.mjs';

export const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const amount = (n, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
const parse = bytes => JSON.parse(bytes);

function readDigest(dir, file, sha, label = file) {
  let bytes;
  try { bytes = readFileSync(join(dir, file)); }
  catch (error) { throw Error(`${label} cannot read ${file}: ${error.code ?? error.message}`); }
  requireThat(sha256(sha) && hash(bytes) === sha, `${label} digest differs for ${file}`);
  return bytes;
}

export function cellArtifacts(dir, folder, meters, outcome) {
  const files = [filenames.transcript, filenames.events, filenames.telemetry, ...(!outcome.failure ? [filenames.judge] : [])];
  return Object.fromEntries([...files.map(file => [`${folder}/${file}`, hash(readFileSync(join(dir, folder, file)))]), ...meters.map(({ meter, sha256 }) => [meter.attemptPath, sha256])]);
}

export function verifyCell(dir, manifest, { folder, artifacts, row }, attempts, splitOutcome) {
  const read = file => parse(readDigest(dir, `${folder}/${file}`, artifacts[`${folder}/${file}`]));
  const messages = read(filenames.transcript);
  verifyDialogue(manifest, folder, messages, artifacts[`${folder}/${filenames.transcript}`]);
  requireThat(Array.isArray(read(filenames.events)), `invalid teacher events at ${folder}`);
  const settled = attempts.filter(a => a.meter);
  requireThat(attempts.length === settled.length && same(read(filenames.telemetry), settled.map(a => a.meter)), `attempt/telemetry sequence differs at ${folder}`);
  let judgement = splitOutcome?.verdict ? splitOutcome : undefined;
  for (const attempt of splitOutcome ? [] : settled) {
    const { meter, raw } = attempt;
    if (meter.role !== 'judge') continue;
    const replay = replayJudge(manifest, folder, messages, meter, raw);
    if (replay) {
      requireThat(!judgement && attempt === settled.at(-1), `unexpected successful judge attempt at ${meter.callId}`);
      judgement = replay;
    }
  }
  const required = [filenames.transcript, filenames.events, filenames.telemetry, ...(!row.failure ? [filenames.judge] : [])].map(file => `${folder}/${file}`);
  const byPath = Object.fromEntries(settled.map(a => [a.meter.attemptPath, a.sha256]));
  requireThat(same(Object.keys(artifacts).sort(), [...required, ...Object.keys(byPath)].sort()) && Object.entries(byPath).every(([key, value]) => artifacts[key] === value), `cell artifact inventory differs at ${folder}`);
  if (row.failure) {
    requireThat(!judgement && row.failure.status === 'infra_failure' && typeof row.failure.kind === 'string', `invalid failure at ${folder}`);
    const last = settled.at(-1)?.meter;
    if (!splitOutcome && row.failure.attemptPath) requireThat(last?.attemptPath === row.failure.attemptPath && last.failureKind === row.failure.kind, `last failure differs from original at ${folder}`);
  } else {
    requireThat(judgement && same(read(filenames.judge), judgement), `published ruling does not replay at ${folder}`);
  }
  const expected = cellRow(manifest, folder, splitOutcome ?? (row.failure ? { failure: row.failure } : (judgement.verdict ? judgement : { scores: numericScores(judgement) })));
  requireThat(same(row, expected), `cell result does not replay at ${folder}`);
  return { judgement, messages };
}

export function replayBatchJournal({ dir, events, start, end, manifest, manifestSha256, processIndex, used, retries, lastAttempt, selected, artifactPaths, split }) {
  const { policy } = manifest.identity;
  const origin = events[0];
  requireThat(origin?.type === 'batch_start' && origin.startHash === hash(start) && origin.manifestSha256 === manifestSha256 && amount(origin.concurrency, 1, 5)
    && origin.concurrency === Number(start.parameters?.values?.concurrency ?? 1), 'batch start does not anchor the manifest or concurrency');
  let activeLimit = origin.concurrency, stop = split?.stop ?? null, requestCount = 0, peakInFlight = 0, stamp = Date.parse(start.startedAt);
  const order = batchFolders(manifest).filter(folder => !selected.has(folder) || !split && selected.get(folder).row.failure);
  let next = 0;
  const active = new Map(), cells = [], attempts = new Map(), downshifts = [];
  const running = new Map();
  const commit = (event, label, splitOutcome) => {
    const { folder } = event;
    const group = active.get(folder);
    requireThat(group && !running.has(folder) && (!selected.has(folder) || !split && selected.get(folder).row.failure), `unexpected cell commit at ${label}`);
    const verified = verifyCell(dir, manifest, event, group, splitOutcome);
    if (!split && event.row.failure && !stop) stop = { kind: 'cell_failure', folder };
    selected.set(folder, { folder, processIndex, artifacts: event.artifacts, row: event.row, ...verified });
    cells.push(folder);
    const knownPaths = artifactPaths.get(folder) ?? new Set();
    for (const path of Object.keys(event.artifacts)) knownPaths.add(path);
    artifactPaths.set(folder, knownPaths);
    active.delete(folder);
  };
  for (const [index, event] of events.entries()) {
    const label = `${event.callId ?? event.folder ?? event.type} (process ${processIndex}, event ${index + 1})`;
    const time = Date.parse(event.timestamp);
    requireThat(time >= stamp && (!end || time <= Date.parse(end.endedAt)), `event timestamp outside process at ${label}`);
    stamp = time;
    if (index === 0) continue;
    const group = active.get(event.folder);
    const a = attempts.get(event.callId);
    if (event.type === 'cell_start') {
      requireThat(!stop && active.size < activeLimit && next < order.length && event.folder === order[next] && !active.has(event.folder), `cell launch out of order or after stop at ${label}`);
      next++;
      active.set(event.folder, []);
    } else if (['reserve', 'budget_stop', 'retry_stop'].includes(event.type)) {
      const { scope, limit, folder } = event;
      const { role, turn, call, attempt } = scope ?? {};
      const roleMatches = split ? role === 'judge' && turn === rounds && amount(call, 1, splitDimensions.length) && amount(attempt, 1, splitMaxAttempts)
        : amount(turn, 1, rounds) && amount(call, 1) && amount(attempt, 1)
          && ((role === 'teacher' && !manifest.source) || (role === 'learner' && !manifest.source && call === 1) || (role === 'judge' && turn === rounds && call === 1));
      requireThat(group && !stop && !running.has(folder) && !a && running.size < activeLimit && roleMatches
        && event.callId === callIdFor(folder, scope) && limit === policy[role].maxTokens, `invalid attempt reservation at ${label}`);
      const last = group.at(-1);
      const retry = last && last.scope.role === role && last.scope.turn === turn && last.scope.call === call;
      const expectedRetryCount = split ? attempt - 1 : retry ? last.meter.retryCount + Number(!last.meter.rateLimited) : 0;
      if (split) {
        const next = splitNext(split, folder);
        requireThat(next?.call === call && next.nextAttempt === attempt, `dimension sequence differs at ${label}`);
      } else requireThat(retry ? last.meter.failureKind && attempt === last.scope.attempt + 1 : attempt === 1 && !last?.meter.failureKind, `attempt sequence differs at ${label}`);
      const previous = lastAttempt.get(folder);
      const exhausted = retryStop(policy, previous, retries, event.callId);
      if (event.type === 'retry_stop') {
        requireThat(exhausted && event.kind === exhausted.kind && event.failureKind === exhausted.failureKind, `retry stop with retries available at ${label}`);
        stop = exhausted;
        continue;
      }
      requireThat(!exhausted, `reservation after failure-kind retry limit at ${label}`);
      if (event.type === 'budget_stop') {
        requireThat(!covers(manifest.limits, used, limit), `budget stop with available balance at ${label}`);
        stop = { kind: 'budget_exhausted', callId: event.callId };
        if (split) split.stop = stop;
        continue;
      }
      requireThat(covers(manifest.limits, used, limit) && !group.some(prior => prior.callId === event.callId) && event.inFlight === running.size + 1, `reservation exceeds budget or concurrency at ${label}`);
      if (split) reserveSplit(split, folder, scope, event.callId);
      const kind = retryClass(policy, previous);
      if (kind) retries.set(kind, (retries.get(kind) ?? 0) + 1);
      used.attempts++;
      used.requestedOutputTokens += limit;
      const reserved = { ...event, expectedRetryCount, settled: false };
      group.push(reserved);
      attempts.set(event.callId, reserved);
      running.set(folder, reserved);
      peakInFlight = Math.max(peakInFlight, running.size);
    } else if (event.type === 'request_start') {
      requireThat((!stop || stop.kind === 'budget_exhausted') && manifest.mode === 'real' && a && !a.settled && !a.sent && event.requestId === `${a.callId}:1`, `unexpected or duplicate request start at ${label}`);
      a.sent = event;
      requestCount++;
    } else if (event.type === 'request_end') {
      requireThat(a?.sent && !a.ended && !a.settled && a.sent.requestId === event.requestId && (Object.hasOwn(event, 'status') ? amount(event.status, 100, 599) && !Object.hasOwn(event, 'error') : event.error === 'transport_failure'), `request end does not match its start at ${label}`);
      a.ended = event;
    } else if (event.type === 'settle') {
      const { meter, sha256: sha } = event;
      requireThat(a && !a.settled && (!a.sent || a.ended) && meter.callId === a.callId && meter.processIndex === processIndex && meter.pid === start.pid
        && Object.entries(a.scope).every(([key, value]) => meter[key] === value) && meter.attemptPath === attemptFile(a.folder, a.scope)
        && meter.policyVersion === policy.version && amount(meter.requestLimit, 1, a.limit)
        && meter.retryCount === a.expectedRetryCount && amount(meter.retryCount, 0, policy.retries), `attempt settlement does not match reservation at ${label}`);
      const raw = parse(readDigest(dir, meter.attemptPath, sha, label));
      const [repetition, condition] = a.folder.split('/');
      requireThat(Object.entries(a.scope).every(([key, value]) => raw[key] === value) && (condition === undefined || raw.repetition === repetition && meter.repetition === repetition)
        && (manifest.mode !== 'real' || meter.failureKind || a.sent) && (!raw.outbound || a.sent || stop), `attempt original or request log disagrees at ${label}`);
      if ((split || manifest.scenario === judgeContrastScenario) && manifest.mode === 'real') {
        const phase = meter.phaseMs;
        requireThat(meter.timeoutMs === policy.judge.timeoutMs && phase && amount(phase.ended, 0, meter.elapsedMs)
          && (a.sent ? amount(phase.requestSent, 0, phase.ended) : phase.requestSent === null)
          && ['headersReceived', 'firstByte', 'firstReasoning', 'lastReasoning', 'firstVisible'].every(key => phase[key] === null || a.sent && amount(phase[key], phase.requestSent, phase.ended))
          && (phase.firstReasoning === null ? phase.lastReasoning === null : amount(phase.lastReasoning, phase.firstReasoning, phase.ended))
          && (meter.reasoningTokens === null || amount(meter.reasoningTokens, 0))
          && (meter.reportedOutputTokens === null || meter.reportedOutputTokens === meter.usage?.output), `invalid judge timing or usage at ${label}`);
      }
      requireThat((a.ended?.status === 429 || meter.httpStatus === 429) ? meter.rateLimited === true : !meter.rateLimited || meter.failureKind === 'provider_failure', `rate-limit evidence differs at ${label}`);
      const expectedShift = meter.rateLimited && activeLimit > 1 ? { from: activeLimit, to: activeLimit - 1, callId: a.callId } : undefined;
      let outcome, expectedStop;
      if (split) {
        const source = manifest.planned.find(row => row.id === a.folder);
        const messages = parse(readDigest(dir, `${a.folder}/${filenames.transcript}`, source.transcriptSha256, label));
        verifyDialogue(manifest, a.folder, messages, source.transcriptSha256);
        const part = replaySplitJudge(manifest, a.folder, messages, meter, raw);
        ({ outcome, stop: expectedStop } = settleSplit(split, a.folder, meter, part,
          part && splitBinding(manifest, a.folder, bindBinary(messages)), manifest.mode === 'offline' || Boolean(a.sent)));
      } else expectedStop = !stop ? attemptStop(policy, meter, retries) : undefined;
      requireThat(same(event.downshift, expectedShift) && same(event.stop, expectedStop), `retry stop or downshift differs at ${label}`);
      if (expectedShift) { activeLimit--; downshifts.push(expectedShift); }
      stop ??= expectedStop ?? null;
      if (policy.retriesPerKind !== undefined && (manifest.mode === 'offline' || a.sent)) lastAttempt.set(a.folder, meter);
      Object.assign(a, { meter, raw, sha256: sha, settled: true });
      running.delete(a.folder);
      if (split) {
        requireThat(outcome ? event.cell?.folder === a.folder : !event.cell, `dimension settlement cell differs at ${label}`);
        if (outcome) commit(event.cell, label, outcome);
      } else if (meter.role === 'judge' && !meter.failureKind) {
        requireThat(event.cell?.folder === a.folder && !event.cell.row.failure, `successful judge lacks a committed ruling at ${label}`);
        commit(event.cell, label);
      } else requireThat(!event.cell, `unexpected ruling at ${label}`);
    } else if (event.type === 'cell_commit') {
      requireThat(event.row.failure, `standalone commit must record a failure at ${label}`);
      if (split) {
        requireThat(!stop && group && !running.has(event.folder), `unexpected split terminal commit at ${label}`);
        const { outcome, stop: expectedStop } = finishInterruptedSplit(split, event.folder);
        requireThat(same(event.stop, expectedStop), `interrupted dimension stop differs at ${label}`);
        stop ??= expectedStop ?? null;
        commit(event, label, outcome);
      } else commit(event, label);
    } else if (split && event.type === 'cell_pause') {
      requireThat(stop && group && !running.has(event.folder), `unexpected paused cell at ${label}`);
      active.delete(event.folder);
    } else throw Error(`unknown journal event at ${label}`);
  }
  return { concurrency: origin.concurrency, stop, requestCount, peakInFlight, downshifts, cells: batchFolders(manifest).filter(folder => cells.includes(folder)),
    attempts: [...attempts.values()], pending: active.size };
}
