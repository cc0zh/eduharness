import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const scratch = resolve('.tmp/scratch/check-docs-test');

function put(root, rel, content) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

function validReadme(overrides = {}) {
  const body = overrides.body ?? [
    '# TeachArena',
    '',
    'TeachArena 是面向教学 Agent 的评测与门控基础设施，用多轮师生对话评估「教师 = 模型 + harness」。',
    '系统通过对话生成、二元裁判、代码计分与收据验真，判断一次改动是否具备采用证据。',
    '项目输出可回读的证据链而非模型排行榜，其内核与门控可直接服务于项目 2。',
    '',
    '## 核心结论',
    '',
    '系统在阶段 1 对 `e1-binary-v3` 采取带边界采用，并在阶段 3 依据预登记判线对候选教师执行不采用决定；阶段 2a 的跨家族盲核属于 AI 审核，而非人工复核。',
    '',
    '完整出处见 [README 数据出处](docs/research/readme-sources.md)，交互总览见 [离线项目报告](docs/report/index.html)，更多文档见 [文档索引](docs/README.md)。',
    '',
    ...Array.from({ length: 120 }, (_, i) => `说明行 ${i + 1}：保留历史记录于 \`runs/example-${i + 1}/result.json\`。`),
  ].join('\n');
  return body;
}

function createMinimalRepo(t) {
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'repo-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  put(root, 'AGENTS.md', '# Entry\n\n- 先看 [docs/README.md](docs/README.md) 与 [docs/status.md](docs/status.md)。\n');
  put(root, 'README.md', validReadme());
  put(root, 'docs/README.md', [
    '# 文档索引',
    '',
    '- [现状](status.md)',
    '- [场景](scenarios.md)',
    '- [手册](runbook.md)',
    '- [术语](glossary.md)',
    '- [历史](history.md)',
    '- [路线图](plans/roadmap.md)',
    '- [归档](archive/README.md)',
    '- [踩坑](learnings/README.md)',
    '- [研究归档](research/README.md)',
    '- [README 出处](research/readme-sources.md)',
    '- [项目报告](report/index.html)',
  ].join('\n'));
  put(root, 'docs/status.md', '# 当前状态\n\n详见 [归档日志](archive/status-log-2026-11.md#stage1-closeout)。\n');
  put(root, 'docs/scenarios.md', '# 验收场景卡\n\n见 [状态](status.md)。\n');
  put(root, 'docs/runbook.md', '# 运行手册\n\n产物保存在 `runs/<id>/`，草稿放在 `.tmp/scratch/<task>/`。\n');
  put(root, 'docs/glossary.md', '# 术语\n\n见 [README](../README.md)。\n');
  put(root, 'docs/history.md', '# 历史\n\n见 [归档索引](archive/README.md)。\n');
  put(root, 'docs/plans/roadmap.md', '# 路线图\n\n见 [状态](../status.md)。\n');
  put(root, 'docs/archive/README.md', '# 历史归档\n\n- [状态流水](status-log-2026-11.md)\n');
  put(root, 'docs/archive/status-log-2026-11.md', '# 历史状态\n\n<a name="stage1-closeout"></a>\n\n## 阶段 1\n\n记录位于 `runs/example/result.json`。\n');
  put(root, 'docs/learnings/README.md', '# 踩坑记录\n\n- [示例条目](2026-11/20261122-sample.md)\n');
  put(root, 'docs/learnings/2026-11/20261122-sample.md', '# 示例条目\n\n回读 `runs/sample/result.json`。\n');
  put(root, 'docs/research/README.md', '# 研究归档\n\n- [README 数据出处](readme-sources.md)\n');
  put(root, 'docs/research/readme-sources.md', '# README 数据出处\n\n- 原件见 `runs/round2-binary-v3-freeze-gemini-01/freeze-retest-summary.json`。\n');
  put(root, 'docs/report/index.html', '<!doctype html><html><head><meta charset="utf-8"><title>Report</title></head><body><a href="runs/s1.html">S1</a></body></html>');
  put(root, 'docs/report/runs/s1.html', '<!doctype html><html><head><meta charset="utf-8"><title>S1</title></head><body><a href="../index.html">Back</a></body></html>');
  put(root, 'contracts/judge/README.md', '# Judge\n\n## 评分维度\n\n规则固定。\n');
  return root;
}

async function loadChecker() {
  return await import('../scripts/check-docs.mjs');
}

