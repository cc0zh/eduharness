import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { filenames, runId } from '../contracts/artifacts/schema.mjs';
import { hash, message, requireThat } from '../contracts/core/schema.mjs';
import { rounds } from '../config/e1.mjs';
import { verifyRun } from './run-receipts.mjs';

export const harnessSides = ['baseline', 'improved', 'rhetoric'];
export const harnessSeed = 'teacharena-harness-ab-v1';
export const preregistrationSha256 = 'bdc17d6a32e46df8664d338cc6b976bc3adb41b348cf914114d011da32037967';
const rhetoric = ' I let you work it out and verify it yourself, so you have mastered it.';

export function harnessPlan(split) {
  return split.test.map(id => [hash(`${harnessSeed}:${id}`), id]).sort().slice(0, 10)
    .map(([, taskId]) => ({ taskId, condition: 'normal' }));
}

export function distinctRoots(...roots) {
  const inside = (a, b) => {
    const child = relative(a, b);
    return !isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`);
  };
  const paths = roots.map(root => realpathSync(root));
  requireThat(paths.every((path, i) => paths.slice(i + 1).every(other => !inside(path, other) && !inside(other, path))), 'A/B run roots must be independent');
}

export function readHarnessRun(root, id, side) {
  runId(id);
  const verification = verifyRun(root, id);
  requireThat(verification.verified && [0, 1].includes(verification.exitCode), `${side}/${id}: ${[...verification.missing, ...verification.invalid].join('; ') || 'invalid process exit'}`);
  const read = (...path) => JSON.parse(readFileSync(join(root, ...path)));
  const start = read('_receipts', `${id}.start.json`);
  const process = read('_receipts', `${id}.process.json`);
  const receipt = read('_receipts', `${id}.json`);
  const manifest = read(id, filenames.manifest);
  const result = read(id, filenames.result);
  const { identity, identityId, mode, scenario, planned, writer, checkReceipt } = manifest;
  const expectedScenario = side === 'rhetoric' ? 'ruler-expand-judge-only' : 'ruler-expand';
  requireThat(start.parameters?.values?.harness === side && scenario === expectedScenario && [receipt, manifest, result].every(row => row.id === id && row.mode === mode && row.scenario === scenario && row.phase === 'ab'), `${side}/${id}: run header mismatch`);
  requireThat(isDeepStrictEqual(identity.harness, { side, preregistrationSha256 }) && identity.phase === 'ab' && identityId === receipt.identityId && identityId === hash({ mode, scenario, identity }), `${side}/${id}: invalid A/B identity`);
  requireThat(isDeepStrictEqual(identity.planned, planned) && isDeepStrictEqual(identity.limits, manifest.limits), `${side}/${id}: plan or limits differ from identity`);
  requireThat(writer.pid === start.pid && writer.startedAt === start.startedAt && !process.error && result.acceptance === process.acceptance && process.exitCode === (result.acceptance ? 0 : 1), `${side}/${id}: writer or process mismatch`);
  requireThat(mode !== 'real' || start.clean && start.parameters.flags.includes('--confirm-cost') && checkReceipt?.head === start.head && checkReceipt.status === 'passed', `${side}/${id}: missing real-run check or cost flag`);
  const dialogue = taskId => {
    const messages = read(id, taskId, 'normal', filenames.transcript);
    requireThat(Array.isArray(messages) && messages.length === 2 * rounds + 1, `${side}/${taskId}: invalid public message count`);
    for (const [i, row] of messages.entries()) {
      requireThat(row.id === `${id}:${taskId}:normal:m:${i + 1}` && row.role === (i % 2 ? 'teacher' : 'learner') && row.turn === Math.ceil(i / 2), `${side}/${taskId}: message chronology mismatch at #${i + 1}`);
      message(row.id, row.role, row.turn, row.text);
    }
    return messages;
  };
  return { id, root, read, start, process, receipt, manifest, result, verification, dialogue };
}

export function requireSameHarnessSetup(baseline, candidate) {
  const fixed = ({ harness, dialogueSource, limits, ...fields }) => fields;
  requireThat(isDeepStrictEqual(fixed(baseline), fixed(candidate)), 'A/B evaluation identity changed outside the permitted harness fields');
  requireThat(candidate.harness.side === 'rhetoric' || isDeepStrictEqual(baseline.limits, candidate.limits), 'A/B generation limits differ from baseline');
}

export function rhetoricDialogue(id, taskId, messages) {
  return messages.map(({ role, turn, text }, i) => message(`${id}:${taskId}:normal:m:${i + 1}`, role, turn,
    role === 'teacher' && turn === rounds ? text + rhetoric : text));
}

export function baselineProvenance({ id, manifest, receipt }) {
  return { runId: id, identityId: manifest.identityId, manifestSha256: receipt.manifestSha256 };
}

export function prepareRhetoric({ sourceRoot, root, mode, id, judgeOnly }, identity) {
  distinctRoots(root, sourceRoot);
  const baseline = readHarnessRun(sourceRoot, judgeOnly, 'baseline');
  requireThat(baseline.manifest.mode === mode && baseline.result.acceptance, 'rhetoric requires a complete baseline of the same mode');
  requireSameHarnessSetup(baseline.manifest.identity, identity);
  const dialogues = new Map(identity.planned.map(({ taskId }) => [`${taskId}:normal`, rhetoricDialogue(id, taskId, baseline.dialogue(taskId))]));
  return { dialogues, provenance: baselineProvenance(baseline) };
}
