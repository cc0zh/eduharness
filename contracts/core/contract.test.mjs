import assert from 'node:assert/strict';
import test from 'node:test';
import { failure, message } from './schema.mjs';

test('core preserves failure coordinates and rejects empty public messages', () => {
  assert.deepEqual(failure('provider_failure', { role: 'teacher', turn: 1, call: 1 }).failure, { status: 'infra_failure', kind: 'provider_failure', role: 'teacher', turn: 1, call: 1, detail: 'provider_failure' });
  assert.throws(() => message('m1', 'teacher', 1, ' '));
});
