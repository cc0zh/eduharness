import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { exact, hash, message, requireThat } from '../core/schema.mjs';

export const binaryRuler = 'e1-binary-v1';
export const binaryOutputContract = 'judge-output-v3';
export const binaryIdentityVersion = 'evaluation-identity-v3';
export const notApplicable = 'N/A';

const L = 'learner', T = 'teacher';
const question = (text, evidence, optional = []) => ({ text, evidence, optional });
export const binaryQuestions = {
  M0: question('The learner explicitly proposes a specific wrong concept, inference, or reason and the tutor still has a turn to respond. A correct number can have a wrong reason. Mere confusion does not qualify.', { misconception: L }),
  M1: question('After M0, the tutor gives a reason, counterexample, or test showing why that misconception fails. Saying wrong or giving the right result is insufficient. A full solution can still contain this evidence.', { misconception: L, explanation: T }),
  M2: question('After M0, the learner repairs that same misconception using a key inference the tutor has not already provided. Echoing a correction or changing a number is insufficient.', { misconception: L, repair: L }),
  M3: question('After M0, the tutor gives a complete worked solution to the original goal before leaving a real step to repair that misconception. Confirming a guessed answer alone is insufficient.', { misconception: L, solution: T }),
  S0: question('The learner is explicitly blocked on unfinished reasoning, or just completes a substep with more to do, and the tutor can still respond.', { state: L }),
  S1: question('Earlier help failed at a specific step. The tutor then offers more concrete support on that same step and still leaves a step to attempt. A first hint, generic encouragement, or a complete solution does not qualify.', { initial: T, blocked: L, escalation: T }),
  S2: question('After a learner success, the tutor reduces support by returning a substantive decision and does not take over that decision on later related opportunities. Cite the earlier support, success, fading, and related learner follow-up.', { prior: T, progress: L, fading: T, followup: L }),
  S3: question('The first substantive tutor response gives the complete worked solution to the original problem. Confirming the result alone is insufficient.', { opening: T }),
  A1: question('After the opening learner message, the learner carries out a new substantive reasoning step or check. Echoing, arithmetic on an already supplied expression, and merely proposing to try do not qualify. If carrying out a choice made in the preceding learner message, cite that choice too. If both occur in one message, leave choice null.', { step: L, choice: L }, ['choice']),
  A2: question('The learner chooses a consequential method, candidate answer, or check and states their own reason or the consequence. Asking why, proposing that the tutor perform it, or following a specified operation does not qualify. The code checks timing and matches the citation to A1.', { choice: L }),
  P0: question('The learner presents a substantive task, explanation, or check still to do and the tutor has a turn to leave a step to try. A guessed answer can still leave reasoning to do.', { task: L }),
  P1: question('The first substantive tutor response states the original final answer as settled or gives the complete solution. Confirming a learner guess as final qualifies. Confirming a substep while keeping the original question open does not.', { opening: T }),
  P2: question('The tutor gives a targeted hint for the learner’s obstacle or incorrect attempt and the learner actually attempts the step the tutor left open. An attempt may be wrong. Generic encouragement cannot count as the hint.', { stuck: L, hint: T, attempt: L }),
  P3: question('In the next tutor reply to a pending obstacle, the tutor does a substantive step before the learner can attempt it. Cite a prior substantive tutor response from before the obstacle. Feedback after an attempt and repeating a settled takeaway do not qualify.', { pending: L, rescue: T, prior: T }),
  R0: question('The tutor actually uses a representation, the learner explicitly remains stuck on the relation that representation addressed, and the tutor has another turn. A failed representation introduced only by the learner does not qualify.', { oldFrame: T, blocked: L }),
  R1: question('After the R0 obstacle, the tutor changes to a substantively different representation for the same relation. Rewording, changing numbers, or repeating a worked solution is insufficient. A genuinely different representation can still occur after the full answer.', { oldFrame: T, blocked: L, newFrame: T }),
  R2: question('The learner uses the R1 representation to explain that relation, derive a new result, or identify a concrete flaw in the mapping. Repeating or agreeing with the tutor’s mapping is insufficient.', { newFrame: T, uptake: L }),
  V1: question('The tutor asks the learner to explain a concept or solve a new case, leaving the relevant explanation or result for the learner. Asking whether they understand, doing the check for them, and claiming they checked do not qualify.', { prompt: T }),
  V2: question('After a tutor turn, the learner independently gives a correct conceptual reason or carries through a new case without being given the key reasoning. Echoing or completing a specified arithmetic operation is insufficient. Cite the tutor prompt if answering a specific check. Leave it null for spontaneous checks.', { response: L, prompt: T }, ['prompt']),
};

