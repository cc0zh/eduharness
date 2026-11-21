import { executionSuccess, infraFailure, nonblank, requireThat } from '../core/schema.mjs';

export const modes = ['offline', 'real'];
export const cellIds = ['normal', 'answer_dump', 'lecture', 'sycophant_close', 'no_teach'];
export const filenames = Object.freeze({ manifest: 'manifest.json', result: 'result.json', transcript: 'transcript.json', telemetry: 'telemetry.json', events: 'teacher-events.json', judge: 'judge.json', raw: 'calls' });
export function cellResult(id, scores, error) {
  requireThat(cellIds.includes(id), 'unknown cell');
  if (error) return { id, recorded: true, status: infraFailure, scored: false, validTotal: false, total: null, directAnswer: null, failure: error };
  requireThat(Array.isArray(scores?.all) && scores.all.length > 0 && scores.all.every(x => [0, 1, 2, null].includes(x)), 'invalid score');
  const validTotal = scores.all.every(Number.isInteger);
  return { id, recorded: true, status: executionSuccess, scored: scores.all.some(Number.isInteger), validTotal, total: validTotal ? scores.all.reduce((a, b) => a + b, 0) : null, directAnswer: scores.direct };
}
export function binaryCellResult(id, scoring, error) {
  requireThat(cellIds.includes(id), 'unknown cell');
  return binaryRulingResult(id, scoring, error);
}
export function binaryRulingResult(id, scoring, error) {
  requireThat(nonblank(id), 'missing binary ruling ID');
  if (error) return { id, recorded: true, status: infraFailure, scored: false, validTotal: false, rate: null, failure: error };
  const { rate } = scoring;
  const validTotal = rate !== null;
  return { id, recorded: true, status: executionSuccess, scored: validTotal, validTotal, rate, scoring };
}
export function runId(value) {
  requireThat(nonblank(value) && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value) && !/^check-/i.test(value) && !/^(?:_receipts|con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(value), 'invalid run id');
  return value;
}
