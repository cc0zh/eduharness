import assert from 'node:assert/strict';
import test from 'node:test';
import { cellResult, runId } from './schema.mjs';

test('recorded, scored, and valid total are independent facts', () => {
  const cell = cellResult('normal', { all: [0, null], direct: 0 });
  assert.equal(cell.recorded, true);
  assert.equal(cell.scored, true);
  assert.equal(cell.validTotal, false);
  assert.equal(cell.total, null);
  assert.throws(() => runId('NUL'));
});
