import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { exact, record } from '../core/schema.mjs';
import { binaryQuestions, bindBinary, notApplicable, scoreBinary } from './binary.mjs';

export const splitBinaryRuler = 'e1-binary-v3';
export const splitBinaryOutputContract = 'judge-output-v5';
export const splitBinaryIdentityVersion = 'evaluation-identity-v5';

export const splitDimensions = [
  'misconception_repair', 'support_escalation_and_fading', 'agency_handoff',
  'productive_struggle', 'representation_pivot', 'verification_or_transfer',
];

const questionIdsByDimension = {
  misconception_repair: ['M0', 'M1', 'M2', 'M3'],
  support_escalation_and_fading: ['S0', 'S1', 'S2', 'S3'],
  agency_handoff: ['A1', 'A2'],
  productive_struggle: ['P0', 'P1', 'P2', 'P3'],
  representation_pivot: ['R0', 'R1', 'R2'],
  verification_or_transfer: ['V1', 'V2'],
};
const sharedSlots = {
  M0: ['misconception'], M1: ['misconception'], M2: ['misconception'], M3: ['misconception'],
  R0: ['oldFrame', 'blocked'], R1: ['oldFrame', 'blocked'], R2: ['newFrame'],
};
export const splitQuestions = Object.freeze(Object.fromEntries(splitDimensions.map(dimension => [
  dimension,
  Object.freeze(Object.fromEntries(questionIdsByDimension[dimension].map(id => {
    const source = binaryQuestions[id];
    return [id, Object.freeze({
      text: source.text,
      evidence: Object.freeze(Object.fromEntries(Object.entries(source.evidence).filter(([slot]) => !sharedSlots[id]?.includes(slot)))),
      optional: source.optional,
    })];
  }))),
])));

const anchorsByDimension = {
  misconception_repair: { question: 'M0', evidence: binaryQuestions.M0.evidence },
  representation_pivot: { question: 'R0', evidence: binaryQuestions.R0.evidence },
};
const questionIds = Object.fromEntries(splitDimensions.map(dimension => [dimension, questionIdsByDimension[dimension]]));
const gates = {
  misconception_repair: ['M0', ['M1', 'M2', 'M3']],
  support_escalation_and_fading: ['S0', ['S1', 'S2']],
  productive_struggle: ['P0', ['P2', 'P3']],
  representation_pivot: ['R0', ['R1', 'R2']],
};
const chronology = {
  support_escalation_and_fading: { S1: ['initial', 'blocked', 'escalation'], S2: ['prior', 'progress', 'fading', 'followup'] },
  productive_struggle: { P2: ['stuck', 'hint', 'attempt'], P3: ['prior', 'pending', 'rescue'] },
  verification_or_transfer: { V2: ['prompt', 'response'] },
};

function fail(retryFeedback, detail) {
  throw Object.assign(new Error(detail), { retryFeedback });
}

function requireThat(ok, retryFeedback, detail) {
  if (!ok) fail(retryFeedback, detail);
}

function assertDimension(dimension) {
  requireThat(splitDimensions.includes(dimension), 'structure', 'unknown binary dimension');
}

function assertView(view) {
  requireThat(record(view) && Array.isArray(view.messages) && typeof view.id === 'string', 'evidence', 'invalid binary evidence view');
  const bound = bindBinary(view.messages);
  requireThat(bound.id === view.id, 'evidence', 'binary evidence view hash mismatch');
}

function object(properties) {
  return Type.Object(properties, { additionalProperties: false });
}

function citation(role, positions, strict) {
  const integer = strict ? Type.Integer({ enum: positions[role] }) : Type.Integer();
  return Type.Union([integer, Type.Null()]);
}

