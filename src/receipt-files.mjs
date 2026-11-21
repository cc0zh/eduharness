import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hash } from '../contracts/core/schema.mjs';

export function receiptPaths(root, id, processIndex = 1) {
  const base = join(root, '_receipts', id);
  const stem = processIndex === 1 ? base : `${base}.p${processIndex}`;
  return { start: `${stem}.start.json`, journal: `${stem}.requests.jsonl`, process: `${stem}.process.json`,
    evaluation: `${base}.p${processIndex}.evaluation.json`, latest: `${base}.json` };
}

export const processDir = (runDir, processIndex) => join(runDir, '_processes', String(processIndex));
export const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

export function atomicBytes(path, bytes, replace = false) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx');
  try {
    try {
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    if (replace) renameSync(temporary, path);
    else linkSync(temporary, path);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return hash(bytes);
}

export const atomicJson = (path, value, replace) => atomicBytes(path, jsonBytes(value), replace);

export function readOptional(path) {
  try { return readFileSync(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export function readRequestEvents(path, bytes = readFileSync(path)) {
  const text = bytes.toString('utf8');
  if (!text) return [];
  if (!text.endsWith('\n')) throw Error('request log is truncated');
  return text.slice(0, -1).split('\n').map(JSON.parse);
}
