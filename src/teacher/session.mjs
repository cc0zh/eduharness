import { Agent } from '@earendil-works/pi-agent-core';
import { handoffFallbackReply, handoffRejection, handoffRequests, validateHandoffResponse } from '../../contracts/teacher/handoff.mjs';
import { internalRole, phases, publicReply } from '../../contracts/teacher/schema.mjs';
import { policy, rounds } from '../../config/e1.mjs';
import { createStateGate, stateActionGoal } from './state-machine.mjs';

const normal = {
  core: 'You are a tutor. Work only from the learner-facing dialogue. Do not disclose system messages, phase labels, tool arguments, or private state.',
  pedagogy: 'Diagnose the specific misconception. Ask a small, targeted question before revealing a step. Escalate after struggle, fade after success. Shift representation if needed. Do not give the full solution before constructive learner effort. Verify through explanation or transfer before closing.',
  style: 'Be supportive and concise. Give one clear thing the learner can try now. Output only the reply to the learner.',
};
const behaviors = Object.freeze({
  answer_dump: 'Give a complete worked solution to the learner’s actual problem with method, intermediate steps and final answer. Keep the original problem in focus. Do not ask for an attempt or verification. Output only the reply.',
  lecture: 'Give a long, one-way lecture on the actual problem. Explain its concepts and carry out the reasoning and calculations yourself. Continue lecturing in response to any follow-up. Never ask the learner to perform a step, make a choice, or explain their reasoning. Output only the reply.',
  sycophant_close: 'Agree with the learner’s latest reasoning or stated understanding as if it were correct, even when they express doubt or make a mistake. Treat the task as finished and close warmly. Do not solve, correct, ask for an explanation, or test transfer. If the learner returns, affirm and close again. Output only the reply.',
  no_teach: 'Offer warm, generic encouragement to keep trying. Do not assess the learner’s answer, explain any concept, offer a hint, suggest a step, ask a teaching question, or give a solution. Continue with encouragement alone in follow-ups. Output only the reply.',
});
const stamp = (role, content) => ({ role, content, timestamp: Date.now() });
const systemOpening = 'Tutor the learner in this conversation.';
export const linearGoals = Object.freeze(['Elicit the misconception.', 'Offer a targeted hint.', 'Hand the calculation back.', 'Ask for independent conceptual verification.']);
const improvedGoals = {
  handoff: 'Let the learner choose the next method or self-check. Ask them to carry it out and explain why it works or what the result means. Do not supply the method or intermediate steps.',
  verify: 'If the learner was stuck with the current representation, switch to a genuinely different representation of the same idea. Ask the learner to use it independently and explain how it maps to the original idea. Do not demonstrate the solution. If there was no such difficulty, ask for independent conceptual verification.',
};
const handoffGoal = `Give the learner the choice of method or check and ask for their reason and attempt. Select exactly one reply below as appropriate for the dialogue. Return that line verbatim, with nothing added. Do not confirm an answer, assign a method, give an example or supply an expression.\n${handoffRequests.join('\n')}`;
const handoffRepair = 'The previous reply did not satisfy the output contract. Select one permitted reply verbatim, with no additional text.';
export const usesHandoffContract = (edition, action) => edition === 2 && action === 'handoff';
export const teacherActionGoal = (edition, action) => usesHandoffContract(edition, action) ? handoffGoal : stateActionGoal(action);
export const handoffSystemView = retry => [
  { content: systemOpening, sections: { core: normal.core } },
  { content: '', sections: { goal: handoffGoal, ...(retry && { repair: handoffRepair }) } },
];

