import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cellIds, filenames } from '../contracts/artifacts/schema.mjs';
import { failure } from '../contracts/core/schema.mjs';
import { verifyBatchRun } from './cell-batch-verification.mjs';
import { checkSnapshot, checkout } from './real-preflight.mjs';
import { atomicBytes, atomicJson, readRequestEvents, receiptPaths } from './receipt-files.mjs';
import { s1Scenario } from './s1-binary-plan.mjs';
import { judgeContrastScenario } from './judge-contrast-plan.mjs';
import { judgeBakeoffScenario } from './judge-bakeoff-plan.mjs';
import { verifyS1Artifacts } from './s1-binary-verification.mjs';
import { judgeCandidates } from '../config/judge-contrast.mjs';
import { splitJudgeCandidates } from '../config/judge-bakeoff.mjs';

const safeOptions = new Set(['--mode', '--run-root', '--id', '--scenario', '--phase', '--freeze', '--judge-only', '--max-attempts', '--max-requested-output-tokens', '--harness', '--source-root', '--preregistration', '--preregistration-sha256', '--concurrency', '--judge-policy']);
const safeValues = new Set(['offline', 'real', 'E1', 'E2', 'ruler-expand', 'train', 'test', 'ab', 'baseline', 'improved', 'rhetoric', s1Scenario, judgeContrastScenario, judgeBakeoffScenario]);
const pathFor = (root, id, suffix) => join(root, '_receipts', `${id}.${suffix}.json`);
const isoNow = () => new Date().toISOString();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digestBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256 = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function parameterSummary(argv) {
  const flags = [], values = {};
  for (let index = 0; index < argv.length; index++) {
    const [name, inline] = argv[index].split('=', 2);
    if (!name.startsWith('--')) continue;
    flags.push(safeOptions.has(name) || ['--estimate-only', '--confirm-cost', '--generate-only', '--resume'].includes(name) ? name : '<unknown>');
    if (!safeOptions.has(name)) continue;
    const value = inline ?? (argv[index + 1]?.startsWith('--') ? undefined : argv[++index]);
    if (value === undefined) continue;
    const safe = ['--mode', '--scenario', '--phase', '--harness'].includes(name) && safeValues.has(value)
      || name === '--judge-policy' && (Object.hasOwn(judgeCandidates, value) || Object.hasOwn(splitJudgeCandidates, value))
      || (name.startsWith('--max-') || name === '--concurrency') && /^\d+$/.test(value)
      || name === '--freeze' && /^[a-f0-9]{40}$/.test(value)
      || name === '--preregistration-sha256' && sha256(value);
    values[name.slice(2).replaceAll('-', '_')] = safe ? value : '<redacted>';
  }
  return { flags: [...new Set(flags)].sort(), values };
}

