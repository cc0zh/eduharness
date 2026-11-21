import { isDeepStrictEqual as same } from 'node:util';
import { policy, rounds, routes, taskId } from '../config/e1.mjs';
import { targets } from '../config/e2.mjs';
import { judgeCandidates } from '../config/judge-contrast.mjs';
import { reasoningOffPolicy } from '../config/judge-reasoning-off.mjs';
import { binaryCellResult, binaryRulingResult, cellIds, cellResult } from '../contracts/artifacts/schema.mjs';
import { hash, message, requireThat } from '../contracts/core/schema.mjs';
import { bindBinary, binaryIdentityVersion, binaryOutputContract, binaryRuler, parseBinaryJudgement } from '../contracts/judge/binary.mjs';
import { bind, directDimension, dimensions, parseNumberedJudgement, rubric } from '../contracts/judge/schema.mjs';
import { assessS1, s1Path, s1Plan, s1Scenario } from './s1-binary-plan.mjs';
import { contrastBudget, contrastFolders, judgeContrastScenario } from './judge-contrast-plan.mjs';
import { matchesJudgeParameters, matchesReportedRoute } from './judge-transport.mjs';

export const batchVersion = 'cell-batch-v1';
const binaryScenario = scenario => scenario === s1Scenario || scenario === judgeContrastScenario;
export const supportedBatch = scenario => ['E1', 'E1-judge-only', 'E2', 'E2-judge-only', s1Scenario, judgeContrastScenario].includes(scenario);
export function batchFolders({ scenario, planned }) {
  if (scenario === s1Scenario) return planned.map(s1Path);
  if (scenario === judgeContrastScenario) return planned.map(row => row.id);
  return planned;
}
export const cellId = folder => folder.replace('/', ':');
export const callIdFor = (folder, { role, turn, call, attempt }) => `${cellId(folder)}:${role}:${turn}:${call}:${attempt}`;
export const attemptFile = (folder, { role, turn, call, attempt }) => `${folder}/calls/${role}-${turn}-${call}-${attempt}.json`;
export const covers = (limits, used, limit) => used.attempts < limits.maxAttempts && used.requestedOutputTokens + limit <= limits.maxRequestedOutputTokens;

export function batchPolicy({ scenario, identity, source, mode }) {
  if (scenario === judgeContrastScenario) {
    const candidate = Object.hasOwn(judgeCandidates, identity.judgePolicy) && judgeCandidates[identity.judgePolicy];
    requireThat(source && candidate && same(identity.policy, candidate.policy)
      && same(identity.routes, mode === 'real' ? { judge: candidate.route } : 'pi-ai-faux'), 'invalid judge contrast policy or route');
    return candidate.policy;
  }
  if (same(identity.policy, policy)) return policy;
  requireThat(source && ['E1-judge-only', 'E2-judge-only', s1Scenario].includes(scenario)
    && same(identity.policy, reasoningOffPolicy), 'invalid batch call policy');
  return reasoningOffPolicy;
}

export function validateBatchPlan(manifest) {
  const { scenario, identity, identityId, mode, planned } = manifest;
  const contrast = scenario === judgeContrastScenario;
  requireThat(supportedBatch(scenario) && manifest.taskId === taskId, 'invalid batch scenario or task');
  const expected = scenario === 'E1' ? ['normal', 'answer_dump'] : scenario === 'E1-judge-only' ? ['normal']
    : scenario === 'E2-judge-only' && same(planned, ['no_teach']) ? ['no_teach'] : contrast ? planned : scenario === s1Scenario ? s1Plan : cellIds;
  requireThat(same(planned, expected) && same(identity.planned, expected), 'batch plan differs from evaluation identity');
  requireThat(identityId === hash({ mode, scenario, identity }) && same(identity.limits, manifest.limits) && same(identity.dialogueSource, manifest.source), 'evaluation identity or budget mismatch');
  const callPolicy = batchPolicy(manifest);
  if (contrast) {
    requireThat(same(batchFolders(manifest), contrastFolders) && same(manifest.budget, contrastBudget(callPolicy)), 'judge contrast sample plan or budget differs');
    for (const [i, row] of planned.entries()) {
      const coordinate = s1Plan[i];
      requireThat(row.repetition === coordinate?.repetition && row.condition === coordinate?.condition
        && /^[a-f0-9]{64}$/.test(row.transcriptSha256) && typeof row.sourceRunId === 'string', `invalid frozen sample ${row.id}`);
    }
  }
  const { maxAttempts, maxRequestedOutputTokens } = manifest.limits;
  requireThat([maxAttempts, maxRequestedOutputTokens].every(n => Number.isSafeInteger(n) && n > 0) && maxAttempts <= manifest.budget.maxCalls && maxRequestedOutputTokens <= manifest.budget.maxOutputTokens, 'invalid registered limits');
  if (binaryScenario(scenario)) requireThat(identity.version === binaryIdentityVersion && identity.ruler === binaryRuler && identity.judgeOutputContract === binaryOutputContract, 'binary identity version mismatch');
}

