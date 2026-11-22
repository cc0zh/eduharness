import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { splitJudgeCandidates } from '../config/judge-bakeoff.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { bindBinary } from '../contracts/judge/binary.mjs';
import { splitBinaryIdentityVersion, splitBinaryOutputContract, splitBinaryRuler, splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { analysis, candidateOrder, proxyProvenance } from '../scripts/judge-bakeoff-report.mjs';
import { readLocked } from '../scripts/reasoning-off-plan.mjs';
import { readBatch } from './cell-batch-verification.mjs';
import { bakeoffConcurrency, freezeArchiveSize, judgeFreezeBudget, judgeFreezeRunId, judgeFreezeScenario,
  originalBakeoffRegistrationSha256, proxyBakeoffRunIds } from './judge-bakeoff-plan.mjs';
import { contrastRegistration } from './judge-contrast-plan.mjs';
import { checkout } from './real-preflight.mjs';
import { evaluationIdentity, source } from './run.mjs';
import { verifyRun } from './run-receipts.mjs';
import { constructExpectations, s1Path, s1Plan, s1Targets } from './s1-binary-plan.mjs';
import { splitMaxAttempts, splitStopRules } from './split-judge-state.mjs';

const root = join(checkout, 'runs');
const proxyAddendumSha256 = '36270ad60ad4c58297305b63f31072d79bbd11d4aa0f253c29ed31c515700b83';
const archiveId = 'round2-perturbation-v2-01';
const archiveRegistrationSha256 = '786b6b8c7904805fce957982f3f2d466959d8e5dc05f8bb6aef2416daf61793b';
const originalS1Id = 's1-binary-round2-01';
const originalS1RegistrationSha256 = '2ed20c5803aaa3d4c01773cbe2f8531083b22693ab05cad5522685aa1c15cf13';
const originalDiagnosticId = 'round2-perturbation-01';
const originalDiagnosticRegistrationSha256 = '06ede0df7584381112813187b44b841f6b1d7e0f66f8c01ad2607e309eb3565e';
const judgingFiles = ['package-lock.json', 'config/e1.mjs', 'config/judge-bakeoff.mjs', 'contracts/judge/binary.mjs',
  'contracts/judge/binary-v3.mjs', 'src/binary-judge-v3.mjs', 'src/models.mjs', 'src/judge-transport.mjs',
  'src/openrouter-proxy.mjs', 'src/provider-response-diagnostics.mjs', 'src/split-judge-state.mjs', 'src/split-judge-replay.mjs'];
const sourceFiles = [...judgingFiles, 'src/judge-freeze-retest.mjs', 'src/judge-bakeoff.mjs', 'src/judge-bakeoff-plan.mjs',
  'src/s1-binary-plan.mjs', 'config/e2.mjs', 'scripts/judge-bakeoff-report.mjs', 'scripts/judge-freeze-retest-report.mjs'];

export function deriveFreezeQueue(winnerRun, s1, archiveRun, archive) {
  requireThat(same(s1.map(row => row.id), s1Plan.map(s1Path)), 'invalid frozen S1 queue');
  requireThat(archive.length === freezeArchiveSize && new Set(archive.map(row => row.id)).size === archive.length
    && archive.every(row => /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(row.id)
      && /^[a-f0-9]{64}$/.test(row.sha256) && typeof row.fromRun === 'string'), 'invalid freeze archive queue');
  return [...s1.map(row => ({ ...row, archive: `${winnerRun}/${row.id}` })), ...archive.map(row => ({
    id: row.id, sourceRunId: row.fromRun, archive: `${archiveRun}/${row.id}`, transcriptSha256: row.sha256, purpose: row.purpose,
  }))];
}

function selectedJudge() {
  const runIds = { ...proxyBakeoffRunIds, qwen: splitJudgeCandidates.qwen.runId };
  const entries = candidateOrder.map(key => {
    const id = runIds[key];
    const verification = verifyRun(root, id);
    requireThat(verification.verified, `invalid selection run ${id}`);
    const batch = readBatch(root, id);
    const registrationSha256 = key === 'qwen' ? originalBakeoffRegistrationSha256 : proxyAddendumSha256;
    const markdown = readLocked(join(root, id, 'preregistration.md'), registrationSha256).toString('utf8');
    return { key, batch, verification, expectations: constructExpectations(markdown) };
  });
  proxyProvenance({ entries, proxyAddendumSha256, originalRegistrationSha256: originalBakeoffRegistrationSha256 });
  const { selection } = analysis({ candidates: candidateOrder.map(key => ({ ...splitJudgeCandidates[key], key, runId: runIds[key] })),
    dimensions: splitDimensions, expectations: entries[0].expectations, targets: s1Targets,
    runs: Object.fromEntries(entries.map(row => [row.key, row])) });
  const chosen = entries.find(row => row.key === selection.selected);
  requireThat(chosen && Object.hasOwn(proxyBakeoffRunIds, chosen.key), 'no eligible proxy winner to retest');
  return chosen;
}

export function makeJudgeFreezeRegistration(judgeProxySource) {
  const { key, batch: { manifest } } = selectedJudge();
  const { ruler, judgeOutputContract, policy, routes, judgeTransport, preregistrationSha256 } = manifest.identity;
  requireThat(judgeTransport.proxySource === judgeProxySource, 'active proxy source differs from the winning judge');
  const judgingSources = Object.fromEntries(judgingFiles.map(path => [path, manifest.identity.sources[path]]));
  requireThat(judgingFiles.every(path => judgingSources[path] === hash(source(path))), 'the winning judge implementation changed');
  const freeze = { runId: manifest.id, identityId: manifest.identityId, registrationSha256: preregistrationSha256,
    judgeFingerprint: hash({ ruler, judgeOutputContract, policy, routes, judgeTransport, sources: judgingSources }) };

  requireThat(verifyRun(root, archiveId).verified, 'freeze archive receipts do not verify');
  const archiveMarkdown = readLocked(join(root, archiveId, 'preregistration.md'), archiveRegistrationSha256).toString('utf8');
  const archived = contrastRegistration(archiveMarkdown);
  readLocked(join(root, originalS1Id, 'preregistration.md'), originalS1RegistrationSha256);
  readLocked(join(root, originalDiagnosticId, 'preregistration.md'), originalDiagnosticRegistrationSha256);
  const queue = deriveFreezeQueue(freeze.runId, manifest.planned.slice(0, 15), archiveId, archived.queue);
  const inputs = new Map(queue.map(row => {
    const bytes = readLocked(join(root, row.archive, 'transcript.json'), row.transcriptSha256);
    return [row.id, { bytes, messages: bindBinary(JSON.parse(bytes)).messages }];
  }));
  const quant = judgeFreezeBudget(policy);
  const limits = { maxAttempts: quant.maxCalls, maxRequestedOutputTokens: quant.maxOutputTokens };
  const runId = judgeFreezeRunId(key);
  const { sources } = evaluationIdentity({ mode: 'real', sources: sourceFiles });
  const prior = { winnerIdentityId: freeze.identityId, archiveId, archiveRegistrationSha256, originalS1Id, originalS1RegistrationSha256,
    originalDiagnosticId, originalDiagnosticRegistrationSha256 };
  const candidate = { ...splitJudgeCandidates[key], runId };
  const plan = { ruler, judgeOutputContract, concurrency: bakeoffConcurrency, dimensions: splitDimensions,
    maxAttemptsPerDimension: splitMaxAttempts, stop: splitStopRules(queue.length), candidates: { [key]: { runId, route: routes.judge, policy, limits } },
    parentRegistrationSha256: preregistrationSha256, judgeTransport, freeze, prior, sources, queue, primary: archived.primary, repeatIds: archived.repeatIds };

  const previous = readLocked(join(root, freeze.runId, 'preregistration.md'), preregistrationSha256).toString('utf8');
  const truth = previous.split('## 构造预期答案')[1].split('## 机器清单')[0].trim();
  const directedTruth = archiveMarkdown.split('\n').filter(line => line.startsWith('|')).join('\n');
  const bytes = Buffer.from(`# 第二轮 ①h 胜出裁判冻结复测预登记

唯一胜出者为 \`${key}\`。沿用胜出身份中的尺子、提示、模型、唯一提供方、调用策略、代理方式和证据校验。裁判指纹 \`${freeze.judgeFingerprint}\`。复测样本、总预算及预登记不同，因此另记运行身份。S1 的五个历史对话字节不改，但三遍均重跑，不把候选选择输出当冻结复测。

运行 \`${runId}\`，一个进程、并发 4，不续跑。15 格 S1 后为 ①c 同批清单的 36 格。包含 18 个 V1/V2/A1/A2 主变体、两个仅描述的话术格、同批基线，以及从 ①b 选的五项各两遍。四项首遍与主矩阵重合，其余不重复计入。用已存对话原件，不打开训练标签、sealed 或留出题。

## 冻结判线

- 仅用验真通过的真实原件。除两格话术溢出诊断外，49 个计划格均须有合规判决，包含所有同批基线与五对复跑。缺判不补 No。
- S1 沿用原判线。每遍四个坏教师的适用分率严格低于同遍 normal，3/3 遍；四个目标方向各须 3/3。N/A、平局、反向或缺失均不命中。三遍一致率只描述。
- 四题定向主矩阵沿用 ①b「可靠」口径。每题计划变体和对应同批基线有判决，真值 Yes/No 各至少两项，召回与特异度各至少 0.8，且至少一个翻转配对与一个不变对照均有合规判决。配对命中另报，须变体和基线均符合登记真值。其他题的溢出只作描述。
- normal 四格沿用 ①c 的 #4/#5 核对。V1 均为 Yes 并引 #4；只有补解释格 V2 为 Yes，须引 #4/#5。验证或迁移分档依次为 1、2、1、1；原文、猜测、教师宣称不得把 V2 判成 Yes。另报告原 S1 三遍同文本的引用。
- 复跑按 ①b/①c 仅描述五对四个目标位、19 位和六维分档的一致性，不另设一致率阈值，不补等于。上述各冻结门全部满足才冻结，不用小样本宣称推广。任一门未满足，保留原件，不冻结也不补试。

## 额度和停线

51 格 × 6 = ${quant.typicalCalls} 次计划调用。沿用 ①c 的全批额外 8 次恢复额度，硬上限 **${limits.maxAttempts} 次、${limits.maxRequestedOutputTokens} 个预留输出 token**。每维最多三次尝试，仍沿用胜出者的 120 秒本地截止、输出上限及实报推理口径。连续三次供应商或传输失败、连续三格失败、累计八格失败或额度不足即停；已发请求结算，不换路由或开启新进程。

## 构造预期答案

${truth}

## ①c 定向扰动真值

${directedTruth}

## 机器清单

\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`
`);
  return { plan, bytes, inputs, candidate, ceiling: quant };
}

export function prepareJudgeFreeze(config, estimating) {
  const { registration, registrationDigest, judgePolicy, judgeProxySource, mode, id, concurrency, limits } = config;
  requireThat(mode === 'real' && !config.resume && registration && registrationDigest, 'freeze retest requires a real, single-process registered run');
  const { bytes, ...prepared } = makeJudgeFreezeRegistration(judgeProxySource);
  const { candidate, plan } = prepared;
  const preregistration = readFileSync(registration);
  requireThat(hash(preregistration) === registrationDigest && bytes.equals(preregistration), 'freeze preregistration, source or selection changed');
  requireThat(plan.candidates[judgePolicy]?.runId === candidate.runId && same(limits, plan.candidates[judgePolicy].limits)
    && concurrency === bakeoffConcurrency, 'freeze retest requires the winning judge and registered limits');
  requireThat(estimating ? id !== candidate.runId : config.root === root && id === candidate.runId, 'use the registered freeze ID and run root');
  const provenance = { prior: plan.prior };
  const base = evaluationIdentity({ mode, limits, provenance, sources: sourceFiles });
  const identity = { ...base, version: splitBinaryIdentityVersion, ruler: splitBinaryRuler, judgeOutputContract: splitBinaryOutputContract,
    policy: candidate.policy, routes: { judge: candidate.route }, judgePolicy, registeredId: candidate.runId, planned: plan.queue,
    preregistrationSha256: registrationDigest, parentRegistrationSha256: plan.parentRegistrationSha256, judgeTransport: plan.judgeTransport, freeze: plan.freeze };
  return { ...prepared, source: provenance, preregistration, identity, identityId: hash({ mode, scenario: judgeFreezeScenario, identity }) };
}
