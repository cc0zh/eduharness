import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { policy } from '../config/e1.mjs';
import { targets } from '../config/e2.mjs';
import { hash } from '../contracts/core/schema.mjs';
import { loadRulerSplit } from '../contracts/dataset/ruler-expand.mjs';
import { bind, dimensions, parseNumberedJudgement, rubric } from '../contracts/judge/schema.mjs';

const id = 'step3-synthetic';
const split = loadRulerSplit();
const conditions = Object.keys(targets);
const startedAt = '2026-01-01T00:00:00.000Z';
const endedAt = '2026-01-01T01:00:00.000Z';
const pid = 140;
const head = '7'.repeat(40);
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  return hash(readFileSync(path));
};
const read = path => JSON.parse(readFileSync(path));
const execute = (root, ...args) => spawnSync(process.execPath, ['scripts/ruler-test-report.mjs', '--run-root', root, '--id', id, ...args], { encoding: 'utf8' });

function fixture(t, { sentinelFailed = false, failedKey, badRaw, lostTelemetry = false, reshape, scoreFor = ({ condition }) => condition === 'normal' ? 1 : 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ruler-report-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const report = file => join(root, id, file);
  const receipt = suffix => join(root, '_receipts', `${id}${suffix}`);
  const freezeBytes = readFileSync(new URL('../contracts/judge/ruler-freeze.json', import.meta.url));
  const freeze = JSON.parse(freezeBytes);
  const coordinates = split.test.map((taskId, i) => ({ taskId, condition: conditions[i % 4] }));
  const n = coordinates.filter(cell => cell.condition === 'no_teach');
  const planned = [...split.test.map(taskId => ({ taskId, condition: 'normal' })), ...coordinates.filter(cell => cell.condition !== 'no_teach'), ...n];
  const limits = { maxAttempts: 1470, maxRequestedOutputTokens: 15035904 };
  const { judgeRoute, policyVersion, ...frozenIdentity } = freeze.identity;
  const identity = {
    ...frozenIdentity, policy, routes: { judge: judgeRoute },
    sources: { ...frozenIdentity.sources, 'contracts/judge/ruler-freeze.json': hash(freezeBytes) },
    dataset: { seed: split.seed, testSha256: split.testSha256, splitSha256: freeze.splitSha256 },
    phase: 'test', planned, maxFailures: 6, limits, sentinel: { trials: 4, minValid: 3 }, freeze: { ...freeze, recordSha256: hash(freezeBytes) },
  };
  reshape?.(identity);
  const base = { id, scenario: 'ruler-expand', phase: 'test', mode: 'real' };
  const manifest = { ...base, identity, identityId: hash({ mode: 'real', scenario: 'ruler-expand', identity }), planned, limits,
    budget: { typicalCalls: 450, maxCalls: limits.maxAttempts, maxOutputTokens: limits.maxRequestedOutputTokens },
    writer: { pid, startedAt }, checkReceipt: { head, passed: 1, status: 'passed', command: 'npm run check', checkedAt: startedAt } };
  const manifestSha256 = write(report('manifest.json'), manifest);
  const messagesByCell = new Map(), cells = [], frozen = [], graded = [], requests = [];
  for (const [i, coordinate] of planned.entries()) {
    const { taskId, condition } = coordinate;
    if (sentinelFailed && n.slice(4).includes(coordinate)) continue;
    const folder = `${taskId}/${condition}`;
    const failed = folder === failedKey || sentinelFailed && n.slice(0, 2).includes(coordinate);
    const messages = Array.from({ length: 9 }, (_, j) => ({ id: `${id}:${taskId}:${condition}:m:${j + 1}`, role: j % 2 ? 'teacher' : 'learner', turn: Math.ceil(j / 2), text: `Visible message ${j + 1}` }));
    messagesByCell.set(folder, messages);
    const messageIds = messages.map(m => m.id);
    const path = `${folder}/transcript.json`;
    const transcriptSha256 = write(report(path), messages);
    if (!failed) frozen.push({ ...coordinate, path, messageIds, transcriptSha256 });
    const { id: viewHash } = bind(messages);
    const score = scoreFor(coordinate);
    const text = JSON.stringify({ results: Object.fromEntries(dimensions.map(dimension => [dimension, {
      score, reason: 'Message #1 starts the observed teaching window.', evidence: [1],
      evidence_groups: [{ claim: 'counterexample', slots: Object.fromEntries(rubric[dimension][0].map(spec => [spec.split(':')[0], { state: 'not_observed', opportunity_numbers: [1], reason: 'Visible window' }])) }],
    }])) });
    const scores = parseNumberedJudgement(text, bind(messages));
    const rawPath = `${folder}/calls/judge-4-1-1.json`;
    const binding = { ...coordinate, runId: id, cell: condition, ruler: freeze.identity.ruler, viewHash, messageIds };
    const call = { role: 'judge', turn: 4, call: 1, attempt: 1 };
    const raw = { ...coordinate, ...call, binding, context: { messages: [{ content: JSON.stringify({ messages: messages.map(({ role, text }, j) => ({ n: j + 1, role, text })) }) }] },
      response: { content: [{ type: 'text', text: i === 0 && badRaw !== undefined ? badRaw(text) : text }], stopReason: failed ? 'length' : 'stop' } };
    write(report(rawPath), raw);
    const usage = i === 0 || failed ? null : { input: 3, cacheRead: 2, cacheWrite: 0, output: 14, totalTokens: 19 };
    const meter = { ...coordinate, ...call, binding, pid: i === 0 && lostTelemetry ? pid + 1 : pid, attemptPath: rawPath,
      requestLimit: 65536, reasoningLimit: 10, reasoningTokens: usage ? 11 : null, usage, detail: failed ? 'local request timeout' : null,
      failureKind: failed ? 'provider_failure' : null, retryCount: 0, stopReason: failed ? 'aborted' : 'stop', judgementMode: judgeRoute.responseFormat,
      provider: judgeRoute.provider, model: judgeRoute.id, policyVersion };
    const meters = [meter];
    if (failed) for (const attempt of [2, 3]) {
      const attemptPath = `${folder}/calls/judge-4-1-${attempt}.json`;
      write(report(attemptPath), { ...raw, attempt });
      meters.push({ ...meter, attempt, attemptPath, retryCount: attempt - 1 });
    }
    write(report(`${folder}/telemetry.json`), meters);
    for (const { attempt } of meters) {
      const callId = `${taskId}:${condition}:judge:4:1:${attempt}`;
      requests.push({ type: 'request_start', callId, requestId: `${callId}:1`, timestamp: startedAt }, { type: 'request_end', callId, requestId: `${callId}:1`, timestamp: endedAt, status: 200 });
    }
    if (failed) {
      cells.push({ ...coordinate, id: condition, recorded: true, status: 'infra_failure', scored: false, validTotal: false, total: null, directAnswer: null,
        failure: { ...coordinate, ...call, attempt: 3, attemptPath: meters.at(-1).attemptPath, status: 'infra_failure', kind: 'provider_failure', detail: 'local request timeout' } });
    } else {
      const path = `${folder}/judge.json`;
      graded.push({ ...coordinate, path, sha256: write(report(path), { binding: { ...binding, ...call, attemptPath: rawPath }, groups: {
        teaching: Object.fromEntries(dimensions.slice(0, 4).map(dim => [dim, scores[dim]])),
        consolidation: Object.fromEntries(dimensions.slice(4).map(dim => [dim, scores[dim]])),
      } }) });
      cells.push({ ...coordinate, id: condition, recorded: true, status: 'execution_success', scored: true, validTotal: true, total: score * dimensions.length, directAnswer: score });
    }
  }
  const acceptance = !sentinelFailed && !failedKey;
  const sentinel = { planned: 4, attempted: 4, valid: sentinelFailed ? 2 : 4, status: sentinelFailed ? 'insufficient_scores' : 'passed' };
  const resultSha256 = write(report('result.json'), { ...base, acceptance, cells, stop: null, sentinel });
  const start = { runId: id, head, pid, startedAt, clean: true, mode: 'real', parameters: { flags: ['--confirm-cost'], values: { scenario: 'ruler-expand', phase: 'test', mode: 'real', max_attempts: String(limits.maxAttempts), max_requested_output_tokens: String(limits.maxRequestedOutputTokens) } } };
  write(receipt('.start.json'), start);
  const evaluationSha256 = write(receipt('.json'), { ...base, identityId: manifest.identityId, manifestSha256, resultSha256, acceptance, frozen, graded });
  write(receipt('.process.json'), { runId: id, head, pid, startHash: hash(start), exitCode: acceptance ? 0 : 1, endedAt, requestCount: requests.length / 2, acceptance, evaluationSha256 });
  writeFileSync(receipt('.requests.jsonl'), requests.map(row => JSON.stringify(row)).join('\n') + '\n');
  const audit = { version: 1, runId: id, identityId: manifest.identityId, manifestSha256, resultSha256, reviewer: 'synthetic reviewer', rows: coordinates.flatMap(({ taskId, condition }) => {
    if (!messagesByCell.has(`${taskId}/${condition}`)) return [];
    const side = name => ({ opportunity: 'yes', support: cells.find(cell => cell.taskId === taskId && cell.condition === name).scored ? 'supported' : 'unknown', messageIds: [messagesByCell.get(`${taskId}/${name}`)[0].id], note: 'Synthetic evidence note.' });
    return [{ taskId, condition, dimension: targets[condition], normal: side('normal'), bad: side(condition) }];
  }) };
  return { root, receipt, report, audit };
}

test('report command exposes its offline interface', () => {
  const output = spawnSync(process.execPath, ['scripts/ruler-test-report.mjs', '--help'], { encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /--run-root.*--id.*--audit/);
});

test('no semantic readback means pending, even with every score and numeric direction', t => {
  const { root, report } = fixture(t);
  const output = execute(root);
  assert.equal(output.status, 0, output.stderr);
  const calc = read(report('test-calculations.json'));
  const draft = read(report('test-audit-draft.json'));
  assert.equal(calc.machineAcceptance, true);
  assert.equal(calc.statisticalVerdict, 'pending');
  assert.equal(calc.groups.answer_dump.total.scored, 7);
  assert.equal(calc.groups.answer_dump.total.hits, 7);
  assert.equal(calc.groups.answer_dump.target.unknownOpportunity, 7);
  assert.equal(calc.groups.answer_dump.target.eligibleWilson95, null);
  assert.equal(calc.telemetry.requests, 50);
  assert.equal(calc.telemetry.requestedOutputTokens, 3276800);
  assert.equal(calc.telemetry.reportedUsage, 49);
  assert.equal(calc.telemetry.unknownUsage, 1);
  assert.equal(calc.telemetry.reasoningOverages, 49);
  const ranked = split.test.filter((_, i) => i % 4 === 0).sort((a, b) => hash(`${split.seed}:audit:answer_dump:${a}`).localeCompare(hash(`${split.seed}:audit:answer_dump:${b}`)));
  assert.deepEqual(draft.rankedDirectionHits.answer_dump.slice(0, 2).map(row => row.taskId), ranked.slice(0, 2));
  assert.equal(draft.rows.length, 25);
  assert.ok(draft.rows[0].bad.judgeMessageIds.length);
  const markdown = readFileSync(report('test-report.md'), 'utf8');
  assert.match(markdown, /25 题.*AI 预标.*[零0].*跨运行/);
  assert.match(markdown, /尺子一致性不足，仅供参考/);
  assert.match(markdown, /--verify-run/);
});

test('explicit side evidence unlocks a deterministic result with planned denominators and whole-family intervals', t => {
  const { root, report, audit } = fixture(t);
  const path = report('audit.json');
  write(path, audit);
  let output = execute(root, '--audit', path);
  assert.equal(output.status, 0, output.stderr);
  const file = report('test-calculations.json');
  const calc = read(file);
  assert.equal(calc.statisticalVerdict, 'passed');
  assert.deepEqual(Object.values(calc.groups).map(row => row.target.planned), [7, 6, 6, 6]);
  assert.equal(calc.groups.answer_dump.target.eligible, 7);
  assert.equal(calc.groups.answer_dump.target.hits, 7);
  assert.deepEqual(calc.groups.answer_dump.target.delta, { n: 7, mean: 1, variance: 0 });
  assert.deepEqual(calc.groups.answer_dump.target.bootstrap95.deltaMean, { interval: [1, 1], definedDraws: 2000 });
  assert.equal(calc.distributions.normal.agency_handoff.levels[1], 25);
  assert.equal(calc.distributions.normal.agency_handoff.unknownOpportunity, 19);
  assert.deepEqual(calc.distributions.normal.agency_handoff.meanBootstrap95.interval, [1, 1]);
  const bytes = readFileSync(file);
  output = execute(root, '--audit', path);
  assert.equal(output.status, 0, output.stderr);
  assert.deepEqual(readFileSync(file), bytes);
  const first = audit.rows.find(row => row.condition === 'answer_dump');
  first.normal.opportunity = 'no';
  write(path, audit);
  output = execute(root, '--audit', path);
  assert.equal(output.status, 0, output.stderr);
  const changed = read(file);
  assert.equal(changed.statisticalVerdict, 'failed');
  assert.equal(changed.groups.answer_dump.target.noOpportunity, 1);
  assert.equal(changed.groups.answer_dump.target.planned, 7);
  assert.equal(changed.groups.answer_dump.target.eligible, 6);
});

test('rejects stale, truncated, and cross-cell audit evidence', t => {
  const { root, report, audit } = fixture(t);
  const path = report('audit.json');
  write(path, { ...audit, resultSha256: '0'.repeat(64) });
  assert.match(execute(root, '--audit', path).stderr, /audit.*resultSha256/);
  audit.rows[0].normal.messageIds = audit.rows[0].bad.messageIds;
  write(path, audit);
  const cross = execute(root, '--audit', path);
  assert.notEqual(cross.status, 0);
  assert.match(cross.stderr, /audit.*normal.*message ID/);
  writeFileSync(path, '{"rows":');
  const truncated = execute(root, '--audit', path);
  assert.notEqual(truncated.status, 0);
  assert.match(truncated.stderr, /audit\.json.*JSON/);
});

test('counts numeric ties and retains same-question dependence when scores vary', t => {
  const { root, report, audit } = fixture(t, { scoreFor: ({ taskId }) => Number(split.test.indexOf(taskId) % 3 === 0) });
  const path = report('audit.json');
  write(path, audit);
  const output = execute(root, '--audit', path);
  assert.equal(output.status, 0, output.stderr);
  const calc = read(report('test-calculations.json'));
  assert.equal(calc.statisticalVerdict, 'failed');
  assert.deepEqual(calc.distributions.normal.misconception_repair.levels, [16, 9, 0]);
  assert.ok(Math.abs(calc.distributions.normal.misconception_repair.variance - 0.24) < 1e-12);
  assert.ok(calc.distributions.normal.misconception_repair.meanBootstrap95.interval[0] < 0.36);
  for (const { total, target } of Object.values(calc.groups)) {
    assert.equal(total.ties, total.planned);
    assert.equal(target.ties, target.planned);
    assert.equal(target.hits, 0);
    assert.deepEqual(target.bootstrap95.deltaMean.interval, [0, 0]);
    assert.equal(target.plannedWilson95[0], 0);
  }
});

test('a rejected ranked evidence hit stays visible and cannot produce a statistical pass', t => {
  const { root, report, audit } = fixture(t);
  const path = report('audit.json');
  const condition = 'answer_dump';
  const ranked = audit.rows.filter(row => row.condition === condition).sort((a, b) => hash(`${split.seed}:audit:${condition}:${a.taskId}`).localeCompare(hash(`${split.seed}:audit:${condition}:${b.taskId}`)));
  ranked[0].normal.support = 'unsupported';
  write(path, audit);
  const output = execute(root, '--audit', path);
  assert.equal(output.status, 0, output.stderr);
  const group = read(report('test-calculations.json')).groups[condition];
  assert.equal(group.verdict, 'pending');
  assert.equal(group.audit.rejected, true);
  assert.deepEqual(group.audit.sampled, ranked.slice(0, 2).map(row => row.taskId));
  assert.equal(group.target.unsupportedEvidence, 1);
  assert.equal(group.target.numericHits, 7);
  assert.equal(group.target.hits, 6);
});

test('all scored pairs but too few numeric hits fail the round even when sampled evidence is pending', t => {
  const nonHits = new Set(split.test.filter((_, i) => i % conditions.length === conditions.indexOf('lecture')).slice(0, 3));
  const { root, report, audit } = fixture(t, { scoreFor: ({ taskId, condition }) => condition === 'normal' || condition === 'lecture' && nonHits.has(taskId) ? 1 : 0 });
  for (const row of audit.rows.filter(row => row.condition === 'lecture' && !nonHits.has(row.taskId))) row.bad.support = 'unsupported';
  const path = report('audit.json');
  write(path, audit);
  const output = execute(root, '--audit', path);
  assert.equal(output.status, 0, output.stderr);
  const calc = read(report('test-calculations.json'));
  assert.equal(calc.groups.lecture.target.numericHits, 3);
  assert.equal(calc.groups.lecture.verdict, 'pending');
  assert.equal(calc.statisticalVerdict, 'failed');
  assert.match(readFileSync(report('test-report.md'), 'utf8'), /lecture.*3\/6.*80%/);
});

test('keeps a missing score and a reviewed unknown opportunity in their planned denominators', t => {
  const { root, report, audit } = fixture(t, { failedKey: `${split.test[0]}/normal` });
  audit.rows = audit.rows.filter(row => row.taskId !== split.test[0]);
  const uncertain = audit.rows.find(row => row.condition === 'lecture');
  Object.assign(uncertain.bad, { opportunity: 'unknown', support: 'unknown', note: 'Reviewed; the evidence does not establish an opportunity.' });
  const path = report('audit.json');
  write(path, audit);
  const output = execute(root, '--audit', path);
  assert.equal(output.status, 0, output.stderr);
  const calc = read(report('test-calculations.json'));
  assert.equal(calc.statisticalVerdict, 'failed');
  assert.equal(calc.groups.answer_dump.target.missingScore, 1);
  assert.equal(calc.groups.answer_dump.target.eligible, 6);
  assert.equal(calc.groups.answer_dump.target.planned, 7);
  assert.equal(calc.groups.lecture.target.unknownOpportunity, 1);
  assert.equal(calc.groups.lecture.target.eligible, 5);
  assert.equal(calc.groups.lecture.target.planned, 6);
  assert.equal(calc.groups.lecture.verdict, 'failed');
});

test('refuses a receipt whose graded artifact was edited after publication', t => {
  const { root, report } = fixture(t);
  const path = `${split.test[0]}/normal/judge.json`;
  const content = read(report(path));
  write(report(path), { ...content, unexpected: true });
  const output = execute(root);
  assert.notEqual(output.status, 0);
  assert.ok(output.stderr.includes(`${path} digest differs from evaluation receipt`));
});

test('keeps failed sentinel, omitted N cells, and failed-call coordinates visible', t => {
  const { root, report, audit } = fixture(t, { sentinelFailed: true });
  const path = report('audit.json');
  write(path, audit);
  const output = execute(root, '--audit', path);
  assert.equal(output.status, 0, output.stderr);
  const calc = read(report('test-calculations.json'));
  assert.equal(calc.machineAcceptance, false);
  assert.equal(calc.statisticalVerdict, 'pending');
  assert.equal(calc.groups.no_teach.verdict, 'pending');
  assert.equal(calc.groups.no_teach.target.planned, 6);
  assert.equal(calc.groups.no_teach.target.missingScore, 4);
  assert.equal(calc.telemetry.localTimeouts, 6);
  assert.equal(calc.telemetry.retries, 4);
  assert.ok(calc.telemetry.failures.some(row => row.condition === 'no_teach' && row.attemptPath.endsWith('/calls/judge-4-1-3.json')));
  const markdown = readFileSync(report('test-report.md'), 'utf8');
  assert.match(markdown, /\| no_teach \/ misconception_repair .*\| 待定 \|/);
  assert.match(markdown, /证据回读：/);
});

for (const [label, badRaw] of [['truncated', text => text.slice(0, -1)], ['empty', () => ''], ['extra text', text => text + '\nnot JSON']]) {
  test(`does not count a score with ${label} raw judge output`, t => {
    const { root, report } = fixture(t, { badRaw });
    const output = execute(root);
    assert.equal(output.status, 0, output.stderr);
    const calc = read(report('test-calculations.json'));
    assert.equal(Object.values(calc.groups).reduce((sum, row) => sum + row.total.scored, 0), 24);
    assert.ok(calc.issues.some(issue => issue.path?.endsWith('/calls/judge-4-1-1.json')));
    assert.notEqual(calc.statisticalVerdict, 'passed');
  });
}

test('checks every telemetry writer PID and refuses a frozen-source mismatch', t => {
  let f = fixture(t, { lostTelemetry: true });
  const output = execute(f.root);
  assert.equal(output.status, 0, output.stderr);
  const calc = read(f.report('test-calculations.json'));
  assert.ok(calc.issues.some(issue => issue.detail.includes('PID')));
  assert.equal(calc.groups.answer_dump.total.scored, 6);
  assert.notEqual(calc.statisticalVerdict, 'passed');
  f = fixture(t, { reshape: identity => { identity.sources = { ...identity.sources, 'src/judge.mjs': '0'.repeat(64) }; } });
  const mismatch = execute(f.root);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /frozen.*src\/judge\.mjs/);
});
