import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { hash } from '../contracts/core/schema.mjs';
import { dimensions } from '../contracts/judge/schema.mjs';

const script = fileURLToPath(new URL('../scripts/ruler-calibration.mjs', import.meta.url));
const planText = 'Frozen synthetic plan.\n';

function fixture(t, { machineBody, labelScore = '', afterLock, wrongRuler = false } = {}) {
  const run = mkdtempSync(join(tmpdir(), 'ruler-calibration-'));
  t.after(() => rmSync(run, { recursive: true, force: true }));
  const write = (name, data) => writeFileSync(join(run, name), data);
  const json = (name, data) => write(name, JSON.stringify(data));
  const train = ['S0-01', 'S0-02', 'S0-03'];
  const planned = train.map((taskId, i) => ({ taskId, condition: ['no_teach', 'normal', 'answer_dump'][i] }));
  const seed = 'fixture', blindSalt = 'opaque';
  const entries = planned.map(row => ({ ...row, opaqueId: hash(`${seed}:opaque:${blindSalt}:${row.taskId}:${row.condition}`).slice(0, 12) }));
  const trainSha256 = hash(`${train.join('\n')}\n`);
  json('split.json', { train, trainSha256, seed, items: { 'S0-01': { family: 'S0-01' }, 'S0-02': { family: 'S0-01' }, 'S0-03': { family: 'S0-03' } } });
  const ruler = 'locked-ruler';
  json('manifest.json', { id: 'score', phase: 'train', planned, identity: { ruler, dataset: { seed, trainSha256 }, dialogueSource: { runId: 'source' } } });
  json('blind-mapping.json', { entries: entries.toReversed(), blindSalt });
  const header = 'opaqueId,dim,score,msgNums,opportunity,reason,confidence';
  const sheet = draft => [header, ...entries.toReversed().flatMap(({ opaqueId }, i) => dimensions.map((dim, d) => {
    const score = d === 0 ? 2 - i : d === 3 && i === 1 ? (draft ? 1 : labelScore) : 0;
    return `${opaqueId},${dim},${score},#1,有,"${d === 0 && i === 2 ? '存疑：' : ''}#1, says ""check""",高`;
  }))].join('\r\n') + '\r\n';
  const locked = sheet(false), draft = sheet(true);
  write('labels.csv', afterLock ?? locked);
  write('labels.ai.csv', draft);
  write('plan.md', planText);
  json('label-lock.json', { runId: 'score', file: 'labels.csv', sha256: hash(locked), aiDraftSha256: hash(draft), byteEqual: locked === draft, planSha256: hash(planText) });
  const machine = planned.map(({ taskId, condition }, i) => {
    const messageIds = [1, 2].map(n => `source:${taskId}:${condition}:m:${n}`);
    const grades = dimensions.map((dim, d) => [dim, { score: d === 0 ? [2, 1, 1][i] : d === 2 ? [0, 2, 0][i] : 0, reason: '#1 shows the reasoning after the context in #2.', evidence: messageIds.slice(0, 1) }]);
    const total = grades.reduce((n, [, row]) => n + row.score, 0);
    const groups = { teaching: Object.fromEntries(grades.slice(0, 4)), consolidation: Object.fromEntries(grades.slice(4)) };
    return { taskId, condition, result: { taskId, condition, total, scored: true, validTotal: true }, judgement: { binding: { runId: 'score', sourceRunId: 'source', taskId, condition, messageIds, ruler: wrongRuler && i === 0 ? 'another-ruler' : ruler }, groups } };
  });
  write('machine-scores.json', machineBody ?? JSON.stringify(machine));
  return spawnSync(process.execPath, [script, run, ...['labels.ai.csv', 'plan.md', 'split.json'].map(name => join(run, name))], { encoding: 'utf8' });
}

test('offline calibration aligns by identity and reports scores, cluster CI, degeneracy and label edits', t => {
  const { status, stdout, stderr } = fixture(t);
  assert.equal(status, 0, stderr);
  const result = JSON.parse(stdout);
  const [d0, d1, d2, d3] = dimensions.map(dim => result.dimensions[dim]);
  assert.deepEqual(d0.matrix, [[0, 0, 1], [0, 1, 0], [0, 1, 0]]);
  assert.equal(d0.exact, 1);
  assert.equal(d0.twoApart, 1);
  assert.ok(Math.abs(d0.kappa + 2 / 7) < 1e-12);
  assert.deepEqual(d0.ci95, [d0.kappa, 0]);
  assert.equal(d0.undefinedDraws, 0);
  assert.equal(d1.kappa, null);
  assert.equal(d1.ci95, null);
  assert.equal(d1.undefinedDraws, 2000);
  assert.equal(d2.kappa, 0);
  assert.equal(d3.paired, 2);
  assert.equal(d3.missingLabel, 1);
  assert.equal(result.pooled.paired, 17);
  assert.equal(result.pooled.exact, 14);
  assert.equal(result.uncertain.paired, 1);
  assert.equal(result.uncertain.exact, 0);
  assert.equal(result.notUncertain.exact, 14);
  assert.equal(result.edits.length, 1);
  assert.deepEqual(result.edits[0].fields, { score: { ai: '1', locked: '' } });
  assert.equal(result.edits[0].taskId, 'S0-02');
  assert.equal(result.conditionTotals.no_teach.machineTotal, 2);
  assert.equal(result.conditionTotals.normal.labelTotal, null);
  assert.equal(result.conditionTotals.normal.machineTotal, 3);
  const mismatch = result.mismatches.find(row => row.dimension === dimensions[0] && row.taskId === 'S0-01');
  assert.equal(mismatch.labelReason, '存疑：#1, says "check"');
  assert.deepEqual(mismatch.machineReasonRefs, [1, 2]);
  assert.equal(result.sameScoreAudit[dimensions[0]][0].taskId, 'S0-02');
});

test('rejects non-ordinal CSV scores and a broken lock before interpreting machine scores', t => {
  const invalid = fixture(t, { labelScore: '3' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /invalid label score/);
  const tampered = fixture(t, { afterLock: '', machineBody: '' });
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /locked label SHA256 mismatch/);
});

test('rejects empty, truncated and trailing-content machine JSON without publishing a partial report', t => {
  for (const machineBody of ['', '[{"taskId":', '[] trailing']) {
    const res = fixture(t, { machineBody });
    assert.notEqual(res.status, 0);
    assert.equal(res.stdout, '');
    assert.match(res.stderr, /machine-scores\.json/);
  }
});

test('rejects a grade bound to a ruler other than its score run', t => {
  const res = fixture(t, { wrongRuler: true });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /grade binding mismatch at S0-01\/no_teach/);
});
