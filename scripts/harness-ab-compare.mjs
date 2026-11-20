import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { filenames, runId } from '../contracts/artifacts/schema.mjs';
import { executionSuccess, hash, infraFailure, requireThat } from '../contracts/core/schema.mjs';
import { loadRulerSplit } from '../contracts/dataset/ruler-expand.mjs';
import { bind, dimensions } from '../contracts/judge/schema.mjs';
import { baselineProvenance, distinctRoots, harnessPlan, harnessSeed, harnessSides, readHarnessRun, requireSameHarnessSetup, rhetoricDialogue } from '../src/harness-ab.mjs';
import { loadRulerFreeze, requireFrozenIdentity } from '../src/ruler-freeze.mjs';

const targets = ['agency_handoff', 'representation_pivot'];
const metrics = [...dimensions, 'total'];
const sum = values => values.reduce((a, b) => a + b, 0);

export function pairedEstimate(pairs, planned) {
  const groups = Object.values(Object.groupBy(pairs, pair => pair.family));
  const n = pairs.length;
  const mean = n ? sum(pairs.map(pair => pair.delta)) / n : null;
  let ci95 = null;
  if (groups.length >= 2) {
    const draws = Array.from({ length: 2000 }, (_, i) => {
      const sample = groups.flatMap((_, j) => groups[parseInt(hash(`${harnessSeed}:ci:${i}:${j}`).slice(0, 8), 16) % groups.length]);
      return sum(sample.map(pair => pair.delta)) / sample.length;
    }).sort((a, b) => a - b);
    ci95 = [0.025, 0.975].map(p => {
      const index = p * (draws.length - 1), left = Math.floor(index);
      return draws[left] + (index - left) * (draws[left + 1] - draws[left]);
    });
  }
  return { planned, n, families: groups.length, mean, ci95 };
}

function sideEvidence(run, planned, side) {
  const { id, manifest, result, root, read, start, verification } = run;
  requireThat(isDeepStrictEqual(manifest.planned, planned), `${side}: differs from the locked 10-task plan`);
  requireThat(Array.isArray(result.cells) && result.cells.length <= planned.length && result.cells.every((cell, i) => cell.recorded === true &&
    cell.taskId === planned[i].taskId && cell.condition === planned[i].condition &&
    (cell.validTotal === true && cell.scored === true && cell.status === executionSuccess && !cell.failure || cell.validTotal === false && cell.scored === false && cell.status === infraFailure && cell.failure?.status === infraFailure)), `${side}: invalid result cells or plan order`);
  requireThat(result.acceptance === (result.cells.length === planned.length && result.cells.every(cell => cell.validTotal)), `${side}: acceptance contradicts valid cells`);
  const { limits } = manifest;
  const entries = new Map(), attempts = new Map();
  for (const cell of result.cells) {
    const { taskId, condition, status, failure } = cell;
    const path = join(id, taskId, condition);
    const row = { status, ...(failure && { failure }), path };
    entries.set(taskId, row);
    const telemetryPath = join(path, filenames.telemetry);
    const telemetry = !cell.validTotal && !existsSync(join(root, telemetryPath)) ? [] : read(telemetryPath);
    for (const sample of telemetry) {
      const { role, turn, call, attempt, pid, requestLimit } = sample;
      const key = `${taskId}:${condition}:${role}:${turn}:${call}:${attempt}`;
      requireThat(pid === start.pid && sample.taskId === taskId && sample.condition === condition && !attempts.has(key) &&
        ['teacher', 'learner', 'judge'].includes(role) && (side !== 'rhetoric' || role === 'judge') &&
        [turn, call, attempt, requestLimit].every(n => Number.isSafeInteger(n) && n > 0), `${side}/${key}: invalid telemetry or writer PID`);
      attempts.set(key, sample);
    }
    if (!cell.validTotal) continue;
    const messages = run.dialogue(taskId);
    const { binding, groups } = read(path, filenames.judge);
    requireThat(binding.runId === id && binding.taskId === taskId && binding.condition === condition && binding.cell === condition && binding.ruler === manifest.identity.ruler &&
      binding.viewHash === bind(messages).id && isDeepStrictEqual(binding.messageIds, messages.map(message => message.id)), `${side}/${taskId}: judge binding differs from transcript`);
    const scores = Object.fromEntries(dimensions.map(key => [key, (groups.teaching[key] ?? groups.consolidation[key])?.score]));
    requireThat(Object.values(scores).every(score => [0, 1, 2].includes(score)) && sum(Object.values(scores)) === cell.total, `${side}/${taskId}: invalid dimension score or total`);
    row.scores = { ...scores, total: cell.total };
  }

  const lines = readFileSync(join(root, '_receipts', `${id}.requests.jsonl`), 'utf8').trim();
  const started = lines ? lines.split('\n').map(line => JSON.parse(line)).filter(event => event.type === 'request_start') : [];
  const sent = new Set(started.map(event => event.callId));
  requireThat(sent.size === started.length && [...sent].every(callId => attempts.has(callId)), `${side}: request log and telemetry differ`);
  const used = [...sent].map(callId => attempts.get(callId));
  const requestedOutputTokens = sum(used.map(sample => sample.requestLimit));
  const recordedReservedOutputTokens = sum([...attempts.values()].map(sample => manifest.identity.policy[sample.role].maxTokens));
  requireThat(attempts.size <= limits.maxAttempts && requestedOutputTokens <= limits.maxRequestedOutputTokens && recordedReservedOutputTokens <= limits.maxRequestedOutputTokens, `${side}: attempt budget exceeded`);
  const reported = used.filter(sample => Number.isSafeInteger(sample.usage?.totalTokens) && sample.usage.totalTokens >= 0);
  return { entries, summary: {
    root, id, identityId: manifest.identityId, head: start.head, pid: start.pid, verification, stop: result.stop,
    limits, requestCount: started.length, requestedOutputTokens, recordedReservedOutputTokens, reportedTokens: sum(reported.map(sample => sample.usage.totalTokens)),
    requestsWithUnknownUsage: used.length - reported.length,
    retries: used.filter(sample => sample.attempt > 1).length, attemptsWithoutRequest: attempts.size - used.length,
    callFailures: [...attempts.values()].filter(sample => sample.failureKind).map(({ taskId, role, turn, call, attempt, attemptPath, failureKind, detail }) => ({ taskId, role, turn, call, attempt, attemptPath, failureKind, detail })),
  } };
}