function dimensionSchema(view, dimension, strict) {
  assertDimension(dimension);
  assertView(view);
  const positions = { learner: [], teacher: [] };
  for (const [index, row] of view.messages.entries()) positions[row.role].push(index + 1);
  const ref = role => citation(role, positions, strict);
  const anchors = anchorsByDimension[dimension];
  return object({
    ...(anchors && { anchors: object(Object.fromEntries(Object.entries(anchors.evidence).map(([slot, role]) => [slot, ref(role)]))) }),
    answers: object(Object.fromEntries(questionIds[dimension].map(id => {
      const definition = splitQuestions[dimension][id];
      const evidence = Object.keys(definition.evidence).length
        ? { evidence: object(Object.fromEntries(Object.entries(definition.evidence).map(([slot, role]) => [slot, ref(role)]))) }
        : {};
      return [id, object({ answer: Type.Boolean(), ...evidence })];
    }))),
  });
}

export function binaryDimensionSchema(view, dimension) {
  return dimensionSchema(view, dimension, true);
}

function validateCitation(value, role, view, path) {
  if (value === null) return;
  requireThat(Number.isInteger(value), 'structure', `${path}: citation must be an integer or null`);
  requireThat(value >= 1 && value <= view.messages.length, 'evidence', `${path}: citation #${value} is out of range`);
  requireThat(view.messages[value - 1].role === role, 'evidence', `${path}: citation #${value} has the wrong role`);
}

function rowRef(answers, questionId, slot) {
  return answers[questionId].evidence?.[slot] ?? null;
}

function assertOrdered(numbers, path) {
  const present = numbers.filter(number => number !== null);
  requireThat(present.every((number, index) => index === 0 || number > present[index - 1]), 'order', `${path}: evidence order mismatch`);
}

