import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { hash } from '../contracts/core/schema.mjs';
import { splitBinaryOutputContract, splitBinaryRuler, splitQuestions } from '../contracts/judge/binary-v3.mjs';
import { binaryQuestions } from '../contracts/judge/binary.mjs';
import { dimensions } from '../contracts/judge/schema.mjs';
import { exportReport } from '../src/html-report.mjs';

const exporter = resolve('scripts/export-project-report.mjs');
const scratch = resolve('.tmp/scratch/project-report-test');

const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value), 'utf8');
};

function makeSplitCell(dir, id, ruler, folder, cellCoord, repetition) {
  const messages = [0, 1, 2, 3, 4].map(i => ({
    id: `${id}:${cellCoord}:m:${i + 1}`,
    role: i % 2 ? 'teacher' : 'learner',
    turn: Math.ceil(i / 2),
    text: `${cellCoord} message ${i + 1}`,
  }));
  const messageIds = messages.map(m => m.id);
  const binding = {
    runId: id,
    cell: cellCoord,
    ruler,
    messageIds,
    viewHash: hash(messages),
    ...(repetition && { repetition }),
  };
  const answers = Object.fromEntries(Object.entries(binaryQuestions).map(([key, spec]) => {
    const dim = Object.keys(splitQuestions).find(d => Object.hasOwn(splitQuestions[d], key));
    const localSlots = Object.keys(splitQuestions[dim][key].evidence);
    return [key, { answer: false, evidence: Object.fromEntries(localSlots.map(slot => [slot, null])) }];
  }));
  const anchors = {
    misconception_repair: { misconception: null },
    support_escalation_and_fading: { state: null },
    representation_pivot: { oldFrame: null, blocked: null },
  };
  const anchorMessageIds = {
    misconception_repair: {},
    support_escalation_and_fading: {},
    representation_pivot: {},
  };
  answers.V1 = { answer: true, evidence: { prompt: 4 } };
  const refs = Object.fromEntries(Object.keys(answers).map(k => [k, k === 'V1' ? { prompt: messageIds[3] } : {}]));
  const scores = Object.fromEntries(dimensions.map(k => [k, k === 'agency_handoff' ? 0 : k === 'verification_or_transfer' ? 1 : 'N/A']));
  const scoring = { ruler, scores, applicable: ['agency_handoff', 'verification_or_transfer'], points: 1, possible: 4, rate: 0.25 };
  const cellDir = join(dir, folder);
  writeJson(join(cellDir, 'transcript.json'), messages);
  writeJson(join(cellDir, 'telemetry.json'), [{ role: 'judge', turn: 2, call: 1, attempt: 1, usage: { input: 100, output: 50, totalTokens: 150 } }]);
  writeJson(join(cellDir, 'judge.json'), { binding, verdict: { answers, anchors, anchorMessageIds, messageIds: refs, scoring } });
  return scoring;
}

