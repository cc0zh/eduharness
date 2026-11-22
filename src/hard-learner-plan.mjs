import { developmentTopics, fidelityConditions, hardLearnerScenario, learnerFixArms } from '../config/hard-learners.mjs';
import { policy, rounds } from '../config/e1.mjs';
import { fidelityAuditPolicies } from '../config/fidelity-audit.mjs';
import { hash, message } from '../contracts/core/schema.mjs';
import { hardProfileIdentity, hardProfileIds } from '../contracts/learner/profiles.mjs';

export const registrationFile = 'preregistration.md';
export const fidelityIdentityVersion = 'hard-learner-fidelity-v2';
export const learnerFixIdentityVersion = 'hard-learner-fidelity-v3';
export const learnerOutputProtocol = Object.freeze({ responseFormat: 'json_object', cleanup: 'bounded-json-v1', ambiguousControlEscapes: 'reject' });
export const fidelityStopRules = Object.freeze({ maxReplyRetries: policy.retries, consecutiveProviderFailures: 3, consecutiveReplyFailures: 3, totalReplyFailures: 8 });

export function initialFidelityStopState() {
  return { consecutiveProviderFailures: 0, consecutiveReplyFailures: 0, totalReplyFailures: 0 };
}

export function advanceFidelityStopState(state, outcome, rules = fidelityStopRules) {
  if (outcome.type === 'call') {
    const consecutiveProviderFailures = outcome.failureKind === 'provider_failure' ? state.consecutiveProviderFailures + 1 : 0;
    return { state: { ...state, consecutiveProviderFailures },
      stopRule: consecutiveProviderFailures >= rules.consecutiveProviderFailures ? 'provider_failure_streak' : null };
  }
  if (outcome.type === 'reply') {
    const consecutiveReplyFailures = outcome.failed ? state.consecutiveReplyFailures + 1 : 0;
    const totalReplyFailures = state.totalReplyFailures + Number(outcome.failed);
    const stopRule = consecutiveReplyFailures >= rules.consecutiveReplyFailures ? 'consecutive_reply_failures'
      : totalReplyFailures >= rules.totalReplyFailures ? 'total_reply_failures' : null;
    return { state: { ...state, consecutiveReplyFailures, totalReplyFailures }, stopRule };
  }
  throw new TypeError('unknown fidelity stop outcome');
}

export const fidelityPlan = [1, 2].flatMap(repetition => Object.keys(developmentTopics).flatMap(taskId =>
  hardProfileIds.map(profileId => ({ repetition, taskId, profileId })),
)).map((group, i) => {
  const offset = i % fidelityConditions.length;
  const order = [...fidelityConditions.slice(offset), ...fidelityConditions.slice(0, offset)];
  return { ...group, conditions: order };
});

const pilotBlocks = [
  ['S0-01', 'pretender', 'independent', [1, 2, 3, 4]],
  ['S0-01', 'stubborn', 'independent', [1, 2, 3, 4]],
  ['S0-06', 'pretender', 'targeted', [1]],
  ['S0-06', 'stubborn', 'targeted', [1]],
];
const arms = Object.keys(learnerFixArms);
const pilotPlan = pilotBlocks.flatMap(([taskId, profileId, condition, repetitions], i) =>
  [...arms.slice(i), ...arms.slice(0, i)].map(arm => ({ arm, repetitions, taskId, profileId, conditions: [condition] })));

export const fidelityPlanFor = learnerFix => learnerFix === 'pilot' ? pilotPlan : fidelityPlan;
export const profilesFor = antiSelfFalsification => Object.fromEntries(hardProfileIds.map(id => [id, hardProfileIdentity(id, antiSelfFalsification)]));
export function learnerFixStudents(learnerFix) {
  return Object.fromEntries((learnerFix === 'pilot' ? arms : [learnerFix]).map(arm => {
    const settings = learnerFixArms[arm];
    const student = { ...settings, profiles: profilesFor(settings.antiSelfFalsification) };
    return [arm, { ...student, id: hash(student) }];
  }));
}

export const groupPath = ({ repetition, taskId, profileId, arm }) => `${arm ?? `r${repetition}`}/${taskId}/${profileId}`;
export const trialCoordinates = ({ repetition, repetitions = [repetition], taskId, profileId, conditions, arm }) =>
  repetitions.flatMap(repetition => conditions.map(condition => ({
    ...(arm && { arm }), repetition, taskId, profileId, condition,
    path: `${arm ? `${arm}/` : ''}r${repetition}/${taskId}/${profileId}/${condition}`,
  })));

