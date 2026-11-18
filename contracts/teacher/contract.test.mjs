import assert from 'node:assert/strict';
import test from 'node:test';
import { publicReply } from './schema.mjs';

test('teacher publishes only nonempty text without internal markers', () => {
  assert.equal(publicReply(' Which way is perpendicular? '), 'Which way is perpendicular?');
  for (const text of [' ', 'teacharena_internal', '<phase>verify</phase>']) assert.throws(() => publicReply(text));
});
