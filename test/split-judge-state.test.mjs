import assert from 'node:assert/strict';
import test from 'node:test';

const state = await import('../src/split-judge-state.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});

function setup(total = 18) {
  assert.ok(state, 'v3 needs a persistent dimension and stop state');
  const progress = state.createSplitProgress(total);
  return {
    progress,
    next: folder => state.splitNext(progress, folder),
    outcome(folder, failureKind, judgement, detail) {
      const { call, nextAttempt, retryFeedback } = state.splitNext(progress, folder);
      const scope = { role: 'judge', turn: 4, call, attempt: nextAttempt };
      const callId = `${folder}:judge:4:${call}:${nextAttempt}`;
      state.reserveSplit(progress, folder, scope, callId);
      const meter = { ...scope, callId, attemptPath: `${folder}/${callId}.json`, failureKind, detail, retryFeedback,
        validationCode: failureKind === 'judge_partial_failure' ? 'structure' : null };
      return state.settleSplit(progress, folder, meter, judgement);
    },
  };
}

test('dimension tries stop at three, 18 uses four failed cells, and other sizes use planned 15%', () => {
  const { progress, next, outcome } = setup();
  const fail = folder => {
    for (const i of [1, 2, 3]) {
      assert.deepEqual(next(folder), { call: 1, nextAttempt: i, retryFeedback: i === 1 ? null : 'structure' });
      const settled = outcome(folder, 'judge_partial_failure', undefined, 'invalid JSON document');
      assert.equal(Boolean(settled.outcome), i === 3);
      if (i === 3) assert.equal(settled.outcome.failure.callId, `${folder}:judge:4:1:3`);
    }
    assert.equal(next(folder), null);
  };
  fail('one');
  fail('two');
  assert.equal(progress.stop, null);
  const success = folder => {
    for (const id of ['M', 'S', 'A', 'P', 'R', 'V']) {
      outcome(folder, null, part(id));
    }
    assert.equal(next(folder), null);
  };
  success('between');
  fail('three');
  assert.equal(progress.stop, null);
  fail('four');
  assert.equal(progress.stop.kind, 'failed_cells_limit');
  assert.equal(progress.failedCells, 4);
  assert.equal(state.splitStopRules(18).failedCells, 4);
  assert.equal(state.splitStopRules(20).failedCells, 3);
  assert.equal(state.splitStopRules(36).failedCells, 6);
});

const questionIds = { M: ['M0', 'M1', 'M2', 'M3'], S: ['S0', 'S1', 'S2', 'S3'], A: ['A1', 'A2'],
  P: ['P0', 'P1', 'P2', 'P3'], R: ['R0', 'R1', 'R2'], V: ['V1', 'V2'] };

function part(key, yes) {
  const answers = Object.fromEntries(questionIds[key].map(id => [id, { answer: id === yes, evidence: id === yes ? { opening: 2 } : {} }]));
  return { binding: { processIndex: 1 }, verdict: { answers, messageIds: {}, normalized: [] } };
}

test('provider or transport failures stop on the third consecutive settlement, other failures reset the streak', () => {
  const { progress, outcome } = setup();
  outcome('a', 'provider_failure');
  outcome('a', 'provider_failure');
  outcome('b', 'judge_partial_failure');
  outcome('a', 'provider_failure');
  outcome('b', 'provider_failure');
  assert.equal(progress.stop, null);
  assert.equal(outcome('c', 'provider_failure').stop.kind, 'consecutive_provider_failures');
});

test('three consecutively failed cells stop before the cumulative four-cell limit', () => {
  const { progress, outcome } = setup();
  for (const folder of ['a', 'b', 'c']) {
    for (const index of [1, 2, 3]) outcome(folder, 'output_truncated');
  }
  assert.equal(progress.stop.kind, 'consecutive_failed_cells');
  assert.equal(progress.failedCells, 3);
});

test('passing S and P are retained but S3 Yes with P1 No invalidates only the assembled cell', () => {
  const { progress, next, outcome } = setup();
  for (const id of ['M', 'S', 'A', 'P', 'R']) {
    assert.equal(outcome('cross', null, part(id, id === 'S' ? 'S3' : undefined)).outcome, undefined);
  }
  const { outcome: terminal } = outcome('cross', null, part('V'));
  assert.equal(terminal.failure.kind, 'judge_partial_failure');
  assert.equal(terminal.failure.crossDimension.code, 'S3_P1');
  assert.equal(progress.crossDimensionFailures, 1);
  assert.equal(progress.failedCells, 1);
  assert.equal(next('cross'), null);
  assert.equal(progress.stop, null);
});

test('a durable successful dimension advances the cursor and an unsettled reservation still consumes its attempt', () => {
  const { progress, next, outcome } = setup();
  outcome('resume', null, part('M'));
  assert.deepEqual(next('resume'), { call: 2, nextAttempt: 1, retryFeedback: null });
  state.reserveSplit(progress, 'resume', { call: 2, attempt: 1 }, 'lost');
  assert.deepEqual(next('resume'), { call: 2, nextAttempt: 2, retryFeedback: null });
  outcome('resume', null, part('S'));
  assert.deepEqual(next('resume'), { call: 3, nextAttempt: 1, retryFeedback: null });
  assert.throws(() => state.reserveSplit(progress, 'resume', { call: 1, attempt: 1 }, 'redraw'), /dimension.*sequence/);
});