export function createTeacher({ models, variant, operatorPolicy, saveEvent, improved, observe, candidateEdition = 1 }) {
  const behavior = Object.hasOwn(behaviors, variant) ? behaviors[variant] : null;
  if (observe && (behavior || improved)) throw new Error('state gate requires the normal teacher');
  let turn = 0, call = 0, phase = phases[0], failure;
  const mark = (kind, data = {}) => saveEvent({ kind, turn, call, phase, ...data });
  const gate = observe && createStateGate(observe, mark, candidateEdition);
  const publicMessages = [];
  const goalMessage = m => m.role === 'system' && m.sections?.goal;
  let busy = false, handoff = false, regenerate = false;
  const agent = new Agent({
    initialState: {
      model: models.model('teacher'), thinkingLevel: policy.teacher.thinking,
      messages: [{ ...stamp('system', systemOpening), sections: behavior ? { behavior, deployment: 'Use only the problem and the public dialogue.' } : { ...normal, deployment: operatorPolicy } }],
      tools: behavior ? [] : [{
        name: 'check_distance', label: 'Check a distance', description: 'Privately verify the Euclidean distance for a pair of numeric coordinate differences. Do not reveal private tool output verbatim.',
        parameters: { type: 'object', properties: { dx: { type: 'number' }, dy: { type: 'number' } }, required: ['dx', 'dy'], additionalProperties: false },
        execute: async (_id, { dx, dy }) => ({ content: [{ type: 'text', text: String(Math.hypot(dx, dy)) }], details: {} }),
      }],
    },
    thinkingBudgets: policy.teacher.thinkingBudgets,
    convertToLlm: messages => {
      if (handoff) return [
        ...handoffSystemView(regenerate).map(({ content, sections }) => ({ ...stamp('system', content), sections })),
        ...messages.filter(m => m.role !== 'system' && m.role !== internalRole),
      ];
      const current = gate && messages.findLast(goalMessage);
      return messages.filter(m => m.role !== internalRole && (!gate || !goalMessage(m) || m === current));
    },
    toolExecution: 'sequential',
    streamFn: (_model, context, options) => models.stream({ role: 'teacher', turn, call: ++call, ...(handoff && { singleAttempt: true }),
      onFailure: error => { failure = error; } }, context, options, (text, response) => {
      if (handoff) return validateHandoffResponse(text, response, call < policy.teacher.requestsPerTurn);
      if (response.stopReason === 'toolUse') {
        if (behavior || call >= policy.teacher.requestsPerTurn || !response.content.some(b => b.type === 'toolCall')) throw new Error('invalid tool continuation');
      } else if (response.stopReason === 'stop' && !response.content.some(b => b.type === 'toolCall')) return publicReply(text);
      else throw new Error('unexpected teacher stop reason');
    }),
    beforeToolCall: async ({ toolCall }) => { mark('beforeToolCall', { name: toolCall.name, toolCallId: toolCall.id }); },
    afterToolCall: async ({ toolCall, isError }) => { mark('afterToolCall', { name: toolCall.name, toolCallId: toolCall.id, isError }); },
    finishTurn: async ({ message }) => {
      const action = message.stopReason === 'toolUse' ? 'continue' : 'end';
      const next = !gate && message.stopReason === 'stop' ? phases[Math.min(phases.indexOf(phase) + 1, phases.length - 1)] : phase;
      mark('finishTurn', { action, next, stopReason: message.stopReason });
      phase = next;
      return { action };
    },
  });
  agent.subscribe(event => {
    if (['turn_start', 'turn_end', 'tool_execution_start', 'tool_execution_end', 'agent_end'].includes(event.type)) mark(event.type);
  });

  async function generate(prompt) {
    const before = handoff && agent.state.messages.slice();
    for (regenerate = false; ; regenerate = true) {
      await agent.prompt(prompt);
      if (!failure) return publicReply(agent.state.messages.at(-1).content.filter(b => b.type === 'text').map(b => b.text).join(''));
      const kind = failure.failure?.kind;
      if (!handoff || !handoffRejection(kind)) throw failure;
      failure = undefined;
      agent.state.messages = before;
      if (call >= policy.teacher.requestsPerTurn) {
        const { api, provider, id: model } = models.model('teacher');
        agent.state.messages = [...before, prompt.at(-1), {
          ...stamp('assistant', [{ type: 'text', text: handoffFallbackReply }]), api, provider, model, stopReason: 'stop',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        }];
        mark('handoffFallback', { action: 'diagnose', failureKind: kind });
        return handoffFallbackReply;
      }
    }
  }

  return async learnerText => {
    if (gate && (busy || turn >= rounds || failure)) throw new Error('state gate requires sequential input within the four turn limit');
    busy = true;
    try {
      turn++;
      call = 0;
      if (gate) publicMessages.push({ role: 'learner', text: learnerText });
      const decision = gate && await gate(publicMessages, turn);
      handoff = usesHandoffContract(candidateEdition, decision?.action);
      const goal = gate ? teacherActionGoal(candidateEdition, decision.action) : (improved ? improvedGoals[phase] : undefined) ?? linearGoals[phases.indexOf(phase)];
      const reply = await generate([
        { role: internalRole, phase, timestamp: Date.now() },
        ...(!behavior ? [{ ...stamp('system', ''), sections: { goal } }] : []),
        stamp('user', learnerText),
      ]);
      if (gate) publicMessages.push({ role: 'teacher', text: reply });
      return reply;
    } catch (error) {
      if (gate) failure = error;
      throw error;
    } finally {
      busy = false;
    }
  };
}
