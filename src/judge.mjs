import { bind, dimensions, directDimension, judgeFormat, judgementSchema, parseNumberedJudgement, rubric, ruler } from '../contracts/judge/schema.mjs';

export async function grade(models, messages, { role = 'judge', turn, call = 1, runId, cell }) {
  const view = bind(messages);
  const structured = models.usesStructuredJudgement(role);
  const schema = judgementSchema(view);
  const binding = { runId, cell, ruler, viewHash: view.id, messageIds: messages.map(m=>m.id) };
  const { value: result, location } = await models.complete({ role, turn, call, binding }, {
    systemPrompt: `${judgeFormat}\nWithin a group all IDs in an earlier observed slot must precede every ID in each later observed slot. Do not use the same message or any overlapping chronological span in two groups of one dimension, including opportunity IDs. Select representative IDs that preserve the slot meanings. If two cycles share a boundary, cite a complete representative cycle without merging them or inventing a new ID.`,
    messages: [{ role: 'user', timestamp: Date.now(), content: JSON.stringify({ late_third_start: view.lateStart+1, rubric, messages: messages.map(({role,text},i)=>({n:i+1,role,text})) }) }],
  }, (output, _response, audit) => {
    const result = parseNumberedJudgement(output, view, audit, schema);
    if (dimensions.some(key => result[key].score === null)) throw new Error('a required dimension is unrated');
    return result;
  }, structured ? schema : undefined);
  const groups = {
    teaching: Object.fromEntries(dimensions.slice(0, 4).map(key => [key, result[key]])),
    consolidation: Object.fromEntries(dimensions.slice(4).map(key => [key, result[key]])),
  };
  return { groups, binding: { ...binding, ...location }, scores: { all: dimensions.map(key => result[key].score), direct: result[directDimension].score } };
}
