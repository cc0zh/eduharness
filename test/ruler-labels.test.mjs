import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rubric } from '../contracts/judge/schema.mjs';

const example = (taskId, condition) => ({
  taskId, condition, result: { total: 9 },
  instructions: { task_instructions: `Problem ${taskId}`, known_info: 'Known steps', unknown_info: 'Still unsure', reason_for_call: 'Needs help' },
  persona: 'Curious student',
  messages: [{ role: 'learner', text: `Problem ${taskId}` }, { role: 'teacher', text: 'Explain your reasoning.' }],
});

test('public labels contain verbatim numbered evidence and empty scores with a separate stable blind mapping', async () => {
  const { renderLabels } = await import('../scripts/ruler-labels.mjs');
  const options = { seed: 'teacharena-ruler-expand-v1', blindSalt: 'training-source' };
  const entries = [example('S0-01', 'no_teach'), example('S0-06', 'answer_dump')];
  const { markdown, csv, mapping } = renderLabels(entries, options);
  assert.deepEqual(renderLabels(entries.toReversed(), options).mapping, mapping);
  assert.equal(mapping.length, 2);
  assert.equal(new Set(mapping.map(row => row.opaqueId)).size, 2);
  assert.match(markdown, /#1 · 学生\n\nProblem S0-01/);
  assert.match(markdown, /#2 · 教师\n\nExplain your reasoning\./);
  assert.match(markdown, /\| 维度 \| 0 \| 1 \| 2 \| 备注 \|/);
  for (const [, description] of Object.values(rubric)) assert.equal(markdown.split(description).length - 1, 2);
  assert.doesNotMatch(markdown + csv, /answer_dump|no_teach|training-source|"total":9/);
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines[0], 'opaqueId,dim,score,msgNums,opportunity,reason,confidence');
  assert.equal(lines.length, 13);
  assert.ok(lines.slice(1).every(line => /^[a-f0-9]{12},[a-z_]+,,,,,$/.test(line)));
});
