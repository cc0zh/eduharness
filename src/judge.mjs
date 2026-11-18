import { bind, dimensions, directDimension, judgeFormat, parseJudge, rubric } from '../contracts/judge/schema.mjs';

export async function grade(models, messages, { role = 'judge', turn, call = 1 }) {
  const view = bind(messages);
  const { value: result, location } = await models.complete({ role, turn, call }, {
    systemPrompt: `${judgeFormat}\nWithin a group all IDs in an earlier observed slot must precede every ID in each later observed slot. Do not use the same message or any overlapping chronological span in two groups of one dimension, including opportunity IDs. Select representative IDs that preserve the slot meanings. If two cycles share a boundary, cite a complete representative cycle without merging them or inventing a new ID.`,
    messages: [{ role: 'user', timestamp: Date.now(), content: JSON.stringify({ context_id: view.id, late_third_start: view.lateStart, rubric, messages }) }],
  }, (text, _response, audit) => {
    const result = parseJudge(text, view, dimensions, audit);
    if (dimensions.some(key => result[key].score === null)) throw new Error('a required dimension is unrated');
    return result;
  });
  const groups = {
    teaching: Object.fromEntries(dimensions.slice(0, 4).map(key => [key, result[key]])),
    consolidation: Object.fromEntries(dimensions.slice(4).map(key => [key, result[key]])),
  };
  return { groups, location, scores: { all: dimensions.map(key => result[key].score), direct: result[directDimension].score } };
}
