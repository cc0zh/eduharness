import { createHash } from 'node:crypto';

export const executionSuccess = 'execution_success';
export const infraFailure = 'infra_failure';
export const failureKinds = Object.freeze([
  'invalid_input', 'configuration', 'artifact_io', 'preflight_failed', 'run_conflict', 'resume_rejected', 'budget_exhausted', 'batch_stopped', 'provider_failure', 'output_truncated',
  'reasoning_exhausted_empty', 'output_limit_empty_unconfirmed', 'empty_unconfirmed',
  'simulator_generation_contract', 'teacher_generation_contract', 'judge_partial_failure', 'fidelity_audit_contract',
  'teacher_observation_contract', 'agency_audit_contract',
]);
export const nonblank = x => typeof x === 'string' && x.trim().length > 0;
export const hash = x => createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
export const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
export function requireThat(ok, detail) {
  if (!ok) throw new Error(detail);
}
export function failure(kind, coordinates = {}, detail = kind) {
  requireThat(failureKinds.includes(kind), 'unknown failure kind');
  return Object.assign(new Error(detail), { failure: { status: infraFailure, kind, ...coordinates, detail } });
}
export function message(id, role, turn, text) {
  requireThat(nonblank(id) && ['teacher', 'learner'].includes(role) && Number.isInteger(turn) && turn >= 0 && nonblank(text), 'invalid dialogue message');
  return Object.freeze({ id, role, turn, text });
}