export function fidelityBudget(learnerFix) {
  const plan = fidelityPlanFor(learnerFix);
  const learner = plan.flatMap(trialCoordinates).length;
  const fidelity_audit = plan.length;
  const auditCap = fidelityAuditPolicies[learnerFix === undefined ? 'qwen' : 'gemini'].policy.maxTokens;
  const attempts = fidelityStopRules.maxReplyRetries + 1;
  return { typicalCalls: learner + fidelity_audit, logicalCalls: { learner, fidelity_audit },
    maxCalls: attempts * (learner + fidelity_audit),
    maxOutputTokens: attempts * (learner * policy.learner.maxTokens + fidelity_audit * auditCap) };
}

export function learnerTask(taskId) {
  const { opening, known, unknown, initialRule } = developmentTopics[taskId];
  return { user_scenario: { persona: 'A student seeking help with a math problem', instructions: {
    task_instructions: opening, reason_for_call: 'I want help with this problem.', known_info: known,
    unknown_info: unknown, student_model: { initialRule },
  } } };
}

export function trialMessage(id, trial, index, text) {
  const coordinate = trial.path.replaceAll('/', ':');
  return message(`${id}:${coordinate}:m:${index + 1}`, index % 2 ? 'teacher' : 'learner', Math.ceil(index / 2), text);
}

export function frozenPrefix(id, trial) {
  const { taskId, profileId, condition } = trial;
  const topic = developmentTopics[taskId];
  const [first, second, third] = topic.history[profileId];
  return [topic.opening, topic.teacher.repeat, first, 'What is your reason for thinking about it that way?', second,
    'Before I write any steps, tell me one thing you would try first.', third, topic.teacher[condition],
  ].map((text, i) => trialMessage(id, trial, i, text));
}

export function auditContext(taskId, transcripts) {
  const { known, unknown } = developmentTopics[taskId];
  const samples = transcripts.map((messages, i) => ({ sample: 'ABCD'[i], messages: messages.map(({ role, text }, j) => ({ n: j + 1, role, text })) }));
  return { known, unknown, samples };
}

const progressing = ['attempt', 'repair'];
const holds = stance => observation => observation.stance === stance && observation.progress !== 'repair';
const idle = stance => observation => observation.stance === stance && observation.progress === 'none';
const repair = observation => observation.progress === 'repair';
const progress = observation => progressing.includes(observation.progress);
const expectations = {
  stubborn: { repeat: holds('misconception'), answer: holds('misconception'), targeted: repair, independent: holds('misconception') },
  'answer-seeker': { repeat: idle('answer-dependence'), answer: idle('answer-dependence'), targeted: progress, independent: progress },
  pretender: { repeat: idle('surface-understanding'), answer: idle('surface-understanding'), targeted: repair, independent: holds('exposed-gap') },
};

export function matchesExpectation(trial) {
  return Boolean(trial.audit && expectations[trial.profileId][trial.condition](trial.audit));
}

export function assessFidelity(trials) {
  return Object.fromEntries(hardProfileIds.map(profileId => {
    const observed = trials.filter(row => row.profileId === profileId && row.audit);
    const conditions = Object.fromEntries(fidelityConditions.map(condition => {
      const rows = observed.filter(row => row.condition === condition);
      return [condition, { matched: rows.filter(matchesExpectation).length, audited: rows.length, planned: 4 }];
    }));
    const teachable = Object.fromEntries(Object.keys(developmentTopics).map(taskId => [taskId, observed.filter(row =>
      row.taskId === taskId && row.condition === 'targeted' && !row.audit.unsupported && matchesExpectation(row),
    ).length]));
    const unsupported = observed.filter(row => row.audit.unsupported).length;
    const privateLeaks = observed.filter(row => row.audit.privateLeak).length;
    const audited = observed.length;
    const teachableOnBoth = Object.values(teachable).every(n => n >= 1);
    const allConditions = Object.values(conditions).every(({ matched }) => matched >= 3);
    const verdict = audited !== 16 || !teachableOnBoth || privateLeaks ? '不可用' : allConditions && !unsupported ? '能用' : '需改';
    return [profileId, { verdict, conditions, teachable, unsupported, privateLeaks, audited, planned: 16 }];
  }));
}

export const plannedReplyNumber = rounds * 2 + 1;
export { hardLearnerScenario };
