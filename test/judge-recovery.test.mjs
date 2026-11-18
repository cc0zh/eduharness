import assert from 'node:assert/strict';
import test from 'node:test';
import { fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai';
import data from './fixtures/judge-order.json' with { type: 'json' };
import { bind, parseJudge, rubric, ruler } from '../contracts/judge/schema.mjs';
import { policy } from '../config/e1.mjs';
import { Models } from '../src/models.mjs';

const view = bind(Array.from({length: 9}, (_, i) => ({id: `m${i+1}`, role: i % 2 ? 'teacher' : 'learner', text: `source ${i+1}`})));
const key = 'misconception_repair';
function payload(groups, dimension = key) {
  return JSON.stringify({contract_version:ruler, context_id:view.id, results:{[dimension]:{score:2, reason:'Evidence from source.', evidence_groups: groups.map(group => ({claim:group.some(x=>!Array.isArray(x))?'counterexample':'support_chain', slots:Object.fromEntries(rubric[dimension][0].map((slot,i)=>[slot.split(':')[0], Array.isArray(group[i]) ? {state:'observed',message_ids:group[i].map(n=>`m${n}`)} : {state:'not_observed',checked_view_id:view.id,reason:'The cited opportunity did not yield correction.',opportunity_message_ids:group[i].opportunity.map(n=>`m${n}`)}]))}))}}});
}

test('real interleaving and shared group boundaries cannot be repaired by sorting', () => {
  for (const [attempt, error] of [[data.attempt1,/slot order/],[data.attempt2,/group order|overlap/]]) {
    for (const [dimension,groups] of Object.entries(attempt)) assert.throws(() => parseJudge(payload(groups,dimension),view,[dimension]),error);
  }
});

test('judge retry receives the last validation error and equivalent permutations are audited', async () => {
  const rows = [];
  const out = text => fauxAssistantMessage([fauxText(text)]);
  const models = new Models({mode:'offline',save: (raw,row)=>rows.push({raw,row}),responses:[
    out(payload(data.attempt1[key])),
    out(payload([[[7],[8],[9]],[[3,1],[4],[5]]])),
  ]});
  const result = await models.complete({role:'judge',turn:4,call:1},{systemPrompt:'Judge instructions',messages:[{role:'user',content:'{}',timestamp:1}]}, (text,_response,audit)=>parseJudge(text,view,[key],audit));
  assert.equal(result.value[key].score,2);
  assert.deepEqual(result.value[key].evidence,['m1','m3','m4','m5','m7','m8','m9']);
  assert.match(rows[1].raw.context.systemPrompt,/slot order mismatch/);
  assert.equal(rows[1].row.normalized,true);
  assert.ok(rows[1].row.originalOrder.some(change => change.ids?.join() === 'm3,m1'));
  assert.ok(rows[1].row.originalOrder.some(change => change.groups?.join() === '1,0'));
  assert.ok(rows[1].row.timeoutMs > data.attempt3.elapsedMs);
  assert.equal(rows[1].row.timeoutMs,policy.judge.timeoutMs);
});