test('valid minimal repository passes checkDocs and allows inline code paths to runs and .tmp', async t => {
  const { checkDocs } = await loadChecker();
  const root = createMinimalRepo(t);
  const summary = checkDocs(root);
  assert.ok(summary.markdownFiles >= 12);
  assert.ok(summary.localLinks >= 10);
});

test('rejects stray markdown file at repo root and docs root and unknown docs subdir', async t => {
  const { checkDocs } = await loadChecker();
  for (const [rel, hint] of [
    ['NOTES.md', 'NOTES.md'],
    ['docs/random-dump.md', 'docs/random-dump.md'],
    ['docs/misc/stray.md', 'docs/misc/stray.md'],
  ]) {
    const root = createMinimalRepo(t);
    put(root, rel, '# stray\n');
    assert.throws(() => checkDocs(root), err => err.message.includes(hint));
  }
});

test('enforces line-count budgets for AGENTS.md, docs/status.md, and README.md', async t => {
  const { checkDocs } = await loadChecker();

  const tooLongAgents = createMinimalRepo(t);
  put(tooLongAgents, 'AGENTS.md', Array.from({ length: 31 }, (_, i) => `line ${i + 1}`).join('\n'));
  assert.throws(() => checkDocs(tooLongAgents), /AGENTS\.md/);

  const tooLongStatus = createMinimalRepo(t);
  put(tooLongStatus, 'docs/status.md', Array.from({ length: 101 }, (_, i) => `line ${i + 1}`).join('\n'));
  assert.throws(() => checkDocs(tooLongStatus), /docs\/status\.md/);

  const tooShortReadme = createMinimalRepo(t);
  put(tooShortReadme, 'README.md', '# Short\n\n概述。\n\n[出处](docs/research/readme-sources.md) [报告](docs/report/index.html) [索引](docs/README.md)\n');
  assert.throws(() => checkDocs(tooShortReadme), /README\.md/);

  const tooLongReadme = createMinimalRepo(t);
  put(tooLongReadme, 'README.md', `${validReadme()}\n${Array.from({ length: 110 }, (_, i) => `extra ${i}`).join('\n')}`);
  assert.throws(() => checkDocs(tooLongReadme), /README\.md/);

  const tooLongScenarios = createMinimalRepo(t);
  put(tooLongScenarios, 'docs/scenarios.md', Array.from({ length: 101 }, (_, i) => `line ${i + 1}`).join('\n'));
  assert.throws(() => checkDocs(tooLongScenarios), /docs\/scenarios\.md/);

  const tooLongRunbook = createMinimalRepo(t);
  put(tooLongRunbook, 'docs/runbook.md', Array.from({ length: 121 }, (_, i) => `line ${i + 1}`).join('\n'));
  assert.throws(() => checkDocs(tooLongRunbook), /docs\/runbook\.md/);

  const tooLongGlossary = createMinimalRepo(t);
  put(tooLongGlossary, 'docs/glossary.md', Array.from({ length: 61 }, (_, i) => `line ${i + 1}`).join('\n'));
  assert.throws(() => checkDocs(tooLongGlossary), /docs\/glossary\.md/);
});

test('rejects broken relative links, missing anchors, and clickable links to .tmp, runs, or absolute paths', async t => {
  const { checkDocs } = await loadChecker();

  const brokenLink = createMinimalRepo(t);
  put(brokenLink, 'docs/history.md', '# 历史\n\n见 [不存在](missing.md)。\n');
  assert.throws(() => checkDocs(brokenLink), /missing\.md/);

  const brokenAnchor = createMinimalRepo(t);
  put(brokenAnchor, 'docs/status.md', '# 状态\n\n见 [错锚点](archive/status-log-2026-11.md#missing-anchor)。\n');
  assert.throws(() => checkDocs(brokenAnchor), /missing-anchor/);

  const tmpLink = createMinimalRepo(t);
  put(tmpLink, 'docs/runbook.md', '# 手册\n\n见 [草稿](../.tmp/scratch/note.md)。\n');
  assert.throws(() => checkDocs(tmpLink), /\.tmp/);

  const runsLink = createMinimalRepo(t);
  put(runsLink, 'docs/learnings/2026-11/20261122-sample.md', '# 示例条目\n\n见 [原件](../../../runs/r1/result.json)。\n');
  assert.throws(() => checkDocs(runsLink), /runs/);

  const absLink = createMinimalRepo(t);
  put(absLink, 'docs/scenarios.md', '# 场景\n\n见 [外部](D:\\Code\\resume\\notes.md)。\n');
  assert.throws(() => checkDocs(absLink), /绝对路径|D:/);
});

