import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { taskId } from '../config/e1.mjs';
import { judgeCandidates } from '../config/judge-contrast.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { binaryIdentityVersion, binaryOutputContract, binaryRuler } from '../contracts/judge/binary.mjs';
import { prepareContrast, readLocked } from '../scripts/reasoning-off-plan.mjs';
import { adoption, unchangedQuestions } from '../scripts/reasoning-off-report.mjs';
import { gradeBinary } from './binary-judge.mjs';
import { runCellBatch } from './cell-batch.mjs';
import { contrastBudget, contrastFolders, contrastRegistration, judgeContrastScenario } from './judge-contrast-plan.mjs';
import { binaryOfflineResponses } from './offline.mjs';
import { checkout } from './real-preflight.mjs';
import { evaluationIdentity, executeCell } from './run.mjs';

const concurrency = 4;
const timeoutMs = 180_000;
const sources = ['config/e2.mjs', 'contracts/judge/binary.mjs', 'src/binary-judge.mjs', 'src/s1-binary-plan.mjs', 'src/judge-contrast.mjs',
  'scripts/judge-contrast.mjs', 'scripts/reasoning-off-plan.mjs', 'scripts/reasoning-off-report.mjs', 'scripts/s1-binary-report.mjs'];
const priorRegistrationSha256 = 'f2e1de0db60bff27331d888607a6295cba297a4aa046305f1da8793bf782a46f';
const archiveRoot = join(checkout, 'runs');