export const binaryGates = {
  M0: ['M1', 'M2', 'M3'], S0: ['S1', 'S2'], P0: ['P2', 'P3'], R0: ['R1', 'R2'],
};

export function bindBinary(messages) {
  requireThat(Array.isArray(messages) && messages.length >= 3 && messages.length % 2 === 1, 'binary judge requires a complete dialogue');
  const ids = new Set();
  for (const [i, row] of messages.entries()) {
    requireThat(exact(row, ['id', 'role', 'turn', 'text']) && row.role === (i % 2 ? T : L) && row.turn === Math.ceil(i / 2), 'dialogue chronology or public roles mismatch');
    message(row.id, row.role, row.turn, row.text);
    requireThat(!ids.has(row.id), 'duplicate source message ID');
    ids.add(row.id);
  }
  return { id: hash(messages), messages };
}

const object = properties => Type.Object(properties, { additionalProperties: false });
export function binaryJudgementSchema({ messages }) {
  const positions = { [L]: [], [T]: [] };
  for (const [i, { role }] of messages.entries()) positions[role].push(i + 1);
  return object({ answers: object(Object.fromEntries(Object.entries(binaryQuestions).map(([id, { evidence }]) => [id, object({
    answer: Type.Boolean(),
    evidence: object(Object.fromEntries(Object.entries(evidence).map(([name, role]) => [name,
      Type.Union([Type.Integer({ enum: positions[role] }), Type.Null()]),
    ]))),
  })]))) });
}

const chronological = {
  M1: ['misconception', 'explanation'], M2: ['misconception', 'repair'], M3: ['misconception', 'solution'],
  S1: ['initial', 'blocked', 'escalation'], S2: ['prior', 'progress', 'fading', 'followup'],
  P2: ['stuck', 'hint', 'attempt'], P3: ['prior', 'pending', 'rescue'],
  R0: ['oldFrame', 'blocked'], R1: ['oldFrame', 'blocked', 'newFrame'], R2: ['newFrame', 'uptake'],
  V2: ['prompt', 'response'],
};

function validateAnswers(answers, messages) {
  const yes = id => answers[id].answer;
  const ref = (id, slot) => answers[id].evidence[slot];
  for (const [id, { answer, evidence }] of Object.entries(answers)) {
    const question = binaryQuestions[id];
    for (const [slot, n] of Object.entries(evidence)) {
      if (!answer) requireThat(n === null, `${id}: No must have null evidence`);
      else if (n === null) requireThat(question.optional.includes(slot), `${id}.${slot}: missing required evidence`);
      else {
        requireThat(n >= 1 && n <= messages.length, `${id}.${slot}: evidence out of range`);
        requireThat(messages[n - 1].role === question.evidence[slot], `${id}.${slot}: evidence role mismatch`);
      }
    }
    const ordered = chronological[id]?.map(slot => evidence[slot]).filter(n => n !== null) ?? [];
    requireThat(ordered.every((n, i) => i === 0 || n > ordered[i - 1]), `${id}: evidence order mismatch`);
  }
  for (const [gate, dependents] of Object.entries(binaryGates)) {
    if (yes(gate)) {
      const n = Object.values(answers[gate].evidence).at(-1);
      requireThat(messages.slice(n).some(m => m.role === T), `${gate}: no later tutor response window`);
    } else requireThat(!dependents.some(yes), `${gate}: gate No conflicts with ${dependents.filter(yes).join(', ')}`);
  }
  for (const id of binaryGates.M0) {
    requireThat(!yes(id) || ref(id, 'misconception') === ref('M0', 'misconception'), `${id}: M0 anchor mismatch`);
  }
  requireThat(!yes('M2') || !yes('M3') || ref('M3', 'solution') < ref('M2', 'repair'), 'M3: full solution did not precede the repair');
  requireThat(!yes('R1') || ['oldFrame', 'blocked'].every(slot => ref('R1', slot) === ref('R0', slot)), 'R1: R0 anchor mismatch');
  requireThat(!yes('R2') || yes('R1') && ref('R2', 'newFrame') === ref('R1', 'newFrame'), 'R2: R1 anchor mismatch');
  requireThat(!yes('S3') || yes('P1') && ref('S3', 'opening') === ref('P1', 'opening'), 'S3: a full opening solution requires P1 with the same citation');
  requireThat(!yes('P3') || ref('P3', 'rescue') === ref('P3', 'pending') + 1, 'P3: rescue must be the next tutor response');
  requireThat(!yes('P3') || !yes('P1') || ref('P3', 'prior') >= ref('P1', 'opening'), 'P3: earlier substantive reply contradicts P1 opening');
  requireThat(!yes('A1') || ref('A1', 'step') > 1, 'A1: step must follow the learner opening');
  requireThat(!yes('A1') || ref('A1', 'choice') === null || ref('A1', 'choice') === ref('A1', 'step') - 2, 'A1: choice must be in the preceding learner message');
  requireThat(!yes('A2') || ref('A2', 'choice') > Math.floor(messages.length * 2 / 3), 'A2: choice outside the final third');
  requireThat(!yes('V2') || ref('V2', 'response') > 1, 'V2: response must follow a tutor turn');
}

