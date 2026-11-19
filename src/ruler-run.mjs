import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cellResult, filenames } from '../contracts/artifacts/schema.mjs';
import { executionSuccess, failure, hash, infraFailure, message, requireThat } from '../contracts/core/schema.mjs';
import { loadRulerSplit, readRulerTask, rulerTaskSource, trainingPlan } from '../contracts/dataset/ruler-expand.mjs';
import { policy, rounds, taskId as distanceTask } from '../config/e1.mjs';
import { attemptBudget } from './models.mjs';
import { offlineResponses } from './offline.mjs';
import { evaluationIdentity, executeCell, scenarioName, source, write } from './run.mjs';
import { verifyRun } from './run-receipts.mjs';

const scenario = 'ruler-expand';
const sources = ['contracts/dataset/ruler-expand.mjs', 'src/ruler-run.mjs'];
const maxFailures = 4;
const same = (a, b) => hash(a) === hash(b);
const cellKey = ({ taskId, condition }) => `${taskId}:${condition}`;
const coordinate = ({ taskId, condition }) => ({ taskId, condition });
const transcriptPath = ({ taskId, condition }) => `${taskId}/${condition}/${filenames.transcript}`;

export function admitRulerRun(phase) {
  if (phase !== 'train') trainingPlan(phase);
  const split = loadRulerSplit();
  const planned = trainingPlan(phase, split);
  return { split, planned };
}

export function rulerBudget(planned, judgeOnly) {
  const count = planned.length;
  const attempts = policy.retries + 1;
  if (judgeOnly) return { typicalCalls: count, maxCalls: count * attempts, maxOutputTokens: count * attempts * policy.judge.maxTokens };
  const normal = planned.filter(cell => cell.condition === 'normal').length;
  const learner = count * rounds;
  const teacher = learner + normal * rounds * (policy.teacher.requestsPerTurn - 1);
  return { typicalCalls: learner * 2, maxCalls: (teacher + learner) * attempts, maxOutputTokens: (teacher * policy.teacher.maxTokens + learner * policy.learner.maxTokens) * attempts };
}

