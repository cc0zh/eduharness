import { readFileSync } from 'node:fs';
import { policy, rounds, routes } from '../config/e1.mjs';
import { learnerFixArms } from '../config/hard-learners.mjs';
import { agencyAudit, observerPolicy, observerRoute, stage3Concurrency, stage3DevRoot, stage3DevTasks, stage3ProxySource, stage3Scenario } from '../config/stage3.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { hardProfileIdentity } from '../contracts/learner/profiles.mjs';
import { evaluationIdentity, source } from './run.mjs';
import { createAdmissionLedger } from './stage2b-ledger.mjs';
import { loadStage2bDev, stage2bCallId, stage2bCallPath, stage2bManifestSha, stage2bStudents } from './stage2b-plan.mjs';
import { stage3Arms } from './stage3-audit.mjs';
import { stage3Fixtures } from './stage3-fixtures.mjs';
import { splitStopRules } from './split-judge-state.mjs';
import { workingJudge, workingJudgeFingerprint, workingJudgeFingerprintFiles } from './working-judge.mjs';

export { stage2bCallId as stage3CallId, stage2bCallPath as stage3CallPath };
export const stage3HardLearner = learnerFixArms.a;
const stage3Pairs = () => stage3DevTasks.length * stage2bStudents.length;
export const stage3Stop = () => splitStopRules(stage3Pairs() * stage3Arms.length);
const agencyCall = splitDimensions.indexOf('agency_handoff') + 1;
const generationAttempts = policy.retries + 1;
const budgetsByRole = () => ({ teacher: policy.teacher.maxTokens, learner: policy.learner.maxTokens, judge: workingJudge.policy.judge.maxTokens,
  teacher_observer: observerPolicy.maxTokens, agency_audit: agencyAudit.policy.maxTokens });
const maxAttempts = (role, call) => role === 'teacher_observer' || role === 'agency_audit' || role === 'judge' && call === agencyCall ? 1 : generationAttempts;
const roleCalls = { teacher: policy.teacher.requestsPerTurn, learner: 1, judge: splitDimensions.length, teacher_observer: 1, agency_audit: 1 };

export const stage3Budget = () => {
  const n = stage3Pairs();
  const roleLimits = budgetsByRole();
  const byRole = {
    teacher: 2 * n * rounds * roleCalls.teacher * maxAttempts('teacher'),
    learner: 2 * n * rounds * maxAttempts('learner'),
    judge: 3 * n * splitDimensions.reduce((sum, _, i) => sum + maxAttempts('judge', i + 1), 0),
    teacher_observer: n * rounds,
    agency_audit: n + n * stage3Arms.length,
  };
  return { byRole, maxAttempts: Object.values(byRole).reduce((a, b) => a + b, 0),
    maxRequestedOutputTokens: Object.entries(byRole).reduce((n, [role, count]) => n + roleLimits[role] * count, 0) };
};

export function stage3Ledger(limits, persist = () => {}) {
  return createAdmissionLedger(limits, stage3Concurrency, persist, { roleLimits: budgetsByRole(), stopRules: stage3Stop(), callIdFor: stage2bCallId,
    calls: role => roleCalls[role], maxAttempts,
    allowedTurn: (role, turn) => turn >= 1 && turn <= rounds && (!['judge', 'agency_audit'].includes(role) || turn === rounds) });
}

export const stage3Folder = (arm, taskId, student) => `${arm}/${taskId}/${student}`;
export const stage3Plan = dev => dev.flatMap(({ id: taskId, family }) => stage2bStudents.flatMap(student => stage3Arms.map(arm => ({
  arm, taskId, family, student, folder: stage3Folder(arm, taskId, student),
}))));

export function judgementManifest(manifest, folder) {
  return { ...manifest, identity: { ...manifest.identity, policy: manifest.identity.judgeCallPolicy, judgeTransport: manifest.identity.judgeTransport ?? undefined },
    planned: [{ id: folder, sourceRunId: manifest.id }] };
}

export function readStage3Method() {
  const method = readFileSync(new URL('../docs/research/stage3/preregistration.md', import.meta.url));
  const lock = readFileSync(new URL('../docs/research/stage3/preregistration.sha256', import.meta.url), 'utf8').trimEnd();
  const sha = hash(method);
  requireThat(lock === `${sha}  preregistration.md`, 'stage 3 preregistration differs from its SHA256 lock');
  return { method, sha };
}

const additionalSources = () => [...workingJudgeFingerprintFiles, 'config/stage2b-headroom.mjs', 'config/hard-learners.mjs', 'config/stage3.mjs', 'contracts/teacher/observation.mjs',
  'contracts/teacher/handoff.mjs', 'src/teacher/state-machine.mjs', 'src/stage2b-plan.mjs', 'src/stage2b-ledger.mjs',
  ...['plan', 'fixtures', 'audit', 'report', 'run', 'verification'].map(part => `src/stage3-${part}.mjs`)];
export function prepareStage3(mode, edition, registered) {
  const real = mode === 'real';
  const { tasks, dev, manifestSha256 } = real
    ? loadStage2bDev({ primary: stage3DevRoot, manifestSha256: stage2bManifestSha, dev: stage3DevTasks }) : stage3Fixtures.corpus();
  const planned = stage3Plan(dev);
  const operatorPolicy = source('data/upstream/policy_situated_tutoring.md');
  const dataset = { split: real ? 'dev' : 'synthetic', dev, manifestSha256, operatorPolicySha256: hash(operatorPolicy),
    openings: Object.fromEntries(dev.map(({ id }) => [id, hash(tasks.get(id).user_scenario.instructions.task_instructions)])) };
  const budget = stage3Budget();
  const { maxAttempts, maxRequestedOutputTokens } = budget;
  const limits = { maxAttempts, maxRequestedOutputTokens };
  const base = evaluationIdentity({ mode, dataset, limits, sources: additionalSources() });
  const identity = { ...base, version: 'stage3-dev-v1', edition, ruler: workingJudge.ruler, judgeOutputContract: workingJudge.judgeOutputContract,
    judgePolicy: workingJudge.judgePolicy, judgeFingerprint: workingJudgeFingerprint(base.sources), judgeTransport: real ? workingJudge.judgeTransport : null,
    routes: real ? { ...routes, judge: workingJudge.routes.judge, teacher_observer: observerRoute, agency_audit: agencyAudit.route } : 'pi-ai-faux',
    rounds, planned, concurrency: stage3Concurrency, stop: stage3Stop(), preregistrationSha256: registered.sha,
    observerPolicy, auditPolicy: agencyAudit.policy, auditProxySource: real ? stage3ProxySource : null, judgeCallPolicy: workingJudge.policy, singleAgencyDecision: true,
    students: Object.fromEntries(stage2bStudents.map(student => [student, student === 'default' ? { thinking: policy.learner.thinking, jsonMode: false }
      : { jsonMode: true, ...stage3HardLearner, profileSha256: hardProfileIdentity(student, stage3HardLearner.antiSelfFalsification) }])),
  };
  return { identity, identityId: hash({ mode, scenario: stage3Scenario, identity }), budget, limits, planned, tasks, operatorPolicy: operatorPolicy.toString('utf8'), method: registered.method };
}