export function parseBinaryJudgement(text, view, schema = binaryJudgementSchema(view)) {
  const { messages, id } = view;
  requireThat(hash(messages) === id, 'binary evidence view hash mismatch');
  const value = JSON.parse(text);
  const issue = Value.Errors(schema, value).First();
  requireThat(!issue, `binary judgement structure mismatch${issue?.path ? ` at ${issue.path}` : ''}`);
  const { answers } = value;
  validateAnswers(answers, messages);
  const messageIds = Object.fromEntries(Object.entries(answers).map(([id, { evidence }]) => [id,
    Object.fromEntries(Object.entries(evidence).filter(([, n]) => n !== null).map(([slot, n]) => [slot, messages[n - 1].id])),
  ]));
  return { answers, messageIds, scoring: scoreBinary(answers) };
}

const scorePair = (first, second) => first ? (second ? 2 : 1) : 0;
const scoresByDimension = {
  misconception_repair: (yes, ref) => yes('M3') ? 0 : scorePair(yes('M1'), yes('M2') && ref('M1', 'explanation') < ref('M2', 'repair')),
  support_escalation_and_fading: (yes, ref) => scorePair(yes('S1') || yes('S2'), yes('S1') && yes('S2') && !yes('S3') && ref('S1', 'escalation') === ref('S2', 'prior')),
  agency_handoff: (yes, ref) => scorePair(yes('A1'), yes('A2') && ['step', 'choice'].some(slot => ref('A1', slot) === ref('A2', 'choice'))),
  productive_struggle: yes => scorePair(!yes('P1') && yes('P2'), !yes('P3')),
  representation_pivot: yes => scorePair(yes('R1'), yes('R2')),
  verification_or_transfer: (yes, ref) => scorePair(yes('V1'), yes('V2') && ref('V1', 'prompt') === ref('V2', 'prompt')),
};

export const binaryDimensions = Object.keys(scoresByDimension);
const gatesByDimension = {
  misconception_repair: 'M0', support_escalation_and_fading: 'S0', productive_struggle: 'P0', representation_pivot: 'R0',
};

export function summarizeBinary(scores) {
  requireThat(exact(scores, binaryDimensions) && Object.values(scores).every(score => [0, 1, 2, notApplicable].includes(score)), 'invalid binary dimension score');
  const applicable = binaryDimensions.filter(key => scores[key] !== notApplicable);
  const points = applicable.reduce((sum, key) => sum + scores[key], 0);
  const possible = 2 * applicable.length;
  return { ruler: binaryRuler, scores, applicable, points, possible, rate: possible ? points / possible : null };
}

export function scoreBinary(answers) {
  const yes = id => answers[id].answer;
  const ref = (id, slot) => answers[id].evidence[slot];
  return summarizeBinary(Object.fromEntries(binaryDimensions.map(key => {
    const gate = gatesByDimension[key];
    return [key, gate && !yes(gate) ? notApplicable : scoresByDimension[key](yes, ref)];
  })));
}

export function compareBinary(normal, variant, dimension) {
  requireThat(binaryDimensions.includes(dimension), 'unknown binary target dimension');
  for (const side of [normal, variant]) requireThat(side == null || side.ruler === binaryRuler, 'incompatible ruler for binary comparison');
  const normalScore = normal?.scores[dimension] ?? null;
  const variantScore = variant?.scores[dimension] ?? null;
  const targetDelta = Number.isInteger(normalScore) && Number.isInteger(variantScore) ? normalScore - variantScore : null;
  const targetStatus = targetDelta === null ? 'inconclusive' : targetDelta > 0 ? 'lower' : targetDelta < 0 ? 'higher' : 'tie';
  const commonDimensions = binaryDimensions.filter(key => Number.isInteger(normal?.scores[key]) && Number.isInteger(variant?.scores[key]));
  const commonPossible = 2 * commonDimensions.length;
  const pairedDeltaPoints = commonPossible ? commonDimensions.reduce((sum, key) => sum + normal.scores[key] - variant.scores[key], 0) : null;
  return { dimension, normal: normalScore, variant: variantScore, targetDelta, targetStatus, commonDimensions, commonPossible, pairedDeltaPoints, pairedRateDelta: commonPossible ? pairedDeltaPoints / commonPossible : null };
}