function frozenGeneration({ root, mode, judgeOnly: id, phase }, planned, dataset) {
  try {
    const dir = join(root, id);
    const verified = verifyRun(root, id);
    requireThat(verified.verified && [0, 1].includes(verified.exitCode), `invalid source process receipt: ${[...verified.missing, ...verified.invalid].join(', ')}`);
    const processReceipt = JSON.parse(readFileSync(join(root, '_receipts', `${id}.process.json`)));
    const evaluationBytes = readFileSync(join(root, '_receipts', `${id}.json`));
    const evaluation = JSON.parse(evaluationBytes);
    const manifestBytes = readFileSync(join(dir, filenames.manifest));
    const manifest = JSON.parse(manifestBytes);
    const resultBytes = readFileSync(join(dir, filenames.result));
    const result = JSON.parse(resultBytes);
    requireThat(!processReceipt.error && processReceipt.evaluationSha256 === hash(evaluationBytes), 'evaluation receipt is not anchored by the source process receipt');
    requireThat(evaluation.manifestSha256 === hash(manifestBytes) && evaluation.resultSha256 === hash(resultBytes), 'source manifest or result digest mismatch');
    requireThat([evaluation, manifest, result].every(row => row.id === id && row.scenario === scenario && row.phase === phase && row.mode === mode), 'source run ID, scenario, phase or mode mismatch');
    requireThat(manifest.writer?.pid === processReceipt.pid && manifest.identityId === evaluation.identityId && manifest.identityId === hash({ mode, scenario, identity: manifest.identity }), 'source evaluation identity or writer mismatch');
    requireThat(same(manifest.identity.dataset, dataset) && same(manifest.planned, planned) && same(manifest.identity.planned, planned) && manifest.identity.phase === phase, 'source dataset or admitted plan mismatch');
    requireThat(!manifest.source && manifest.budget && same(manifest.limits, manifest.identity.limits), 'invalid source generation manifest');
    requireThat(Array.isArray(result.cells) && result.cells.length <= planned.length && result.cells.every((cell, i) =>
      same(coordinate(cell), planned[i]) && cell.recorded === true && cell.scored === false && cell.validTotal === false
      && (cell.status === executionSuccess && !cell.failure || cell.status === infraFailure && cell.failure?.status === infraFailure)
    ), 'source result does not match the admitted plan');
    const failed = result.cells.filter(cell => cell.status === infraFailure);
    const failedTasks = new Set(failed.map(cell => cell.taskId));
    requireThat(failedTasks.size < maxFailures, 'source already reached the limit of four distinct failed training tasks');
    requireThat(mode !== 'real' || !failed.some(cell => cell.failure.kind === 'budget_exhausted'), 'real scoring cannot resume a budget-stopped generation source');
    requireThat(Array.isArray(evaluation.frozen) && evaluation.frozen.length > 0, 'source has no frozen dialogues');
    const successful = result.cells.filter(cell => cell.status === executionSuccess);
    requireThat(same(evaluation.frozen.map(coordinate), successful.map(coordinate)), 'frozen dialogues do not match successful generation coordinates');
    requireThat(result.acceptance === (successful.length === planned.length) && result.acceptance === processReceipt.acceptance && processReceipt.exitCode === (result.acceptance ? 0 : 1), 'source acceptance does not match generation results');
    const dialogues = new Map(evaluation.frozen.map(entry => {
      const key = cellKey(entry);
      requireThat(entry.path === transcriptPath(entry), `noncanonical transcript path for ${key}`);
      const bytes = readFileSync(join(dir, entry.path));
      requireThat(entry.transcriptSha256 === hash(bytes), `transcript digest mismatch for ${key}`);
      const messages = JSON.parse(bytes);
      requireThat(Array.isArray(messages) && messages.length === 2 * rounds + 1 && same(entry.messageIds, messages.map(m => m.id)), `message count or ID order mismatch for ${key}`);
      for (const [i, m] of messages.entries()) {
        requireThat(m.id === `${id}:${key}:m:${i + 1}` && m.role === (i % 2 ? 'teacher' : 'learner') && m.turn === Math.ceil(i / 2), `message chronology mismatch for ${key}`);
        message(m.id, m.role, m.turn, m.text);
      }
      return [key, messages];
    }));
    return { dialogues, failedTasks, provenance: { runId: id, identityId: evaluation.identityId, manifestSha256: evaluation.manifestSha256, evaluationSha256: hash(evaluationBytes) } };
  } catch (error) {
    throw failure('invalid_input', {}, `judge-only cannot validate the frozen ruler generation: ${error.message}`);
  }
}

export function prepareRulerRun(config) {
  const { split, planned } = config.admission;
  const taskBytes = source(rulerTaskSource);
  const policyBytes = source('data/upstream/policy_situated_tutoring.md');
  requireThat(hash(taskBytes) === split.sourceSha256, 'ruler task source changed after admission');
  const dataset = { trainSha256: split.trainSha256, seed: split.seed };
  const rows = config.judgeOnly ? undefined : JSON.parse(taskBytes);
  const tasks = rows && new Map(planned.map(({ taskId }) => [taskId, readRulerTask(rows, split, taskId)]));
  const identity = evaluationIdentity({ ...config, taskBytes, policyBytes, dataset, sources });
  const frozen = config.judgeOnly ? frozenGeneration(config, planned, identity.dataset) : undefined;
  Object.assign(identity, { phase: config.phase, planned, maxFailures, dialogueSource: frozen?.provenance });
  return { identity, tasks, planned, frozen, operatorPolicy: `${policyBytes.toString('utf8')}\nThe private check_distance tool is optional. Use it only when the learner’s actual problem calls for Euclidean distance. Never invent a distance calculation.` };
}

