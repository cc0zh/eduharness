import assert from 'node:assert/strict';
import test from 'node:test';
import { splitJudgeCandidates } from '../config/judge-bakeoff.mjs';
import { bakeoffConcurrency, judgeFreezeBudget, judgeFreezeRunId, judgeFreezeScenario } from '../src/judge-bakeoff-plan.mjs';
import { deriveFreezeQueue } from '../src/judge-freeze-retest.mjs';
import { s1Path, s1Plan } from '../src/s1-binary-plan.mjs';

const s1 = s1Plan.map(({ condition, repetition }) => ({ id: s1Path({ condition, repetition }), condition, repetition,
  sourceRunId: 'e2-real-20261119-06', transcriptSha256: 'a'.repeat(64) }));
const archive = Array.from({ length: 36 }, (_, i) => ({ id: `diagnostic-${i}`, fromRun: 'locked-source', sha256: 'b'.repeat(64), purpose: 'primary' }));

test('the freeze plan replays the 15 S1 slots and all 36 archived dialogue occurrences', () => {
  const queue = deriveFreezeQueue('winner', s1, 'archive', archive);
  assert.deepEqual(queue.slice(0, 15).map(row => ({ ...row, archive: undefined })), s1.map(row => ({ ...row, archive: undefined })));
  assert.equal(queue[0].archive, 'winner/r1/normal');
  assert.deepEqual(queue[15], { id: 'diagnostic-0', sourceRunId: 'locked-source', archive: 'archive/diagnostic-0',
    transcriptSha256: 'b'.repeat(64), purpose: 'primary' });
  assert.equal(queue.length, 51);
  assert.throws(() => deriveFreezeQueue('winner', s1.slice(0, 14), 'archive', archive), /frozen S1/);
  assert.throws(() => deriveFreezeQueue('winner', s1, 'archive', [...archive.slice(0, 35), archive[0]]), /archive/);
  assert.throws(() => deriveFreezeQueue('winner', s1, 'archive', [...archive.slice(0, 35), { ...archive[0], id: '../not-allowed' }]), /archive/);
});

test('the formal freeze batch preserves Gemini and the eight-attempt archive recovery allowance', () => {
  assert.equal(judgeFreezeRunId('gemini'), 'round2-binary-v3-freeze-gemini-01');
  assert.equal(judgeFreezeScenario, 'S1-judge-freeze');
  assert.equal(bakeoffConcurrency, 4);
  assert.deepEqual(judgeFreezeBudget(splitJudgeCandidates.gemini.policy), {
    typicalCalls: 306, maxCalls: 314, maxOutputTokens: 1_286_144,
  });
});