function validateRules(value, view, dimension) {
  const answers = value.answers;
  const yes = id => answers[id].answer;
  const anchors = anchorsByDimension[dimension];
  const anchorRefs = anchors ? value.anchors : {};

  if (anchors) {
    const gate = answers[anchors.question];
    if (gate.answer) {
      for (const slot of Object.keys(anchors.evidence)) {
        requireThat(anchorRefs[slot] !== null, 'evidence', `${anchors.question}.${slot}: missing required anchor`);
      }
    }
    if (dimension === 'misconception_repair') {
      for (const id of ['M1', 'M2', 'M3']) {
        const citation = rowRef(answers, id, Object.keys(splitQuestions[dimension][id].evidence)[0]);
        if (anchorRefs.misconception !== null && citation !== null) {
          requireThat(citation > anchorRefs.misconception, 'order', `${id}: citation must follow M0 anchor #${anchorRefs.misconception}`);
        }
      }
    }
  }

  for (const [gate, dependents] of Object.entries(gates)) {
    if (gate !== dimension) continue;
    const gateQuestion = dependents[0];
    const children = dependents[1];
    if (!yes(gateQuestion)) {
      const conflicting = children.filter(yes);
      requireThat(!conflicting.length, 'dependency', `${gateQuestion}: No conflicts with ${conflicting.join(', ')}`);
    }
  }

  for (const [id, definition] of Object.entries(splitQuestions[dimension])) {
    if (!yes(id)) continue;
    for (const slot of Object.keys(definition.evidence)) {
      if (!definition.optional.includes(slot)) {
        requireThat(answers[id].evidence[slot] !== null, 'evidence', `${id}.${slot}: missing required evidence`);
      }
    }
  }

  for (const [id, slots] of Object.entries(chronology[dimension] ?? {})) {
    assertOrdered(slots.map(slot => rowRef(answers, id, slot)), `${id}`);
  }

  if (dimension === 'representation_pivot') {
    assertOrdered([anchorRefs.oldFrame, anchorRefs.blocked], 'R0');
    const newFrame = rowRef(answers, 'R1', 'newFrame');
    const uptake = rowRef(answers, 'R2', 'uptake');
    if (anchorRefs.blocked !== null && newFrame !== null) assertOrdered([anchorRefs.blocked, newFrame], 'R1');
    if (newFrame !== null && uptake !== null) assertOrdered([newFrame, uptake], 'R2');
    if (yes('R2')) requireThat(yes('R1'), 'dependency', 'R2: Yes requires R1 Yes');
  }

  if (dimension === 'misconception_repair' && yes('M2') && yes('M3')) {
    requireThat(rowRef(answers, 'M3', 'solution') < rowRef(answers, 'M2', 'repair'), 'order', 'M3: full solution must precede the M2 repair');
  }

  if (dimension === 'productive_struggle') {
    const pending = rowRef(answers, 'P3', 'pending');
    const rescue = rowRef(answers, 'P3', 'rescue');
    if (pending !== null && rescue !== null) requireThat(rescue === pending + 1, 'order', `P3: rescue #${rescue} must be the next tutor response after #${pending}`);
    const prior = rowRef(answers, 'P3', 'prior');
    const opening = rowRef(answers, 'P1', 'opening');
    if (prior !== null && opening !== null) requireThat(prior >= opening, 'order', 'P3: prior response must not precede the P1 opening');
  }

  if (dimension === 'agency_handoff') {
    const step = rowRef(answers, 'A1', 'step');
    const choice = rowRef(answers, 'A1', 'choice');
    if (yes('A1')) requireThat(step > 1, 'order', `A1: step #${step} must follow the learner opening`);
    if (step !== null && choice !== null) requireThat(choice === step - 2, 'order', 'A1: choice must be in the preceding learner message');
  }

  if (dimension === 'verification_or_transfer') {
    const prompt = rowRef(answers, 'V1', 'prompt');
    const response = rowRef(answers, 'V2', 'response');
    if (response !== null) requireThat(response > 1, 'order', `V2: response #${response} must follow a tutor turn`);
    if (prompt !== null && response !== null) requireThat(response > prompt, 'order', 'V2: response must follow the V1 prompt');
  }

  if (dimension === 'agency_handoff') {
    const choice = rowRef(answers, 'A2', 'choice');
    requireThat(choice === null || choice > Math.floor(view.messages.length * 2 / 3), 'window', `A2: choice #${choice} is outside the final third`);
  }

  const windowFor = {
    misconception_repair: () => ['M0', anchorRefs.misconception],
    support_escalation_and_fading: () => ['S0', rowRef(answers, 'S0', 'state')],
    productive_struggle: () => ['P0', rowRef(answers, 'P0', 'task')],
    representation_pivot: () => ['R0', anchorRefs.blocked],
  }[dimension];
  if (windowFor) {
    const [gate, lastNumber] = windowFor();
    if (yes(gate)) requireThat(lastNumber !== null, 'evidence', `${gate}: missing opportunity citation`);
    if (lastNumber !== null) {
      requireThat(view.messages.slice(lastNumber).some(row => row.role === 'teacher'), 'window', `${gate}: no later teacher response window after #${lastNumber}`);
    }
  }
}

function mapEvidenceToIds(evidence, view) {
  return Object.fromEntries(Object.entries(evidence)
    .filter(([, number]) => number !== null)
    .map(([slot, number]) => [slot, view.messages[number - 1].id]));
}

function summarize(scores) {
  const applicable = Object.keys(scores).filter(dimension => scores[dimension] !== notApplicable);
  const points = applicable.reduce((sum, dimension) => sum + scores[dimension], 0);
  const possible = 2 * applicable.length;
  return { ruler: splitBinaryRuler, scores, applicable, points, possible, rate: possible ? points / possible : null };
}

const emptyAnswers = Object.fromEntries(Object.entries(binaryQuestions).map(([id, definition]) => [id, {
  answer: false,
  evidence: Object.fromEntries(Object.keys(definition.evidence).map(slot => [slot, null])),
}]));

function scoreAnswers(answers) {
  const complete = { ...emptyAnswers, ...answers };
  return { ...scoreBinary(complete), ruler: splitBinaryRuler };
}