export function startRunReceipt({ root = 'runs', id = randomUUID(), mode, argv = process.argv.slice(2), resume, manifest }) {
  root = resolve(root);
  const processIndex = resume?.processIndex ?? 1;
  const paths = receiptPaths(root, id, processIndex);
  const { start: startPath, journal: requestPath, process: processPath } = paths;
  for (const path of [requestPath, processPath, ...(resume ? [] : [join(root, id), paths.latest])]) {
    if (existsSync(path)) throw Object.assign(new Error(`run ID already in use: ${id}`), { code: 'EEXIST' });
  }
  const snapshot = checkSnapshot(checkout);
  if (resume && (snapshot.head !== resume.head || mode === 'real' && !snapshot.clean)) throw Error('resume HEAD or worktree changed before claiming the process');
  if (manifest && mode === 'real' && (!snapshot.clean || snapshot.head !== manifest.checkReceipt?.head)) throw failure('preflight_failed', {}, 'checkout changed before claiming the run');
  const writer = { pid: process.pid, startedAt: isoNow() };
  const start = {
    runId: id,
    head: snapshot.head,
    clean: snapshot.clean,
    mode: ['offline', 'real'].includes(mode) ? mode : 'unknown',
    parameters: parameterSummary(argv),
    ...writer,
    ...(manifest && { batchManifest: { ...manifest, writer } }),
    ...(resume && { resume: { processIndex, previousSha256: resume.previousSha256 } }),
  };
  atomicJson(startPath, start);
  writeFileSync(requestPath, '', { flag: 'wx' });
  let evaluationSha256, batchJournal;
  const recorder = {
    start,
    startPath,
    requestPath,
    processPath,
    processIndex,
    beginBatch(manifestSha256, concurrency) {
      batchJournal = '';
      recorder.append({ type: 'batch_start', manifestSha256, concurrency, startHash: digest(start) });
    },
    publishEvaluation(evaluation) {
      if (batchJournal !== undefined) {
        evaluationSha256 = atomicJson(paths.evaluation, evaluation);
        atomicJson(paths.latest, evaluation, true);
      } else evaluationSha256 = atomicJson(paths.latest, evaluation);
    },
    append(event) {
      const line = `${JSON.stringify({ ...event, timestamp: isoNow() })}\n`;
      if (batchJournal !== undefined) {
        const next = batchJournal + line;
        atomicBytes(requestPath, Buffer.from(next), true);
        batchJournal = next;
        return;
      }
      const fd = openSync(requestPath, 'a');
      try {
        appendFileSync(fd, line);
        fsyncSync(fd);
      } finally { closeSync(fd); }
    },
    finish({ exitCode, acceptance = null, error = null }) {
      const requests = readRequestEvents(requestPath);
      atomicJson(processPath, {
        runId: id,
        head: start.head,
        pid: start.pid,
        startHash: digest(start),
        exitCode,
        endedAt: isoNow(),
        requestCount: requests.filter(event => event.type === 'request_start').length,
        acceptance,
        ...((batchJournal !== undefined || manifest || resume) && { processIndex, journalSha256: digestBytes(readFileSync(requestPath)) }),
        ...(evaluationSha256 && { evaluationSha256 }),
        ...(error && { error }),
      });
    },
  };
  return recorder;
}