function startedRun({ root, id }, side) {
  runId(id);
  const artifacts = ['start.json', 'process.json', 'requests.jsonl'].map(suffix => join(root, '_receipts', `${id}.${suffix}`));
  artifacts.push(join(root, '_receipts', `${id}.json`), join(root, id));
  if (artifacts.some(existsSync)) return readHarnessRun(root, id, side);
}

export function compareHarnessRuns(inputs) {
  distinctRoots(...harnessSides.map(side => inputs[side].root).filter(existsSync));
  const runs = harnessSides.map(side => startedRun(inputs[side], side));
  const [baseline, improved, rhetoric] = runs;
  const present = runs.filter(Boolean);
  requireThat(present.every((run, i) => run === runs[i]), 'A/B sides must start in registered order');
  const mode = baseline?.manifest.mode ?? null;
  const split = loadRulerSplit();
  const planned = harnessPlan(split);
  if (baseline) {
    const { identity } = baseline.manifest;
    const freeze = loadRulerFreeze(identity.freeze?.decisionCommit);
    requireThat(isDeepStrictEqual(identity.freeze, freeze) && identity.dataset.testSha256 === freeze.testSha256 && identity.dataset.splitSha256 === freeze.splitSha256, 'baseline freeze or dataset mismatch');
    requireFrozenIdentity(freeze, identity);
    for (const [i, candidate] of present.slice(1).entries()) {
      requireThat(candidate.manifest.mode === mode && candidate.start.head === baseline.start.head && Date.parse(candidate.start.startedAt) >= Date.parse(runs[i].process.endedAt), 'A/B sides must have the same mode and HEAD and run serially in registered order');
      requireSameHarnessSetup(identity, candidate.manifest.identity);
    }
    requireThat(new Set(present.map(run => run.manifest.identityId)).size === present.length && !identity.dialogueSource && !improved?.manifest.identity.dialogueSource &&
      (!rhetoric || isDeepStrictEqual(rhetoric.manifest.identity.dialogueSource, baselineProvenance(baseline))), 'invalid experiment identities or rhetoric baseline provenance');
  }
  const evidence = Object.fromEntries(harnessSides.map((side, i) => [side, runs[i]
    ? sideEvidence(runs[i], planned, side)
    : { summary: { ...inputs[side], status: 'not_run' } }]));
  const tasks = planned.map(({ taskId }) => {
    const sides = Object.fromEntries(harnessSides.map(side => [side, evidence[side].entries?.get(taskId) ?? { status: 'not_run' }]));
    if (sides.rhetoric.scores) requireThat(sides.baseline.scores && isDeepStrictEqual(rhetoric.dialogue(taskId), rhetoricDialogue(rhetoric.id, taskId, baseline.dialogue(taskId))), `${taskId}: rhetoric changed more than the registered suffix`);
    const delta = Object.fromEntries(['improved', 'rhetoric'].map(side => [side, Object.fromEntries(metrics.map(key => [key,
      sides.baseline.scores && sides[side].scores ? sides[side].scores[key] - sides.baseline.scores[key] : null,
    ]))]));
    return { taskId, family: split.items[taskId].family, sides, delta };
  });
  const comparisons = Object.fromEntries(['improved', 'rhetoric'].map(side => {
    const estimates = Object.fromEntries(metrics.map(key => [key, pairedEstimate(tasks.filter(row => row.delta[side][key] !== null)
      .map(row => ({ family: row.family, delta: row.delta[side][key] })), planned.length)]));
    const thresholdKeys = side === 'improved' ? dimensions : [...targets, 'total'];
    const meetsScoreExpectation = thresholdKeys.some(key => estimates[key].mean === null) ? null : thresholdKeys.every(key => side === 'rhetoric'
      ? estimates[key].mean <= 0 : targets.includes(key) ? estimates[key].mean > 0 : estimates[key].mean >= -0.3);
    return [side, { metrics: estimates, meetsScoreExpectation }];
  }));
  return { mode, targets, sides: Object.fromEntries(harnessSides.map(side => [side, evidence[side].summary])), auditTaskIds: planned.slice(0, 5).map(row => row.taskId), tasks, comparisons };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(harnessSides.flatMap(side => ['root', 'id'].map(key => [`${side}-${key}`, { type: 'string' }]))) });
    const inputs = Object.fromEntries(harnessSides.map(side => [side, { root: values[`${side}-root`], id: values[`${side}-id`] }]));
    requireThat(harnessSides.every(side => inputs[side].root && inputs[side].id), 'provide --<side>-root and --<side>-id for baseline, improved and rhetoric');
    process.stdout.write(`${JSON.stringify(compareHarnessRuns(inputs), null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
