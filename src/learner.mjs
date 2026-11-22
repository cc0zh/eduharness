import { learnerPrompt } from '../contracts/learner/profiles.mjs';
import { parseLearner } from '../contracts/learner/schema.mjs';

export async function learnerReply(models, systemPrompt, messages, turn) {
  const { value } = await models.complete({ role: 'learner', turn, call: 1 }, {
    systemPrompt,
    messages: [{ role: 'user', timestamp: Date.now(), content: JSON.stringify(messages.map(({ role, text }) => ({ role, text }))) }],
  }, parseLearner);
  return value.text;
}

export { learnerPrompt };
