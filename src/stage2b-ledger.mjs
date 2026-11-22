import { policy, rounds } from '../config/e1.mjs';
import { failure, failureKinds, requireThat } from '../contracts/core/schema.mjs';
import { splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { splitMaxAttempts } from './split-judge-state.mjs';
import { stage2bAttemptLimits, stage2bCallId, stage2bStop } from './stage2b-plan.mjs';

export function stage2bLedger(limits, initialConcurrency, persist = () => {}) {
  const roleLimits = stage2bAttemptLimits();
  const used = { attempts: 0, requestedOutputTokens: 0 };
  const attempts = new Map(), completions = new Map(), logical = new Map(), active = new Set(), sent = [], downshifts = [];
  let stop = null, providerFailures = 0, consecutiveFailedCells = 0, failedCells = 0;
  let concurrency = initialConcurrency, peakInFlight = 0;
  const covers = limit => used.attempts < limits.maxAttempts && used.requestedOutputTokens + limit <= limits.maxRequestedOutputTokens;
  const exhausted = (kind, folder, callId) => { stop ??= { kind, folder, ...(callId && { callId }) }; };
  const stopped = (detail, coordinates) => failure('batch_stopped', coordinates, detail);

  function apply(event) {
    const { type, callId, limit, coordinates, failureKind, rateLimited, folder, status } = event;
    if (type === 'reserve' || type === 'budget_stop') {
      const { role, turn, call, attempt } = coordinates;
      const maxCall = { teacher: policy.teacher.requestsPerTurn, learner: 1, judge: splitDimensions.length }[role];
      const base = callId.slice(0, callId.lastIndexOf(':'));
      requireThat(!stop && callId === stage2bCallId(coordinates) && limit === roleLimits[role] && limit > 0
        && Number.isInteger(turn) && turn >= 1 && turn <= rounds && (role !== 'judge' || turn === rounds)
        && Number.isInteger(call) && call > 0 && call <= maxCall && Number.isInteger(attempt) && attempt === (logical.get(base) ?? 0) + 1
        && (role !== 'judge' || attempt <= splitMaxAttempts) && !attempts.has(callId) && !completions.has(coordinates.folder)
        && !active.has(coordinates.folder) && active.size < concurrency, `invalid reservation: ${callId}`);
      if (type === 'budget_stop') {
        requireThat(!covers(limit), `premature budget stop: ${callId}`);
        exhausted('budget_exhausted', coordinates.folder, callId);
      } else {
        requireThat(covers(limit), `reservation exceeds budget: ${callId}`);
        logical.set(base, attempt);
        attempts.set(callId, { coordinates, limit, sent: false, settled: false });
        active.add(coordinates.folder);
        peakInFlight = Math.max(peakInFlight, active.size);
        used.attempts++;
        used.requestedOutputTokens += limit;
      }
    } else if (type === 'send') {
      const record = attempts.get(callId);
      requireThat(!stop && record && !record.sent && !record.settled, `request lacks a live reservation: ${callId}`);
      record.sent = true;
      sent.push(callId);
    } else if (type === 'settle') {
      const record = attempts.get(callId);
      requireThat(record && !record.settled && (failureKind === null || failureKinds.includes(failureKind)) && typeof rateLimited === 'boolean',
        `invalid settlement: ${callId}`);
      Object.assign(record, { settled: true, failureKind, rateLimited });
      active.delete(record.coordinates.folder);
      if (record.sent) {
        providerFailures = failureKind === 'provider_failure' ? providerFailures + 1 : 0;
        if (rateLimited && concurrency > 1) downshifts.push({ from: concurrency, to: --concurrency, callId });
        if (providerFailures >= stage2bStop.providerFailures) exhausted('consecutive_provider_failures', record.coordinates.folder, callId);
      }
    } else if (type === 'cell') {
      requireThat(!completions.has(folder) && !active.has(folder) && ['scored', 'failed', 'paused'].includes(status)
        && (status !== 'paused' || stop), `invalid cell completion: ${folder}`);
      completions.set(folder, status);
      if (status === 'failed') {
        consecutiveFailedCells++;
        failedCells++;
        if (consecutiveFailedCells >= stage2bStop.consecutiveFailedCells) exhausted('consecutive_failed_cells', folder, callId);
        else if (failedCells >= stage2bStop.failedCells) exhausted('failed_cells_limit', folder, callId);
      } else if (status === 'scored') consecutiveFailedCells = 0;
    } else throw Error(`unknown stage 2b ledger event: ${type}`);
    try { persist(event); }
    catch (error) { exhausted('artifact_io', coordinates?.folder ?? folder, callId); throw error; }
  }

  return {
    apply, attempts, completions, sent,
    reserve(coordinates, limit) {
      const callId = stage2bCallId(coordinates);
      if (stop) throw stopped('stage 2b batch stopped', { ...coordinates, callId });
      const type = covers(limit) ? 'reserve' : 'budget_stop';
      apply({ type, callId, coordinates, limit });
      if (type === 'budget_stop') throw failure('budget_exhausted', { ...coordinates, callId }, 'remaining request budget cannot cover next attempt');
      return callId;
    },
    send(callId) {
      if (stop) throw stopped('stage 2b batch stopped before send', { callId });
      apply({ type: 'send', callId });
    },
    settle(callId, failureKind, rateLimited) { apply({ type: 'settle', callId, failureKind, rateLimited }); },
    complete(folder, status, callId) { apply({ type: 'cell', folder, status, ...(callId && { callId }) }); },
    snapshot: () => ({ used: { ...used }, stop, failedCells, concurrency, peakInFlight, downshifts: [...downshifts], inFlight: active.size }),
  };
}