function setupRuns(t) {
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'case-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const s1Root = join(root, 'runs');
  const s1Id = 's1-v3-fixture';
  const s1Dir = join(s1Root, s1Id);
  const s1IdentityId = 'c'.repeat(64);
  const s1Identity = {
    version: 'evaluation-identity-v5',
    ruler: splitBinaryRuler,
    judgeOutputContract: splitBinaryOutputContract,
    freeze: { target: 's1' },
  };
  const s1Scoring = makeSplitCell(s1Dir, s1Id, splitBinaryRuler, 'r1/normal', 'normal', 'r1');
  writeJson(join(s1Dir, 'manifest.json'), {
    id: s1Id,
    scenario: 'S1-judge-freeze',
    mode: 'real',
    identity: s1Identity,
    identityId: s1IdentityId,
    planned: [{ id: 'r1/normal', repetition: 'r1', condition: 'normal' }],
  });
  writeJson(join(s1Dir, 'result.json'), {
    id: s1Id,
    scenario: 'S1-judge-freeze',
    mode: 'real',
    identityId: s1IdentityId,
    acceptance: true,
    cells: [{ id: 'normal', repetition: 'r1', recorded: true, status: 'execution_success', scored: true, validTotal: true, rate: s1Scoring.rate, scoring: s1Scoring }],
  });
  writeJson(join(s1Dir, 'verify-run.json'), {
    runId: s1Id, mode: 'real', conclusion: 'complete', verified: true, requestCount: 6, acceptance: true, exitCode: 0, missing: [], invalid: [],
  });
  writeJson(join(s1Dir, 'freeze-retest-summary.json'), {
    runId: s1Id, mode: 'real', verified: true, frozen: false,
    gates: { realVerified: true, complete: true, s1: true, directed: false, normal: false, repeats: true },
    details: { s1: { ratePasses: 3, targetHits: { answer_dump: 3, lecture: 3, sycophant_close: 3, no_teach: 3 } } },
  });

  const s3Root = join(root, 'stage3-runs');
  const s3Id = 'stage3-dev-v2-fixture';
  const s3Dir = join(s3Root, s3Id);
  const s3IdentityId = 'd'.repeat(64);
  const planned = ['baseline', 'candidate', 'rhetoric'].map(arm => ({
    arm, taskId: 'TA2B-F12-B', student: 'answer-seeker', folder: `${arm}/TA2B-F12-B/answer-seeker`,
  }));
  for (const row of planned) makeSplitCell(s3Dir, s3Id, splitBinaryRuler, row.folder, row.folder);
  writeJson(join(s3Dir, 'manifest.json'), {
    id: s3Id,
    scenario: 'stage3-state-machine',
    mode: 'real',
    identity: { version: 'stage3-dev-v2', ruler: splitBinaryRuler, judgeOutputContract: splitBinaryOutputContract },
    identityId: s3IdentityId,
    planned,
  });
  writeJson(join(s3Dir, 'result.json'), {
    id: s3Id, scenario: 'stage3-state-machine', mode: 'real', identityId: s3IdentityId,
    decision: 'inconclusive', acceptance: false,
    cells: planned.map(row => ({ ...row, status: 'scored' })),
  });
  writeJson(join(s3Dir, 'verify-run.json'), {
    runId: s3Id, mode: 'real', conclusion: 'complete', verified: true, requestCount: 18, acceptance: false, exitCode: 1, missing: [], invalid: [],
  });
  writeJson(join(s3Dir, 'report.json'), {
    decision: 'inconclusive',
    devScreenOnly: true,
    adoption: false,
    dimensions: {
      agency_handoff: { pairedFromBaseline: { candidate: { mean: 0.041667, pairs: 24 }, rhetoric: { mean: -0.041667, pairs: 24 } } },
      verification_or_transfer: { pairedFromBaseline: { candidate: { mean: -0.208333, pairs: 24 }, rhetoric: { mean: 0, pairs: 24 } } },
    },
    totalRate: { candidate: { points: -2.847222, pairs: 24 }, rhetoric: { points: 0.4, pairs: 24 } },
    gates: {
      machineA: { status: 'fail' }, cMean: { status: 'pass' }, cFakeHits: { status: 'inconclusive' },
      exposure: { status: 'inconclusive' }, blindHits: { status: 'inconclusive' }, blindGainPairs: { status: 'inconclusive' },
      p: { status: 'pass' }, v: { status: 'fail' }, total: { status: 'pass' },
    },
  });

  return { root, s1Root, s1Id, s3Root, s3Id, outDir: join(root, 'report') };
}

function runCli(...args) {
  return spawnSync(process.execPath, [exporter, ...args], { encoding: 'utf8' });
}

