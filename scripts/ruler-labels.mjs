import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runId } from '../contracts/artifacts/schema.mjs';
import { executionSuccess, hash, requireThat } from '../contracts/core/schema.mjs';
import { loadRulerSplit, readRulerTask, rulerTaskSource, trainingPlan } from '../contracts/dataset/ruler-expand.mjs';
import { dimensions, outputContract, rubric, ruler } from '../contracts/judge/schema.mjs';
import { verifyRun } from '../src/run-receipts.mjs';

const rubricText = dimensions.map(dim => `**${dim}**\n\n${rubric[dim][1]}`).join('\n\n');
const scale = ['| 维度 | 0 | 1 | 2 | 备注 |', '| --- | --- | --- | --- | --- |', ...dimensions.map(dim => `| ${dim} | | | | |`)].join('\n');
const instructionsText = `# 标注说明

每条约 8–10 分钟。先读学生的起点和全部对话，再按每个维度的原文单独判断。序号 #1 起与裁判的对话视图一致。

在 Markdown 对应分档栏打勾并写备注，或填写 CSV。保留 opaqueId 和 dim。score 填 0、1 或 2，证据不足以定档时留空。msgNums 可填 #2 #3。opportunity 填有、无或证据不足。reason 写评分理由，confidence 可填高、中或低。每个分档都引用至少一处对话，0 分注明学生是否获得表现机会。

至少隔一天盲重标 4 条，另存一份。预计总投入约 3–3.5 小时。保留首次评分原件，提交填写后的表后再核对机器结果。
`;

export function renderLabels(entries, { seed, blindSalt }) {
  const shuffled = entries.map(entry => ({ ...entry, opaqueId: hash(`${seed}:opaque:${blindSalt}:${entry.taskId}:${entry.condition}`).slice(0, 12) }));
  shuffled.sort((a, b) => hash(`${seed}:label:${a.opaqueId}`).localeCompare(hash(`${seed}:label:${b.opaqueId}`)));
  requireThat(new Set(shuffled.map(entry => entry.opaqueId)).size === entries.length, 'blind ID collision');
  const sections = shuffled.map(({ opaqueId, instructions, persona, messages }) => {
    const transcript = messages.map(({ role, text }, i) => `#### #${i + 1} · ${role === 'learner' ? '学生' : '教师'}\n\n${text}`).join('\n\n');
    return [
      `## ${opaqueId}`, '### 题目与学生初始状态', instructions.task_instructions,
      `**学生画像** ${persona}`, `**来意** ${instructions.reason_for_call}`, `**已知** ${instructions.known_info}`, `**不确定** ${instructions.unknown_info}`,
      '### 对话原文', transcript, '### 评分尺子原文', rubricText, '### 标注表', scale,
    ].join('\n\n');
  });
  return {
    markdown: `# 补尺子盲标\n\n${sections.join('\n\n---\n\n')}\n`,
    csv: `opaqueId,dim,score,msgNums,opportunity,reason,confidence\n${shuffled.flatMap(({ opaqueId }) => dimensions.map(dim => `${opaqueId},${dim},,,,,`)).join('\n')}\n`,
    mapping: shuffled.map(({ opaqueId, taskId, condition }) => ({ opaqueId, taskId, condition })),
  };
}

function verifiedTraining(root, id, scenario, split) {
  const verification = verifyRun(root, id);
  requireThat(verification.verified && verification.mode === 'real' && verification.requestCount > 0 && verification.acceptance, `run ${id} must be verified and complete in real mode`);
  const dir = join(root, id);
  const bytes = path => readFileSync(join(root, path));
  const evaluationBytes = bytes(`_receipts/${id}.json`);
  const evaluation = JSON.parse(evaluationBytes);
  const processReceipt = JSON.parse(bytes(`_receipts/${id}.process.json`));
  const manifestBytes = bytes(`${id}/manifest.json`);
  const resultBytes = bytes(`${id}/result.json`);
  const manifest = JSON.parse(manifestBytes);
  const result = JSON.parse(resultBytes);
  for (const record of [evaluation, manifest, result]) requireThat(record.id === id && record.mode === 'real' && record.phase === 'train' && record.scenario === scenario, 'invalid training identity');
  requireThat(processReceipt.evaluationSha256 === hash(evaluationBytes) && evaluation.manifestSha256 === hash(manifestBytes) && evaluation.resultSha256 === hash(resultBytes), 'run receipt digest mismatch');
  requireThat(manifest.identityId === evaluation.identityId && manifest.identityId === hash({ mode: 'real', scenario, identity: manifest.identity }) && manifest.identity.version === 'evaluation-identity-v2' && manifest.identity.ruler === ruler && manifest.identity.judgeOutputContract === outputContract && manifest.identity.dataset.trainSha256 === split.trainSha256, 'ruler or dataset binding mismatch');
  const plan = trainingPlan('train', split);
  requireThat(hash(manifest.planned) === hash(plan) && result.cells.length === plan.length, 'result does not cover the entire training list');
  const usage = { attempts: 0, retries: 0, requestedOutput: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, total: 0, unknown: 0 };
  const cells = plan.map(({ taskId, condition }, i) => {
    const cell = result.cells[i];
    requireThat(cell.taskId === taskId && cell.condition === condition && cell.status === executionSuccess, `incomplete training cell ${taskId}/${condition}`);
    const cellDir = join(dir, taskId, condition);
    const telemetry = JSON.parse(readFileSync(join(cellDir, 'telemetry.json')));
    requireThat(telemetry.length > 0 && telemetry.every(row => row.pid === processReceipt.pid && row.taskId === taskId && row.condition === condition), `telemetry writer or coordinates mismatch for ${taskId}/${condition}`);
    for (const row of telemetry) {
      usage.attempts++;
      usage.retries += Number(row.retryCount > 0);
      usage.requestedOutput += row.requestLimit;
      if (!row.usage?.totalTokens) usage.unknown++;
      else {
        for (const key of ['input', 'cacheRead', 'cacheWrite', 'output']) usage[key] += row.usage[key] ?? 0;
        usage.total += row.usage.totalTokens;
      }
    }
    return { cell, cellDir };
  });
  requireThat(usage.attempts === verification.requestCount && processReceipt.pid === manifest.writer.pid, 'request count or telemetry PID mismatch');
  return { verification, manifest, evaluation, cells, dir, usage, pid: processReceipt.pid, provenance: { runId: id, identityId: manifest.identityId, manifestSha256: evaluation.manifestSha256, evaluationSha256: hash(evaluationBytes) } };
}