function trainingFixtures({ taskId, condition }) {
  const responses = offlineResponses(condition);
  if (taskId === distanceTask) return responses;
  if (condition === 'normal') responses.shift();
  for (const [i, response] of responses.slice(0, -1).entries()) {
    const text = response.content.find(block => block.type === 'text');
    text.text = i % 2
      ? JSON.stringify({ text: 'Offline learner fixture.' })
      : 'Offline tutor fixture.';
  }
  return responses;
}

export async function runRuler({ mode, root, id, phase, judgeOnly, checkReceipt, limits, recorder }, prepared) {
  const { planned, identity, tasks, frozen, operatorPolicy } = prepared;
  const runScenario = scenarioName({ scenario, judgeOnly });
  const runDir = join(root, id);
  mkdirSync(root, { recursive: true });
  try { mkdirSync(runDir); }
  catch (error) {
    if (error.code === 'EEXIST') throw failure('run_conflict', { runDir }, `run directory already exists: ${runDir}`);
    throw error;
  }
  const writer = { pid: recorder.start.pid, startedAt: recorder.start.startedAt };
  const budget = rulerBudget(planned, judgeOnly);
  const reserve = attemptBudget(limits);
  const base = { scenario: runScenario, phase, id, mode };
  const identityId = hash({ mode, scenario: runScenario, identity });
  const manifestPath = join(runDir, filenames.manifest);
  write(manifestPath, { ...base, identity, identityId, planned, budget, limits, writer, checkReceipt, source: frozen?.provenance });
  const cells = [], freezes = [], graded = [];
  const failedTasks = new Set(frozen?.failedTasks);
  for (const coordinate of planned) {
    const { taskId, condition } = coordinate;
    const messages = frozen?.dialogues.get(cellKey(coordinate));
    if (judgeOnly && !messages) continue;
    let outcome;
    try {
      outcome = await executeCell({
        runDir, id, variant: condition, coordinate, task: tasks?.get(taskId), operatorPolicy, mode, reserve, recorder, writer,
        generateOnly: !judgeOnly, frozen: messages, judgeOnly, fixtures: mode === 'offline' ? trainingFixtures(coordinate) : undefined,
      });
      if (!judgeOnly && !outcome.failure) {
        const path = transcriptPath(coordinate);
        freezes.push({ ...coordinate, path, transcriptSha256: hash(readFileSync(join(runDir, path))), messageIds: outcome.messages.map(m => m.id) });
      }
      if (judgeOnly && !outcome.failure) {
        const path = `${taskId}/${condition}/${filenames.judge}`;
        graded.push({ ...coordinate, path, sha256: hash(readFileSync(join(runDir, path))) });
      }
    } catch (error) { outcome = { failure: failure('artifact_io', coordinate, error.message).failure }; }
    if (outcome.failure || judgeOnly) cells.push({ ...cellResult(condition, outcome.scores, outcome.failure), ...coordinate });
    else cells.push({ ...coordinate, recorded: true, status: executionSuccess, scored: false, validTotal: false });
    if (outcome.failure) {
      failedTasks.add(taskId);
      if (failedTasks.size >= maxFailures || outcome.failure.kind === 'budget_exhausted') break;
    }
  }
  const acceptance = failedTasks.size === 0 && cells.length === planned.length && (!judgeOnly || cells.every(cell => cell.validTotal));
  const result = { ...base, runDir, acceptance, cells };
  const resultPath = join(runDir, filenames.result);
  write(resultPath, result);
  const receipt = {
    ...base, runDir, result: filenames.result, acceptance, identityId,
    manifestSha256: hash(readFileSync(manifestPath)), resultSha256: hash(readFileSync(resultPath)),
    ...(judgeOnly ? { source: frozen.provenance, graded } : { frozen: freezes }),
  };
  recorder.publishEvaluation(receipt);
  return result;
}

export function publicRulerResult(result) {
  const { cells, ...summary } = result;
  return { ...summary, cells: cells.map(({ taskId, condition, recorded, status, scored, validTotal }) => ({ taskId, condition, recorded, status, scored, validTotal })) };
}