test('exports offline multi-page project report bundle with strict CSP, inline SVG, wording compliance, and working drill-down links', t => {
  const f = setupRuns(t);
  const res = runCli('--out-dir', f.outDir, '--s1-run', f.s1Id, '--s1-root', f.s1Root, '--stage3-run', f.s3Id, '--stage3-root', f.s3Root);
  assert.equal(res.status, 0, res.stderr);
  const payload = JSON.parse(res.stdout);
  assert.equal(payload.issues, 0);

  const indexPath = join(f.outDir, 'index.html');
  const s1Path = join(f.outDir, 'runs', `${f.s1Id}.html`);
  const s3Path = join(f.outDir, 'runs', `${f.s3Id}.html`);
  assert.equal(existsSync(indexPath), true);
  assert.equal(existsSync(s1Path), true);
  assert.equal(existsSync(s3Path), true);

  const indexHtml = readFileSync(indexPath, 'utf8');
  assert.match(indexHtml, /default-src 'none'/);
  assert.doesNotMatch(indexHtml, /https?:\/\//i);
  assert.match(indexHtml, /<svg\b[^>]*>[\s\S]*<\/svg>/);
  assert.match(indexHtml, new RegExp(`href="runs/${f.s1Id}\\.html"`));
  assert.match(indexHtml, new RegExp(`href="runs/${f.s3Id}\\.html"`));
  assert.match(indexHtml, /带边界采用/);
  assert.match(indexHtml, /不采用/);
  assert.match(indexHtml, /node scripts\/export-project-report\.mjs/);
  assert.doesNotMatch(indexHtml, /e1-binary-v3[^。\n]*已冻结/);

  const s1Html = readFileSync(s1Path, 'utf8');
  const s3Html = readFileSync(s3Path, 'utf8');
  assert.match(s1Html, /href="\.\.\/index\.html"/);
  assert.match(s3Html, /href="\.\.\/index\.html"/);
  assert.doesNotMatch(s1Html, /id="issues-title"/);
  assert.doesNotMatch(s3Html, /id="issues-title"/);

  // Verify inline tab interaction script runs cleanly in a sandboxed VM context
  const script = indexHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'index.html should contain inline script for stage switcher');
  const buttons = [...indexHtml.matchAll(/data-stage-tab="([^"]+)"/g)].map(m => ({
    tab: m[1],
    attrs: new Map([['aria-selected', m[1] === 'all' ? 'true' : 'false']]),
    setAttribute(k, v) { this.attrs.set(k, v); },
    getAttribute(k) { return this.attrs.get(k); },
    dataset: { stageTab: m[1] },
  }));
  const panels = [...indexHtml.matchAll(/data-stage-panel="([^"]+)"/g)].map(m => ({
    panel: m[1],
    hidden: false,
    dataset: { stagePanel: m[1] },
  }));
  assert.ok(buttons.length >= 4 && panels.length >= 3);
  let clickHandler;
  runInNewContext(script, {
    document: {
      querySelectorAll: sel => sel === '[data-stage-tab]' ? buttons : panels,
      addEventListener: (ev, fn) => { if (ev === 'click') clickHandler = fn; },
    },
  });
  assert.equal(typeof clickHandler, 'function');
  clickHandler({ target: { closest: () => buttons.find(b => b.tab === 'stage3') } });
  assert.equal(panels.find(p => p.panel === 'stage3').hidden, false);
  assert.equal(panels.find(p => p.panel === 'stage1').hidden, true);
});

test('refuses overwrite without --force and overwrites cleanly with --force', t => {
  const f = setupRuns(t);
  const first = runCli('--out-dir', f.outDir, '--s1-run', f.s1Id, '--s1-root', f.s1Root, '--stage3-run', f.s3Id, '--stage3-root', f.s3Root);
  assert.equal(first.status, 0, first.stderr);

  const second = runCli('--out-dir', f.outDir, '--s1-run', f.s1Id, '--s1-root', f.s1Root, '--stage3-run', f.s3Id, '--stage3-root', f.s3Root);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /--force|已存在/);

  const forced = runCli('--out-dir', f.outDir, '--s1-run', f.s1Id, '--s1-root', f.s1Root, '--stage3-run', f.s3Id, '--stage3-root', f.s3Root, '--force');
  assert.equal(forced.status, 0, forced.stderr);
});

test('supports validated --stage3-html fallback and rejects bad fallback HTML', t => {
  const f = setupRuns(t);
  const preExported = join(f.root, 'pre-stage3.html');
  exportReport(f.s3Id, preExported, f.s3Root);

  const ok = runCli('--out-dir', f.outDir, '--s1-run', f.s1Id, '--s1-root', f.s1Root, '--stage3-run', f.s3Id, '--stage3-html', preExported);
  assert.equal(ok.status, 0, ok.stderr);
  const copiedS3 = readFileSync(join(f.outDir, 'runs', `${f.s3Id}.html`), 'utf8');
  assert.match(copiedS3, /href="\.\.\/index\.html"/);
  assert.doesNotMatch(copiedS3, /id="issues-title"/);

  const badExternal = join(f.root, 'bad-ext.html');
  writeFileSync(badExternal, `<!doctype html><html><head><title>${f.s3Id}</title><script src="https://bad.invalid/x.js"></script></head><body><main></main></body></html>`);
  const failExt = runCli('--out-dir', join(f.root, 'out2'), '--s1-run', f.s1Id, '--s1-root', f.s1Root, '--stage3-run', f.s3Id, '--stage3-html', badExternal);
  assert.notEqual(failExt.status, 0);
  assert.match(failExt.stderr, /外网|external|http/i);

  const badIssues = join(f.root, 'bad-issues.html');
  writeFileSync(badIssues, `<!doctype html><html><head><title>${f.s3Id}</title></head><body><main><h2 id="issues-title">err</h2></main></body></html>`);
  const failIssues = runCli('--out-dir', join(f.root, 'out3'), '--s1-run', f.s1Id, '--s1-root', f.s1Root, '--stage3-run', f.s3Id, '--stage3-html', badIssues);
  assert.notEqual(failIssues.status, 0);
  assert.match(failIssues.stderr, /issues-title|不一致/);
});