export function retryClass(policy, meter) {
  if (policy.retriesPerKind === undefined || !meter?.failureKind || meter.failureKind === 'configuration') return;
  if (meter.rateLimited) return 'rate_limited';
  return meter.detail === 'local request timeout' ? 'local_timeout' : meter.failureKind;
}

export function retryStop(policy, meter, retries, callId) {
  const failureKind = retryClass(policy, meter);
  if (failureKind && retries.get(failureKind) >= policy.retriesPerKind) {
    return { kind: 'failure_kind_retries_exhausted', failureKind, callId };
  }
}

export function attemptStop(policy, meter, retries) {
  if (policy.retriesPerKind !== undefined && meter.failureKind === 'configuration') return { kind: 'configuration', callId: meter.callId };
  return retryStop(policy, meter, retries, meter.callId) ?? (meter.failureKind && !meter.rateLimited && meter.retryCount === policy.retries
    ? { kind: 'call_retries_exhausted', callId: meter.callId } : undefined);
}

export function cellRow(manifest, folder, outcome) {
  const [repetition, condition] = folder.split('/');
  if (binaryScenario(manifest.scenario) && condition) return { repetition, ...binaryCellResult(condition, outcome.verdict?.scoring, outcome.failure) };
  if (manifest.scenario === judgeContrastScenario) return binaryRulingResult(folder, outcome.verdict?.scoring, outcome.failure);
  return cellResult(repetition, outcome.scores, outcome.failure);
}

export function verifyDialogue(manifest, folder, messages, transcriptSha256) {
  if (manifest.scenario === judgeContrastScenario) {
    const sample = manifest.planned.find(row => row.id === folder);
    requireThat(sample?.transcriptSha256 === transcriptSha256 && messages.length === 2 * rounds + 1, `frozen transcript mismatch at ${folder}`);
    bindBinary(messages);
    return;
  }
  const [rep, condition] = folder.split('/');
  const frozen = manifest.source;
  const provenance = frozen?.cells?.find(row => row.cell === (condition ?? rep)) ?? frozen;
  if (frozen) requireThat(transcriptSha256 === provenance.transcriptSha256 && messages.length === 2 * rounds + 1, `frozen transcript mismatch at ${folder}`);
  requireThat(Array.isArray(messages) && messages.length <= 2 * rounds + 1, `invalid dialogue length at ${folder}`);
  for (const [i, row] of messages.entries()) {
    const prefix = frozen ? `${frozen.runId}:${condition ?? rep}` : `${manifest.id}:${cellId(folder)}`;
    requireThat(row.id === `${prefix}:m:${i + 1}` && row.role === (i % 2 ? 'teacher' : 'learner') && row.turn === Math.ceil(i / 2), `transcript chronology mismatch at ${folder} message ${i + 1}`);
    message(row.id, row.role, row.turn, row.text);
  }
}