export function installRunReceiptHandlers(recorder, getAcceptance = () => null) {
  let termination;
  const onSignal = signal => {
    termination = signal;
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  const onInt = () => onSignal('SIGINT');
  const onTerm = () => onSignal('SIGTERM');
  const onException = error => {
    console.error(error?.message ?? String(error));
    termination = 'exception';
    process.exit(1);
  };
  process.once('exit', exitCode => {
    try { recorder.finish({ exitCode, acceptance: getAcceptance(), error: termination }); }
    catch (error) {
      console.error(`process receipt write failed: ${error.message}`);
      if (exitCode === 0) process.exitCode = 1;
    }
  });
  process.once('SIGINT', onInt);
  process.once('SIGTERM', onTerm);
  process.once('uncaughtException', onException);
  process.once('unhandledRejection', onException);
}

export function trackedFetch(fetchImpl, recorder, callId) {
  let sequence = 0;
  return async (input, init) => {
    const requestId = `${callId}:${++sequence}`;
    recorder.append({ type: 'request_start', callId, requestId });
    let response;
    try {
      response = await fetchImpl(input, { ...init, redirect: 'manual' });
    } catch (error) {
      recorder.append({ type: 'request_end', callId, requestId, error: 'transport_failure' });
      throw error;
    }
    recorder.append({ type: 'request_end', callId, requestId, status: response.status });
    return response;
  };
}

export function verifyRun(root, id) {
  root = resolve(root);
  const batch = verifyBatchRun(root, id);
  if (batch) return batch;
  const missing = [], invalid = [];
  const load = (path, label, expectedHash) => {
    if (!existsSync(path)) {
      missing.push(label);
      return null;
    }
    try {
      const bytes = readFileSync(path);
      const value = JSON.parse(bytes);
      if (expectedHash && digestBytes(bytes) !== expectedHash) invalid.push(`${label} digest differs from receipt`);
      if (record(value)) return value;
    } catch {}
    invalid.push(`${label} is not a JSON object`);
    return null;
  };
  const start = load(pathFor(root, id, 'start'), 'startup record');
  const receipt = load(pathFor(root, id, 'process'), 'process receipt');
  const requestPath = join(root, '_receipts', `${id}.requests.jsonl`);
  let requests = null;
  if (!existsSync(requestPath)) missing.push('request log');
  else {
    try { requests = readRequestEvents(requestPath); }
    catch { invalid.push('request log is malformed'); }
  }
  function validate(label, value, fields) {
    if (!value) return;
    for (const [field, valid] of Object.entries(fields)) {
      if (!Object.hasOwn(value, field)) invalid.push(`${label} missing ${field}`);
      else if (!valid(value[field])) invalid.push(`${label} invalid ${field}`);
    }
  }
  const shared = { runId: x => x === id, head: x => typeof x === 'string' && /^[a-f0-9]{40,64}$/.test(x), pid: x => Number.isSafeInteger(x) && x > 0 };
  validate('startup record', start, { ...shared, clean: x => typeof x === 'boolean', mode: x => ['offline', 'real', 'unknown'].includes(x), parameters: record, startedAt: time });
  validate('process receipt', receipt, { ...shared, exitCode: x => Number.isInteger(x) && x >= 0 && x <= 255, endedAt: time, requestCount: x => Number.isSafeInteger(x) && x >= 0, acceptance: x => [null, true, false].includes(x), startHash: sha256 });
  if (start && receipt) {
    for (const field of ['runId', 'head', 'pid']) if (start[field] !== receipt[field]) invalid.push(`${field} differs between startup record and process receipt`);
    if (receipt.startHash !== digest(start)) invalid.push('startHash differs from startup record');
    if (Date.parse(receipt.endedAt) < Date.parse(start.startedAt)) invalid.push('endedAt precedes startedAt');
  }
  let observedRequestCount = 0;
  if (requests) {
    const pending = new Map(), seen = new Set();
    for (const [index, event] of requests.entries()) {
      const label = `request log event ${index + 1}`;
      if (!record(event)) { invalid.push(`${label} is not an object`); continue; }
      validate(label, event, {
        type: x => ['request_start', 'request_end'].includes(x), callId: x => typeof x === 'string' && x.length > 0,
        requestId: x => typeof x === 'string' && x.length > 0, timestamp: time,
      });
      const stamp = Date.parse(event.timestamp);
      if (stamp < Date.parse(start?.startedAt) || stamp > Date.parse(receipt?.endedAt)) invalid.push(`${label} timestamp is outside the run`);
      if (event.type === 'request_start') {
        observedRequestCount++;
        if (seen.has(event.requestId)) invalid.push(`${label} duplicates requestId`);
        seen.add(event.requestId);
        pending.set(event.requestId, event);
      } else if (event.type === 'request_end') {
        const begin = pending.get(event.requestId);
        if (!begin) invalid.push(`${label} has no preceding request_start`);
        else if (begin.callId !== event.callId || Date.parse(begin.timestamp) > stamp) invalid.push(`${label} contradicts request_start callId or timestamp`);
        pending.delete(event.requestId);
        if (Object.hasOwn(event, 'status') === Object.hasOwn(event, 'error') || !(event.error === 'transport_failure' || Number.isInteger(event.status) && event.status >= 100 && event.status <= 599)) invalid.push(`${label} invalid status or error`);
      }
    }
    for (const requestId of pending.keys()) invalid.push(`request ${requestId} missing request_end`);
    if (receipt && receipt.requestCount !== observedRequestCount) invalid.push('requestCount differs from request log');
    if (start && start.mode !== 'real' && observedRequestCount) invalid.push('request log contradicts startup mode');
  }
  const evaluationReceiptPath = join(root, '_receipts', `${id}.json`);
  const launchScenario = start?.parameters?.values?.scenario;
  const requiresAnchor = receipt && (Object.hasOwn(receipt, 'evaluationSha256') || ['ruler-expand', s1Scenario].includes(launchScenario) && typeof receipt.acceptance === 'boolean');
  if (requiresAnchor && !sha256(receipt.evaluationSha256)) invalid.push('process receipt missing valid evaluationSha256');
  if (receipt && (requiresAnchor || existsSync(evaluationReceiptPath))) {
    const evaluation = load(evaluationReceiptPath, 'evaluation receipt', receipt.evaluationSha256);
    if (evaluation) {
      if (evaluation.acceptance !== receipt.acceptance) invalid.push('acceptance differs between evaluation receipt and process receipt');
      if (evaluation.id !== id) invalid.push('evaluation receipt id differs from requested ID');
      if (start && evaluation.mode !== start.mode) invalid.push('mode differs between evaluation receipt and startup record');
      const checkArtifact = (path, expected) => {
        if (!sha256(expected)) { invalid.push(`${path} missing valid digest`); return; }
        try {
          const bytes = readFileSync(join(root, id, path));
          if (digestBytes(bytes) !== expected) invalid.push(`${path} digest differs from evaluation receipt`);
          else return bytes;
        } catch (error) {
          if (error.code === 'ENOENT') missing.push(path);
          else invalid.push(`${path} could not be read`);
        }
      };
      if (launchScenario === s1Scenario || evaluation.scenario === s1Scenario) {
        verifyS1Artifacts({ id, start, receipt, evaluation, requests, checkArtifact, invalid });
      } else if (launchScenario === 'ruler-expand' || ['ruler-expand', 'ruler-expand-judge-only'].includes(evaluation.scenario)) {
        checkArtifact(filenames.manifest, evaluation.manifestSha256);
        const result = checkArtifact(filenames.result, evaluation.resultSha256);
        const judgeOnly = evaluation.scenario === 'ruler-expand-judge-only';
        const test = evaluation.phase === 'test' || start?.parameters?.values?.phase === 'test';
        const ab = evaluation.phase === 'ab' || start?.parameters?.values?.phase === 'ab';
        const checkArtifacts = kind => {
          const grading = kind === 'graded';
          const artifacts = evaluation[kind];
          if (!Array.isArray(artifacts)) { invalid.push(`evaluation receipt does not list ${kind} artifacts`); return []; }
          return artifacts.map(artifact => {
            const { taskId, condition, path } = artifact ?? {};
            if (typeof taskId !== 'string' || !/^S0-\d+$/.test(taskId) || !cellIds.includes(condition) || path !== `${taskId}/${condition}/${grading ? filenames.judge : filenames.transcript}`) invalid.push('invalid frozen artifact coordinate');
            else checkArtifact(path, grading ? artifact.sha256 : artifact.transcriptSha256);
            return `${taskId}:${condition}`;
          });
        };
        if (test || ab) {
          const phase = ab ? 'ab' : 'test';
          if (test && judgeOnly || evaluation.phase !== phase || start?.parameters?.values?.phase !== phase) invalid.push('holdout phase differs between receipts');
          const lists = [checkArtifacts('frozen'), checkArtifacts('graded')];
          if (result) {
            try {
              const parsed = JSON.parse(result);
              if (parsed.phase !== phase || parsed.acceptance !== receipt.acceptance) invalid.push('holdout result and receipts disagree');
              const valid = parsed.cells.filter(cell => cell.validTotal === true).map(cell => `${cell.taskId}:${cell.condition}`);
              if (new Set(valid).size !== valid.length || lists.some(list => digest(list) !== digest(valid))) invalid.push('holdout artifact coordinates differ from scored cells');
            } catch { invalid.push('invalid holdout result'); }
          }
        } else {
          checkArtifacts(judgeOnly ? 'graded' : 'frozen');
        }
      }
    }
  }
  if (receipt && receipt.acceptance === true && receipt.exitCode !== 0) invalid.push('exitCode contradicts acceptance');
  const verified = missing.length === 0 && invalid.length === 0;
  return {
    runId: id,
    verified,
    conclusion: verified ? 'complete' : start && missing.includes('process receipt') ? 'unfinished' : 'invalid',
    missing,
    invalid,
    ...(start && { startedAt: start.startedAt, head: start.head, mode: start.mode }),
    ...(receipt && { exitCode: receipt.exitCode, endedAt: receipt.endedAt, requestCount: receipt.requestCount, acceptance: receipt.acceptance }),
    ...(requests && { observedRequestCount }),
  };
}