export function exportLabels({ generationId, gradingId, root = 'runs', output = join(tmpdir(), 'teacharena', 'ruler-expand', 'labeling', runId(gradingId)) }) {
  const split = loadRulerSplit();
  const generated = verifiedTraining(root, runId(generationId), 'ruler-expand', split);
  const graded = verifiedTraining(root, runId(gradingId), 'ruler-expand-judge-only', split);
  requireThat(hash(graded.manifest.source) === hash(generated.provenance) && hash(graded.evaluation.source) === hash(generated.provenance), 'scoring run uses a different generation source');
  requireThat(generated.evaluation.frozen.length === split.train.length && graded.evaluation.graded.length === split.train.length, 'missing frozen dialogues or grades');
  const rows = JSON.parse(readFileSync(new URL(`../${rulerTaskSource}`, import.meta.url)));
  const entries = generated.cells.map(({ cell, cellDir }, i) => {
    const { taskId, condition } = cell;
    const freeze = generated.evaluation.frozen[i];
    const bytes = readFileSync(join(cellDir, 'transcript.json'));
    const messages = JSON.parse(bytes);
    requireThat(freeze.taskId === taskId && freeze.condition === condition && freeze.path === `${taskId}/${condition}/transcript.json` && freeze.transcriptSha256 === hash(bytes) && hash(freeze.messageIds) === hash(messages.map(m => m.id)), `frozen transcript binding mismatch for ${taskId}`);
    const score = graded.cells[i];
    const grade = graded.evaluation.graded[i];
    const gradeBytes = readFileSync(join(score.cellDir, 'judge.json'));
    requireThat(grade.taskId === taskId && grade.condition === condition && grade.path === `${taskId}/${condition}/judge.json` && grade.sha256 === hash(gradeBytes), `frozen grade digest mismatch for ${taskId}`);
    const judgement = JSON.parse(gradeBytes);
    requireThat(score.cell.scored && score.cell.validTotal && judgement.binding.runId === gradingId && judgement.binding.sourceRunId === generationId && judgement.binding.taskId === taskId && judgement.binding.condition === condition && judgement.binding.viewHash === hash(messages) && hash(judgement.binding.messageIds) === hash(freeze.messageIds), `machine score missing or not bound to ${taskId}`);
    const { user_scenario } = readRulerTask(rows, split, taskId);
    return { taskId, condition, messages, ...user_scenario, score: score.cell, judgement };
  });
  const blindSalt = randomUUID();
  const { markdown, csv, mapping } = renderLabels(entries, { seed: split.seed, blindSalt });
  const json = value => `${JSON.stringify(value, null, 2)}\n`;
  const machine = entries.map(({ taskId, condition, score, judgement }) => ({ taskId, condition, result: score, judgement }));
  const created = [];
  const write = (dir, name, data) => {
    const path = resolve(dir, name);
    const file = openSync(path, 'wx');
    created.push(path);
    try { writeFileSync(file, data); }
    finally { closeSync(file); }
    return { path, sha256: hash(readFileSync(path)) };
  };
  mkdirSync(output, { recursive: true });
  const runs = [generated, graded].map(({ manifest, verification, usage, pid }) => ({ id: manifest.id, limits: manifest.limits, verification, usage, pid }));
  try {
    const mapFile = write(graded.dir, 'blind-mapping.json', json({ blindSalt, entries: mapping }));
    const scoreFile = write(graded.dir, 'machine-scores.json', json(machine));
    const blind = write(output, 'blind.md', markdown);
    const sheet = write(output, 'labels.csv', csv);
    const guide = write(output, 'README.md', instructionsText);
    return { blind, sheet, guide, mapping: mapFile, machine: scoreFile, runs };
  } catch (error) {
    for (const path of created.reverse()) unlinkSync(path);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , generationId, gradingId] = process.argv;
  console.log(JSON.stringify(exportLabels({ generationId, gradingId })));
}
