import { bind, dimensions, directDimension, judgeFormat, parseJudge, rubric } from '../contracts/judge/schema.mjs';

export async function grade(models, messages, { role = 'judge', turn, call = 1 }) {
  const view = bind(messages);
  const { value: result, location } = await models.complete({ role, turn, call }, {
    systemPrompt: judgeFormat,
    messages: [{ role: 'user', timestamp: Date.now(), content: JSON.stringify({ context_id: view.id, late_third_start: view.lateStart, rubric, messages }) }],
  }, text => {
    const result = parseJudge(text, view);
    if (dimensions.some(key => result[key].score === null)) throw new Error('a required dimension is unrated');
    return result;
  });
  const groups = {
    teaching: Object.fromEntries(dimensions.slice(0, 4).map(key => [key, result[key]])),
    consolidation: Object.fromEntries(dimensions.slice(4).map(key => [key, result[key]])),
  };
  return { groups, location, scores: { all: dimensions.map(key => result[key].score), direct: result[directDimension].score } };
}