export function makeContrastRegistration(judgePolicy) {
  const candidate = judgeCandidates[judgePolicy];
  const { runId, route, policy } = candidate;
  const { queue, inputs, history, expected, plan: previous } = prepareContrast();
  const original = readLocked(join(archiveRoot, 'round2-reasoning-off-01', 'preregistration.md'), priorRegistrationSha256).toString('utf8');
  const registered = contrastRegistration(original);
  requireThat(same(registered.queue, queue) && same(registered.prior, previous.prior) && same(queue.map(row => row.id), contrastFolders), 'samples differ from locked ①d inputs');
  const gates = original.split('## 采用线\n\n')[1].split('\n\n')[0].split('\n');
  requireThat(gates.length === 5 && gates.every((line, i) => line.startsWith(`- (${String.fromCharCode(97 + i)}) `)), 'invalid ①d adoption lines');
  gates[0] = '- (a) 18/18 计划首尝试均实际发送，发出后 180 秒内收到首个非空白正文 delta，且无推理片段（首末推理 delta 均未观察到）。遥测缺失、未启动或靠重试补回不命中。推理 token 实报单列，缺报记未知。';
  const table = original.split('## 构造预期答案')[1].split('## 机器清单')[0].trim();
  const { typicalCalls, maxCalls, maxOutputTokens } = contrastBudget(policy);
  const limits = { maxAttempts: maxCalls, maxRequestedOutputTokens: maxOutputTokens };
  const { maxReasoningTokens: _, ...unchangedAdoption } = adoption;
  const plan = { runId, ruler: binaryRuler, judgePolicy, policyVersion: policy.version, route, typicalCalls, concurrency, limits,
    retriesPerKind: policy.retriesPerKind, timeoutMs, adoption: { firstAttempt: 'visible-no-reasoning-delta', ...unchangedAdoption },
    unchangedQuestions, priorRegistrationSha256, prior: previous.prior, sources: evaluationIdentity({ mode: 'real', sources }).sources, queue };
  const reasoning = policy.judge.reasoningMaxTokens === null ? '省略推理参数。' :
    `打开推理，发送 \`reasoning.max_tokens:${policy.judge.reasoningMaxTokens}\`。用总输出上限约束请求，实报推理另读遥测。`;
  const markdown = `# 第二轮 ①g ${candidate.label} 预登记

登记 run ID \`${runId}\`。一个 Node 进程，格级并发 ${concurrency}。冻结 S1 五格各三遍，再评三份 ①b 曾超时的公开对话，各一次。样本哈希与 ①d 一致，三份诊断取 ①c 的第一遍归档。

尺子 \`${binaryRuler}\`。题面、提示及本地证据验证沿用 ①d。OpenRouter \`${route.id}\`，\`json_schema.strict:true\` 与 \`provider.require_parameters:true\`。唯一端点 \`${route.routing.only[0]}\`，\`provider.allow_fallbacks:false\`。${reasoning} 策略 \`${policy.version}\`。

常规 ${typicalCalls} 次，每次最多 ${policy.judge.maxTokens} 请求输出 token，本地截止 ${timeoutMs / 1000} 秒。全批预留硬上限 **${maxCalls} 次、${maxOutputTokens} 请求输出 token**，含最多 8 次额外。429 按现行调度降一档，最低 1。按故障类跨格及跨进程最多 ${policy.retriesPerKind} 次重试，限流和本地超时各为一类。每次逻辑调用最多 ${policy.retries} 次普通重试。失败达到停线后停止发新请求，结算已发请求。授权范围内同 ID 续跑时，保留已经提交的判决和所有已预留额度。

## 采用线

${gates.join('\n')}

五条全部通过才采用。Qwen 未达线才启动备选 B。每次候选都需要独立的预登记、收据与身份。

只报告以下项目。按同遍同格比较开推理 v1 的 15 道未改题，逐题保留配对分母和引用差异。耗时用已发首尝试的中位数及最近秩 p90，另列缺失、失败与重试。按题、按维报告 S1 三遍一致率。列出本地拒收原因分布、调用 ID 和证据序号。实测仅覆盖单个候选与 S1 极端格；冻结前用最终身份重跑 S1 和定向复测。

## 构造预期答案

${table}

## 机器清单

\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`
`;
  return { candidate, plan, queue, inputs, history, expected, bytes: Buffer.from(markdown), ceiling: { typicalCalls, maxCalls, maxOutputTokens } };
}

export function prepareJudgeContrast(config, estimating) {
  const { registration, registrationDigest, judgePolicy, mode, id, root, concurrency: level, resume, limits } = config;
  requireThat(registration && registrationDigest, 'judge contrast requires its preregistration path and SHA256');
  const { candidate, bytes, ...prepared } = makeContrastRegistration(judgePolicy);
  const preregistration = readFileSync(registration);
  requireThat(hash(preregistration) === registrationDigest && preregistration.equals(bytes), 'judge contrast preregistration, sources, or samples changed');
  requireThat(same(limits, prepared.plan.limits), 'use both registered hard limits for the judge contrast');
  if (mode === 'real' && !estimating) {
    requireThat(id === candidate.runId && root === archiveRoot && (resume || level === concurrency), 'use the registered ID, root and initial concurrency');
  } else requireThat(id.toLowerCase() !== candidate.runId, 'estimate and offline runs require a separate ID');
  const source = { prior: prepared.plan.prior };
  const base = evaluationIdentity({ mode, limits, provenance: source, sources });
  const identity = { ...base, version: binaryIdentityVersion, ruler: binaryRuler, judgeOutputContract: binaryOutputContract,
    policy: candidate.policy, routes: mode === 'real' ? { judge: candidate.route } : 'pi-ai-faux', judgePolicy, registeredId: candidate.runId,
    planned: prepared.queue, preregistrationSha256: registrationDigest };
  const identityId = hash({ mode, scenario: judgeContrastScenario, identity });
  return { ...prepared, candidate, identity, identityId, source, preregistration };
}

export function runJudgeContrast(config, { identity, identityId, source, preregistration, queue, inputs, ceiling }) {
  const { id, mode, limits, checkReceipt } = config;
  return runCellBatch(config, { id, scenario: judgeContrastScenario, taskId, mode, identity, identityId, budget: ceiling, limits,
    planned: queue, source, checkReceipt }, (folder, context) => {
    const row = queue.find(sample => sample.id === folder);
    const { messages, bytes } = inputs.get(folder);
    return executeCell({ ...context, id, mode, variant: row.condition ?? row.id, coordinate: row.repetition && { repetition: row.repetition },
      frozen: messages, frozenBytes: bytes, judgeOnly: row.sourceRunId, grader: gradeBinary,
      fixtures: mode === 'offline' ? binaryOfflineResponses(row.condition ?? 'no_teach') : undefined });
  }, preregistration);
}