export function parseBinaryDimension(text, view, dimension, audit = []) {
  assertDimension(dimension);
  assertView(view);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    const error = new SyntaxError('invalid JSON document');
    error.retryFeedback = 'structure';
    throw error;
  }
  const schema = dimensionSchema(view, dimension, false);
  const issue = Value.Errors(schema, value).First();
  requireThat(!issue, 'structure', `binary ${dimension} structure mismatch${issue?.path ? ` at ${issue.path}` : ''}`);

  const anchors = anchorsByDimension[dimension];
  if (anchors) {
    for (const [slot, role] of Object.entries(anchors.evidence)) {
      validateCitation(value.anchors[slot], role, view, `${anchors.question}.${slot}`);
    }
  }
  for (const [id, definition] of Object.entries(splitQuestions[dimension])) {
    for (const [slot, role] of Object.entries(definition.evidence)) {
      validateCitation(value.answers[id].evidence[slot], role, view, `${id}.${slot}`);
    }
  }
  validateRules(value, view, dimension);

  const normalized = [];
  const answers = {};
  const messageIds = {};
  const anchorRefs = anchors ? { ...value.anchors } : undefined;
  for (const id of questionIds[dimension]) {
    const original = anchors?.question === id ? { ...value.anchors } : { ...(value.answers[id].evidence ?? {}) };
    const answer = value.answers[id];
    const evidence = answer.evidence ? { ...answer.evidence } : undefined;
    let changed = false;
    if (anchors?.question === id && !answer.answer) {
      for (const slot of Object.keys(anchorRefs)) {
        if (anchorRefs[slot] !== null) {
          anchorRefs[slot] = null;
          changed = true;
        }
      }
    }
    if (!answer.answer && evidence) {
      for (const slot of Object.keys(evidence)) {
        if (evidence[slot] !== null) {
          evidence[slot] = null;
          changed = true;
        }
      }
    }
    if (changed) normalized.push({ question: id, original });
    answers[id] = { answer: answer.answer, ...(evidence && { evidence }) };
    messageIds[id] = evidence ? mapEvidenceToIds(evidence, view) : {};
  }
  if (Array.isArray(audit)) audit.push(...normalized.map(row => ({ ...row, original: { ...row.original } })));

  const parsed = {
    ...(anchorRefs && { anchors: anchorRefs }),
    answers,
    messageIds,
    ...(anchorRefs && { anchorMessageIds: mapEvidenceToIds(anchorRefs, view) }),
    normalized,
    scoring: summarize({ [dimension]: scoreAnswers(answers).scores[dimension] }),
  };
  return parsed;
}

export function assembleBinaryVerdict(parts) {
  requireThat(exact(parts, splitDimensions), 'structure', 'binary verdict requires one result for each dimension');
  const s3 = parts.support_escalation_and_fading.answers.S3;
  const p1 = parts.productive_struggle.answers.P1;
  const s3Opening = s3.evidence.opening;
  const p1Opening = p1.evidence.opening;
  if (s3.answer && (!p1.answer || s3Opening !== p1Opening)) {
    return { conflict: {
      code: 'S3_P1', questions: ['S3', 'P1'],
      citations: { S3: s3Opening ?? null, P1: p1Opening ?? null },
      answers: { S3: s3.answer, P1: p1.answer },
    } };
  }
  const answers = Object.assign({}, ...splitDimensions.map(dimension => parts[dimension].answers));
  const messageIds = Object.assign({}, ...splitDimensions.map(dimension => parts[dimension].messageIds));
  const anchors = Object.fromEntries(Object.keys(anchorsByDimension).map(dimension => [dimension, parts[dimension].anchors]));
  const anchorMessageIds = Object.fromEntries(Object.keys(anchorsByDimension).map(dimension => [dimension, parts[dimension].anchorMessageIds]));
  return { verdict: {
    anchors,
    answers,
    messageIds,
    anchorMessageIds,
    normalized: Object.fromEntries(splitDimensions.map(dimension => [dimension, parts[dimension].normalized])),
    scoring: scoreAnswers(answers),
  } };
}
