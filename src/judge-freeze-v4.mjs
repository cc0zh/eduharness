import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { splitJudgeCandidates } from '../config/judge-bakeoff.mjs';
import { exact, hash, requireThat } from '../contracts/core/schema.mjs';
import { bindBinary } from '../contracts/judge/binary.mjs';
import { splitBinaryOutputContract, splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { splitBinaryV4IdentityVersion, splitBinaryV4Ruler } from '../contracts/judge/binary-v4.mjs';
import { readLocked } from '../scripts/reasoning-off-plan.mjs';
import { readBatch } from './cell-batch-verification.mjs';
import { bakeoffConcurrency, freezeSlotCount, judgeFreezeBudget, judgeFreezeRunId, judgeFreezeScenario,
  judgeFreezeV4A2Case, judgeFreezeV4Fingerprint, judgeFreezeV4JudgingFiles, judgeFreezeV4ParentSha256,
  judgeFreezeV4ProbePurpose, judgeFreezeV4RunId, judgeFreezeV4Scenario, judgeFreezeV4SlotCount } from './judge-bakeoff-plan.mjs';
import { contrastRegistration } from './judge-contrast-plan.mjs';
import { checkout } from './real-preflight.mjs';
import { jsonBytes } from './receipt-files.mjs';
import { evaluationIdentity } from './run.mjs';
import { splitMaxAttempts, splitStopRules } from './split-judge-state.mjs';

const root = join(checkout, 'runs');
const parentId = judgeFreezeRunId('gemini');
const candidate = { ...splitJudgeCandidates.gemini, runId: judgeFreezeV4RunId };
const a2Original = 'A2-choose-identity-test';
const a2Retired = 'A2-still-chosen';
const denial = "You didn't come up with an identity test yourself; you only repeated my suggestion.";
const neutralReply = 'Okay.';
const bits = ({ V1, V2, A1, A2 }) => [V1, V2, A1, A2].map(bit => bit === true ? 'Y' : bit === false ? 'N' : '?').join('/');

function validateProbes(probes, archived) {
  const targets = ['V1', 'A1', 'A2'];
  requireThat(Array.isArray(probes) && probes.length === judgeFreezeV4SlotCount - freezeSlotCount
    && targets.every(target => probes.filter(row => row?.target === target).length === 3)
    && new Set(probes.map(row => row.id)).size === probes.length, 'v4 needs three fresh cases per target with unique IDs');
  for (const probe of probes) {
    requireThat(exact(probe, ['id', 'base', 'target', 'truth', 'anchor', 'why', 'edit'])
      && /^probe-[a-z0-9-]{1,65}$/.test(probe.id) && !archived.has(probe.id) && archived.get(probe.base)?.purpose === 'baseline'
      && typeof probe.truth === 'boolean' && Number.isInteger(probe.anchor) && probe.anchor >= 1 && probe.anchor <= 9
      && typeof probe.why === 'string' && probe.why.trim() && !/[\r\n|]/.test(probe.why)
      && exact(probe.edit, ['number', 'text']) && Number.isInteger(probe.edit.number) && probe.edit.number >= 1 && probe.edit.number <= 9
      && typeof probe.edit.text === 'string' && probe.edit.text.trim(), `invalid v4 side-evidence case ${probe.id}`);
  }
}

export function makeJudgeFreezeV4Registration(probes, judgeProxySource) {
  const parent = readBatch(root, parentId);
  const priorIdentity = parent.manifest.identity;
  requireThat(!parent.latest.interrupted && parent.latestResult.acceptance && parent.manifest.scenario === judgeFreezeScenario
    && parent.manifest.mode === 'real' && priorIdentity.preregistrationSha256 === judgeFreezeV4ParentSha256, 'invalid v3 freeze archive');
  requireThat(same(priorIdentity.policy, candidate.policy) && same(priorIdentity.routes, { judge: candidate.route })
    && priorIdentity.judgeTransport.proxySource === judgeProxySource, 'v4 must keep the v3 judge policy, route and proxy');
  const previous = readLocked(join(root, parentId, 'preregistration.md'), judgeFreezeV4ParentSha256).toString('utf8');
  const archivedPlan = contrastRegistration(previous);
  const archived = new Map(archivedPlan.queue.map(row => [row.id, row]));
  validateProbes(probes, archived);
  const inputs = new Map(archivedPlan.queue.filter(row => row.id !== a2Retired).map(row => {
    const bytes = readLocked(join(root, parentId, row.id, 'transcript.json'), row.transcriptSha256);
    return [row.id, { bytes, messages: bindBinary(JSON.parse(bytes)).messages }];
  }));
  const digests = new Set(archivedPlan.queue.map(row => row.transcriptSha256));
  const add = (id, base, purpose, messages) => {
    const bytes = jsonBytes(bindBinary(messages).messages);
    const transcriptSha256 = hash(bytes);
    requireThat(!digests.has(transcriptSha256), `unchanged or duplicate v4 transcript ${id}`);
    digests.add(transcriptSha256);
    inputs.set(id, { bytes, messages });
    return { id, sourceRunId: archived.get(base).sourceRunId, archive: `${parentId}/${base}`, transcriptSha256, purpose };
  };
  const original = inputs.get(a2Original).messages;
  const a2Case = add(judgeFreezeV4A2Case, a2Original, 'primary', [...original,
    { id: `${judgeFreezeV4A2Case}:m:10`, role: 'teacher', turn: 5, text: denial },
    { id: `${judgeFreezeV4A2Case}:m:11`, role: 'learner', turn: 5, text: neutralReply },
  ]);
  const queue = archivedPlan.queue.map(row => row.id === a2Retired ? a2Case : row);
  for (const { id, base, edit, truth, target, anchor } of probes) {
    const original = inputs.get(base).messages;
    requireThat(original[edit.number - 1].text !== edit.text && (!truth || original[anchor - 1].role === (target === 'V1' ? 'teacher' : 'learner')),
      `v4 side-evidence edit or evidence has the wrong shape at ${id}`);
    queue.push(add(id, base, judgeFreezeV4ProbePurpose, original.map((row, i) => i + 1 === edit.number ? { ...row, text: edit.text } : row)));
  }
  const cleanA2Truth = archivedPlan.primary.find(row => row.id === a2Original).truth;
  const primary = archivedPlan.primary.map(row => row.id === a2Retired
    ? { id: a2Case.id, baseline: a2Original, target: 'A2', kind: 'rhetoric', before: cleanA2Truth, truth: cleanA2Truth, expectedEvidence: { choice: 9 } }
    : row.id === 'V2-genuine-reason' ? { ...row, before: { ...row.before, A2: false }, truth: { ...row.truth, A2: false } } : row);

  const ceiling = judgeFreezeBudget(candidate.policy, queue.length);
  const limits = { maxAttempts: ceiling.maxCalls, maxRequestedOutputTokens: ceiling.maxOutputTokens };
  const provenance = { prior: { ...archivedPlan.prior, parentRunId: parentId, parentIdentityId: parent.manifest.identityId } };
  const sources = [...Object.keys(priorIdentity.sources), ...judgeFreezeV4JudgingFiles, 'src/judge-freeze-v4.mjs'];
  const identity = { ...evaluationIdentity({ mode: 'real', limits, provenance, sources }), version: splitBinaryV4IdentityVersion,
    ruler: splitBinaryV4Ruler, judgeOutputContract: splitBinaryOutputContract, policy: candidate.policy, routes: { judge: candidate.route },
    judgePolicy: 'gemini', registeredId: candidate.runId, planned: queue, judgeTransport: priorIdentity.judgeTransport,
    parentRegistrationSha256: judgeFreezeV4ParentSha256, freeze: priorIdentity.freeze };
  identity.judgeFingerprint = judgeFreezeV4Fingerprint(identity);
  const plan = { ruler: identity.ruler, identityVersion: identity.version, judgeOutputContract: identity.judgeOutputContract,
    judgeFingerprint: identity.judgeFingerprint, concurrency: bakeoffConcurrency, dimensions: splitDimensions,
    maxAttemptsPerDimension: splitMaxAttempts, stop: splitStopRules(freezeSlotCount),
    candidates: { gemini: { runId: candidate.runId, route: candidate.route, policy: candidate.policy, limits } },
    parentRegistrationSha256: identity.parentRegistrationSha256, judgeTransport: identity.judgeTransport, freeze: identity.freeze,
    prior: provenance.prior, sources: identity.sources, queue, primary, repeatIds: archivedPlan.repeatIds, probes };
  const gates = previous.slice(previous.indexOf('## 冻结判线'), previous.indexOf('## 额度和停线')).trim();
  const expectations = previous.slice(previous.indexOf('## 构造预期答案'), previous.indexOf('## ①c 定向扰动真值')).trim();
  const truthRows = primary.map(row => `| ${row.id} | ${row.baseline} | ${row.target} | ${row.kind} | ${bits(row.before)} → ${bits(row.truth)} |`).join('\n');
  const probeRows = probes.map(row => `| ${row.id} | ${row.base} | ${row.target} | ${row.truth ? 'Yes' : 'No'} | #${row.anchor} | #${row.edit.number} | ${row.why} |`).join('\n');
  const bytes = Buffer.from(`# 第二轮 ①i 二元尺子 v4 冻结预登记

运行 \`${candidate.runId}\`。沿用 \`${parentId}\` 的模型、端点、固定代理、六维结构、绑定、计分和判线。父预登记 SHA256 \`${identity.parentRegistrationSha256}\`，新裁判指纹 \`${identity.judgeFingerprint}\`。

15 格 S1、36 格原冻结队列只换一格，之后 9 格新扰动。旁证在前 51 格全部结算后才发，不增加 49 格的冻结分母，也不计入任何门禁。只复用已验证的公开对话原件；不读取训练标签、sealed 或留出题。

${gates}

这是阶段 1 最后一次尺子微调。仅按以上预登记门禁和验真证据决定冻结。任一门未达即不冻结、不补跑、不出 v5，不执行带边界冻结或降级。逐格交用户决定下一步。AGY 只作复核参考，不改判线或决定去留。

## 额度和停线

${queue.length} 格 × 6 = ${ceiling.typicalCalls} 次计划调用。保留全批 8 次额外恢复额度，硬上限 **${limits.maxAttempts} 次、${limits.maxRequestedOutputTokens} 个预留输出 token**。同一进程、并发 4、不续跑；单维最多 3 次、120 秒本地截止、4,096 输出 token、3,072 实报推理 token 上限。连续三次供应商或传输失败、连续三格失败、累计八格失败或预算不足即停；已发请求照常结算，不换路由、不再启动。

${expectations}

## ①c 定向扰动真值

在新口径中，\`${a2Retired}\` 的 A2 真值为 No。#6 已指定求导检验，#7 调整常数并按该方法验证；同样只改新登记中 \`V2-genuine-reason\` 的旁列 A2 真值。旧记录不改，\`${a2Retired}\` 不发新请求。

\`${a2Case.id}\` 从 \`${a2Original}\` 保留 #1–#9，#10 追加教师否认（“${denial}”），#11 恢复完整往返（“${neutralReply}”）。#9 仍在最后三分之一，学生自提 \`b is a\` 并说明对象同一与值相等的区别；A2=Yes，锚点仍是 #9。Yes→Yes 配对，共两正两负，其中两正共用同一原创检验，不是两个独立来源。原有 No→Yes 翻转及负例对照保留。逐格报告引用，不为定向矩阵新增引用判线；normal 的原引用判线不变。

| 格子 | 基线 | 目标 | 类别 | V1/V2/A1/A2 改前 → 改后 |
| --- | --- | --- | --- | --- |
${truthRows}

## 新扰动旁证（不作判据）

每格仅替换一则公开消息，具体文字见机器清单。锚点列在 Yes 时为预期证据；在 No 时为要排除的候选消息。分别报告布尔值、实际引用和缺判；不宣称独立留出或泛化通过。

| 格子 | 公开原件 | 目标 | 真值 | 核对锚点 | 改动位置 | 真值依据 |
| --- | --- | --- | --- | --- | --- | --- |
${probeRows}

## 机器清单

\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`
`);
  return { bytes, identity, plan, inputs, candidate, ceiling, source: provenance };
}

export function prepareJudgeFreezeV4(config, estimating) {
  const { registration, registrationDigest, judgePolicy, judgeProxySource, mode, id, concurrency, limits } = config;
  requireThat(mode === 'real' && !config.resume && registration && registrationDigest && judgePolicy === 'gemini', 'v4 requires a real, registered single-process Gemini run');
  requireThat(estimating ? id.toLowerCase() !== candidate.runId : config.root === root && id === candidate.runId, 'use the registered v4 freeze ID and run root');
  const preregistration = readLocked(registration, registrationDigest);
  const { bytes, identity, ...prepared } = makeJudgeFreezeV4Registration(contrastRegistration(preregistration.toString('utf8')).probes, judgeProxySource);
  requireThat(bytes.equals(preregistration) && same(limits, identity.limits) && concurrency === bakeoffConcurrency, 'v4 preregistration, inputs, concurrency or limits changed');
  identity.preregistrationSha256 = registrationDigest;
  return { ...prepared, preregistration, identity, identityId: hash({ mode, scenario: judgeFreezeV4Scenario, identity }) };
}