test('supports GitHub #L line anchors and rejects out-of-range line anchors', async t => {
  const { checkDocs } = await loadChecker();
  const validLineAnchor = createMinimalRepo(t);
  put(validLineAnchor, 'docs/history.md', '# 历史\n\n见 [契约第 1-3 行](../contracts/judge/README.md#L1-L3)。\n');
  assert.doesNotThrow(() => checkDocs(validLineAnchor));

  const badLineAnchor = createMinimalRepo(t);
  put(badLineAnchor, 'docs/history.md', '# 历史\n\n见 [越界](../contracts/judge/README.md#L1-L999)。\n');
  assert.throws(() => checkDocs(badLineAnchor), /L1-L999/);
});

test('enforces index coverage for learnings, archive, and plans', async t => {
  const { checkDocs } = await loadChecker();

  const orphanLearning = createMinimalRepo(t);
  put(orphanLearning, 'docs/learnings/2026-11/20261122-orphan.md', '# 孤儿\n');
  assert.throws(() => checkDocs(orphanLearning), /20261122-orphan\.md/);

  const orphanArchive = createMinimalRepo(t);
  put(orphanArchive, 'docs/archive/orphan.md', '# 旧归档\n');
  assert.throws(() => checkDocs(orphanArchive), /orphan\.md/);

  const orphanPlan = createMinimalRepo(t);
  put(orphanPlan, 'docs/plans/unindexed.md', '# 未登记计划\n');
  assert.throws(() => checkDocs(orphanPlan), /unindexed\.md/);
});

test('enforces static report bundle presence, links, and zero external URLs', async t => {
  const { checkDocs } = await loadChecker();

  const missingReport = createMinimalRepo(t);
  rmSync(join(missingReport, 'docs/report/index.html'));
  assert.throws(() => checkDocs(missingReport), /docs\/report\/index\.html/);

  const brokenReportLink = createMinimalRepo(t);
  put(brokenReportLink, 'docs/report/index.html', '<!doctype html><html><body><a href="runs/missing.html">x</a></body></html>');
  assert.throws(() => checkDocs(brokenReportLink), /runs\/missing\.html/);

  const externalAsset = createMinimalRepo(t);
  put(externalAsset, 'docs/report/index.html', '<!doctype html><html><head><script src="https://cdn.example.invalid/app.js"></script></head><body><a href="runs/s1.html">S1</a></body></html>');
  assert.throws(() => checkDocs(externalAsset), /https:\/\/cdn\.example\.invalid/);
});

test('enforces README provenance and wording redlines while keeping frozen docs/research untouched', async t => {
  const { checkDocs } = await loadChecker();

  const missingSources = createMinimalRepo(t);
  rmSync(join(missingSources, 'docs/research/readme-sources.md'));
  assert.throws(() => checkDocs(missingSources), /readme-sources\.md/);

  const frozenV3Claim = createMinimalRepo(t);
  put(frozenV3Claim, 'README.md', validReadme().replace('带边界采用', '已冻结'));
  assert.throws(() => checkDocs(frozenV3Claim), /已冻结/);

  const adoptedStage3Claim = createMinimalRepo(t);
  put(adoptedStage3Claim, 'README.md', validReadme().replace('不采用决定', '已采用决定'));
  assert.throws(() => checkDocs(adoptedStage3Claim), /阶段 3|已采用/);

  const humanReviewClaim = createMinimalRepo(t);
  put(humanReviewClaim, 'README.md', validReadme().replace('属于 AI 审核，而非人工复核', '已完成人工复核'));
  assert.throws(() => checkDocs(humanReviewClaim), /人工复核/);

  const negativeSectionStart = createMinimalRepo(t);
  put(negativeSectionStart, 'README.md', validReadme().replace('系统在阶段 1', '不能直接证明'));
  assert.throws(() => checkDocs(negativeSectionStart), /不能/);

  const negativeOpening = createMinimalRepo(t);
  put(negativeOpening, 'README.md', validReadme().replace('TeachArena 是面向', '未提供排行榜，面向'));
  assert.throws(() => checkDocs(negativeOpening), /未/);

  const frozenArchiveUntouched = createMinimalRepo(t);
  put(frozenArchiveUntouched, 'docs/research/round2/frozen-note.md', '# 原件\n\n[历史相对路径](../../../.tmp/old.md) [旧运行](../../../runs/old/r.json)\n');
  assert.doesNotThrow(() => checkDocs(frozenArchiveUntouched));
});