export function replayJudge(manifest, folder, messages, row, raw) {
  const label = `${row.callId} (process ${row.processIndex})`;
  const binary = binaryScenario(manifest.scenario);
  const contrast = manifest.scenario === judgeContrastScenario;
  const [rep, condition] = folder.split('/');
  const view = binary ? bindBinary(messages) : bind(messages);
  const sourceRunId = contrast ? manifest.planned.find(row => row.id === folder)?.sourceRunId : manifest.source?.runId;
  const binding = { runId: manifest.id, cell: condition ?? rep, ruler: manifest.identity.ruler, viewHash: view.id, messageIds: messages.map(m => m.id),
    ...(sourceRunId && { sourceRunId }), ...(binary && condition && { repetition: rep }) };
  requireThat(same(raw.binding, binding) && same(row.binding, binding), `judge binding mismatch at ${label}`);
  const request = JSON.parse(raw.context.messages.at(-1).content);
  const window = messages.map(({ role, text }, i) => ({ n: i + 1, role, text }));
  requireThat(same(request, binary ? { messages: window } : { late_third_start: view.lateStart + 1, rubric, messages: window }), `judge request does not match transcript at ${label}`);
  if (raw.outbound) {
    const { max_tokens, max_completion_tokens, reasoning, parameterNames } = raw.outbound;
    const judge = manifest.identity.policy.judge;
    const route = contrast ? manifest.identity.routes.judge : routes.judge;
    requireThat(route && matchesJudgeParameters(raw.outbound, parameterNames, route, judge)
      && (max_tokens ?? max_completion_tokens) === row.requestLimit && row.reasoningLimit === (reasoning?.max_tokens ?? null), `outbound judge parameters mismatch at ${label}`);
    if (contrast) {
      requireThat(row.model === route.id && row.provider === route.provider, `judge route metadata differs at ${label}`);
      const mismatch = !matchesReportedRoute(route, row.reportedProvider, row.reportedModel);
      requireThat(mismatch === (row.failureKind === 'configuration' && row.detail === 'response judge route mismatch'), `response judge route mismatch at ${label}`);
    }
  }
  if (row.failureKind) return;
  requireThat(manifest.mode !== 'real' || raw.outbound, `successful judge missing outbound parameters at ${label}`);
  if (contrast) requireThat(raw.response.stopReason === 'stop' && !raw.response.content.some(block => block.type === 'toolCall'), `judge did not terminate normally at ${label}`);
  const text = raw.response.content.filter(block => block.type === 'text').map(block => block.text).join('');
  const published = { binding: { ...binding, role: 'judge', turn: rounds, call: 1, attempt: row.attempt, attemptPath: row.attemptPath } };
  if (binary) return { verdict: parseBinaryJudgement(text, view), ...published };
  const audit = [];
  const scores = parseNumberedJudgement(text, view, audit);
  requireThat(same(audit, row.originalOrder), `judge normalization differs at ${label}`);
  return {
    groups: {
      teaching: Object.fromEntries(dimensions.slice(0, 4).map(key => [key, scores[key]])),
      consolidation: Object.fromEntries(dimensions.slice(4).map(key => [key, scores[key]])),
    }, ...published,
  };
}

export function numericScores(judgement) {
  const scores = { ...judgement.groups.teaching, ...judgement.groups.consolidation };
  return { all: dimensions.map(key => scores[key].score), direct: scores[directDimension].score };
}

export function projectResult(manifest, runDir, selected) {
  const { scenario, taskId, id, mode, source } = manifest;
  const folders = batchFolders(manifest);
  const cells = folders.flatMap(folder => selected.has(folder) ? [selected.get(folder).row] : []);
  const complete = cells.length === folders.length && cells.every(cell => cell.validTotal);
  if (scenario === s1Scenario) return { id, scenario, taskId, mode, runDir, acceptance: complete, cells, assessment: assessS1(cells) };
  if (scenario === judgeContrastScenario) return { id, scenario, taskId, mode, runDir, acceptance: complete, cells };
  const comparisons = scenario.startsWith('E2') && folders.length > 1 ? Object.entries(targets).map(([cell, dimension]) => {
    const side = folder => {
      const item = selected.get(folder);
      if (!item?.judgement) return null;
      const { groups, binding } = item.judgement;
      const row = groups.teaching[dimension] ?? groups.consolidation[dimension];
      const references = row.evidence.map(id => {
        const index = binding.messageIds.indexOf(id);
        const { turn, role } = item.messages[index];
        return { id, number: index + 1, turn, role };
      });
      return { score: row.score, references };
    };
    const normal = side('normal'), variant = side(cell);
    return { cell, dimension, normal, variant, delta: normal && variant ? normal.score - variant.score : null };
  }) : undefined;
  const acceptance = complete && (comparisons ? comparisons.every(row => row.delta >= 1 && row.normal.references.length && row.variant.references.length)
    : Boolean(source) || cells[0].directAnswer - cells[1].directAnswer >= 1);
  return { scenario, taskId, mode, runDir, directDimension, acceptance, cells, ...(comparisons && { comparisons }) };
}
