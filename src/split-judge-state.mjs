import { failure, requireThat } from '../contracts/core/schema.mjs';
import { assembleBinaryVerdict, splitDimensions } from '../contracts/judge/binary-v3.mjs';

export const splitMaxAttempts = 3;
export const splitStopRules = planned => ({ providerFailures: 3, consecutiveFailedCells: 3, failedCells: planned === 18 ? 4 : Math.ceil(planned * 0.15) });

export function createSplitProgress(planned) {
  return { rules: splitStopRules(planned), cells: new Map(), providerFailures: 0, consecutiveFailedCells: 0, failedCells: 0, crossDimensionFailures: 0, stop: null };
}

export function splitNext(progress, folder) {
  const cell = progress.cells.get(folder);
  if (cell?.terminal) return null;
  return { call: (cell?.parts.length ?? 0) + 1, nextAttempt: (cell?.previous?.scope.attempt ?? 0) + 1, retryFeedback: cell?.previous?.meter?.validationCode ?? null };
}

export function reserveSplit(progress, folder, scope, callId) {
  const next = splitNext(progress, folder);
  requireThat(next && next.call === scope.call && next.nextAttempt === scope.attempt && scope.attempt <= splitMaxAttempts, `split dimension attempt sequence differs at ${callId}`);
  if (!progress.cells.has(folder)) progress.cells.set(folder, { parts: [] });
  progress.cells.get(folder).previous = { scope, callId, retryFeedback: next.retryFeedback };
}

function finalize(progress, cell, outcome) {
  if (outcome.failure) {
    progress.failedCells++;
    progress.consecutiveFailedCells++;
    if (outcome.failure.crossDimension) progress.crossDimensionFailures++;
  } else progress.consecutiveFailedCells = 0;
  cell.terminal = true;
  return outcome;
}

function applyStop(progress, folder, callId) {
  if (progress.stop) return;
  const { rules } = progress;
  let kind;
  if (progress.providerFailures >= rules.providerFailures) kind = 'consecutive_provider_failures';
  else if (progress.consecutiveFailedCells >= rules.consecutiveFailedCells) kind = 'consecutive_failed_cells';
  else if (progress.failedCells >= rules.failedCells) kind = 'failed_cells_limit';
  if (kind) return progress.stop = { kind, folder, callId };
}

export function settleSplit(progress, folder, meter, judgement, binding, sent = true) {
  const cell = progress.cells.get(folder);
  requireThat(cell?.previous?.callId === meter.callId && !cell.previous.meter && cell.previous.retryFeedback === meter.retryFeedback, `split retry feedback or reservation differs at ${meter.callId}`);
  cell.previous.meter = meter;
  if (sent || !meter.failureKind) progress.providerFailures = meter.failureKind === 'provider_failure' ? progress.providerFailures + 1 : 0;
  let outcome;
  const dimension = splitDimensions[meter.call - 1];
  const where = { role: 'judge', turn: meter.turn, call: meter.call, attempt: meter.attempt, callId: meter.callId, dimension, attemptPath: meter.attemptPath };
  if (judgement) {
    cell.parts.push(judgement);
    cell.previous = null;
    if (cell.parts.length === splitDimensions.length) {
      const byDimension = project => Object.fromEntries(splitDimensions.map((key, i) => [key, project(cell.parts[i])]));
      const { verdict, conflict } = assembleBinaryVerdict(byDimension(part => part.verdict), binding?.ruler);
      if (conflict) {
        const crossDimension = { ...conflict, dimensions: byDimension(part => part.binding) };
        outcome = { failure: failure('judge_partial_failure', { ...where, crossDimension }, 'S3 and P1 disagree across dimension judgements').failure };
      } else outcome = { binding: { ...binding, dimensions: byDimension(part => part.binding) }, verdict };
    }
  } else if (meter.attempt === splitMaxAttempts || meter.failureKind === 'configuration') {
    outcome = { failure: failure(meter.failureKind, where, meter.detail ?? meter.failureKind).failure };
  }
  if (outcome) finalize(progress, cell, outcome);
  return { outcome, stop: applyStop(progress, folder, meter.callId) };
}

export function finishInterruptedSplit(progress, folder) {
  const cell = progress.cells.get(folder);
  requireThat(!cell?.terminal && cell?.previous?.scope.attempt === splitMaxAttempts && !cell.previous.meter, `no exhausted interrupted dimension at ${folder}`);
  const { callId, scope } = cell.previous;
  const dimension = splitDimensions[scope.call - 1];
  const outcome = { failure: failure('judge_partial_failure', { ...scope, callId, dimension }, 'third dimension attempt interrupted before settlement').failure };
  finalize(progress, cell, outcome);
  return { outcome, stop: applyStop(progress, folder, callId) };
}
