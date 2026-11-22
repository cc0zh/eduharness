import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { taskId } from '../config/e1.mjs';
import { splitJudgeCandidates } from '../config/judge-bakeoff.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { splitBinaryIdentityVersion, splitBinaryOutputContract, splitBinaryRuler, splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { prepareContrast, readLocked } from '../scripts/reasoning-off-plan.mjs';
import { runCellBatch } from './cell-batch.mjs';
import { bakeoffBudget, bakeoffConcurrency, judgeBakeoffScenario, originalBakeoffRegistrationSha256, proxyBakeoffRunIds } from './judge-bakeoff-plan.mjs';
import { contrastFolders, contrastRegistration } from './judge-contrast-plan.mjs';
import { splitBinaryOfflineResponses } from './offline.mjs';
import { checkout } from './real-preflight.mjs';
import { evaluationIdentity, executeCell } from './run.mjs';
import { splitMaxAttempts, splitStopRules } from './split-judge-state.mjs';

const archiveRoot = join(checkout, 'runs');
const priorRegistrationSha256 = 'f2e1de0db60bff27331d888607a6295cba297a4aa046305f1da8793bf782a46f';
const sourceFiles = ['config/e2.mjs', 'config/judge-bakeoff.mjs', 'contracts/judge/binary.mjs', 'contracts/judge/binary-v3.mjs',
  'src/binary-judge.mjs', 'src/binary-judge-v3.mjs', 'src/s1-binary-plan.mjs', 'src/judge-bakeoff.mjs', 'src/judge-bakeoff-plan.mjs',
  'src/split-judge-state.mjs', 'src/split-judge-replay.mjs', 'scripts/reasoning-off-plan.mjs', 'scripts/judge-bakeoff-report.mjs'];
const caps = ceiling => ({ maxAttempts: ceiling.maxCalls, maxRequestedOutputTokens: ceiling.maxOutputTokens });

export function makeBakeoffRegistration() {
  const { queue, inputs, plan: previous } = prepareContrast();
  const original = readLocked(join(archiveRoot, 'round2-reasoning-off-01', 'preregistration.md'), priorRegistrationSha256).toString('utf8');
  const registered = contrastRegistration(original);
  requireThat(same(registered.queue, queue) && same(registered.prior, previous.prior) && same(queue.map(row => row.id), contrastFolders), 'samples differ from locked ①d inputs');
  const gates = original.split('## 采用线\n\n')[1].split('\n\n')[0].split('\n');
  requireThat(gates.length === 5 && gates.every((line, i) => line.startsWith(`- (${String.fromCharCode(97 + i)}) `)), 'invalid ①d adoption lines');
  gates[0] = '- (a) 18/18 格通过。每格六维均实际发出，并在合规尝试发出后 120 秒内收到完整合规正文，且该次实报推理 token 未超登记预算；该格须通过跨维校验。允许合规重试。缺维、缺时间或预算证据不足均不命中。';
  gates[1] = '- (b) S1 至少 14/15 格有通过本地校验的完整判决。';
  const table = original.split('## 构造预期答案')[1].split('## 机器清单')[0].trim();
  const candidates = Object.fromEntries(Object.entries(splitJudgeCandidates).map(([key, candidate]) => {
    const { runId, route, policy } = candidate;
    return [key, { runId, route, policy, limits: caps(bakeoffBudget(policy)) }];
  }));
  const stop = splitStopRules(queue.length);
  const { sources } = evaluationIdentity({ mode: 'real', sources: sourceFiles });
  const plan = { ruler: splitBinaryRuler, judgeOutputContract: splitBinaryOutputContract, concurrency: bakeoffConcurrency,
    dimensions: splitDimensions, maxAttemptsPerDimension: splitMaxAttempts, stop, candidates, priorRegistrationSha256, prior: previous.prior, sources, queue };
  const parameters = Object.values(candidates).map(({ runId, route, policy, limits }) =>
    `| ${runId} | ${route.id} / ${route.routing.only[0]} | ${policy.judge.reasoning?.effort ?? '省略'} | ${route.temperature ?? '省略'} | ${policy.judge.reasoningBudget} | ${policy.judge.maxTokens} | ${limits.maxAttempts} | ${limits.maxRequestedOutputTokens} |`).join('\n');
  const markdown = `# 第二轮 ①h 三候选预登记

三方使用同一份公开对话字节。冻结 S1 五格各三遍，再评 A2-assigned-multiplier、R0-still-learner-origin、R1-student-score-cards 各一次。输入哈希与 ①d 相同。每格依次发六个独立维度，每个候选一个 run ID、一个 Node 进程，并发 4 格。三批依次执行，各自独立计算判线和停线。

## 参数与硬上限

| Run | 模型与唯一端点 | 推理档 | temperature | 单维实报推理判线 | 单次输出上限 | 预留次数上限 | 预留输出 token 上限 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
${parameters}

每批 108 个计划单维调用，共最多 324 次尝试。实发请求和预留额度分别对账。三方均用 strict json_schema、require_parameters:true、only/order 单一端点、allow_fallbacks:false，本地截止 120 秒。

Haiku 5.5 [原厂思考配置](https://platform.claude.com/docs/en/build-with-claude/thinking)只接受自适应思考，固定 budget_tokens 会被拒绝。用低档、2,048 总输出与 1,536 实报推理判线。Gemini [3.8 Flash 官方支持 low](https://ai.google.dev/gemini-api/docs/thinking)，标准 Google AI Studio 端点列出 reasoning_effort 和 structured_outputs，所以保留 3.8。low 是档位。3,072 是实报验收上限。Haiku、Gemini 缺推理计数则该维 (a) 未命中。Qwen 请求沿用 ①g。其 [模型卡](https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507)标明 non-thinking。其计数为零或缺失时，只有遥测明确没有推理 delta 才计入 (a)。缺失仍记未知。

## 两层停线

- 单维最多三次尝试，含 429。耗完仍失败即结算失败格，剩余维度不发。不可重试的配置故障直接结束该格。重试只传该维结构或规则的中性错误类别。六维齐全后出现 S3/P1 冲突即结算 judge_partial_failure，并单列，不重抽。
- 已发调用按结算顺序统计，连续三次供应商或传输失败则停。按格结算顺序连续三格失败也停。累计失败格分母为计划总格数。18 格按本任务给定阈值四格，其他批量按 ceil(计划格数 × 15%)。停线阻止新发，已发请求结算。局部合规且未成格的维度留原件。所有失败或缺判格逐格列出。

## 采用线

${gates.join('\n')}

全部达线方可入选。候选有多于一个时，依次比较构造真值假阳加假阴更少、首次单维合规数占 108 的比例更高、合规单维尝试从发送到结束的最近秩 p90 更低。仍并列按 Haiku、Gemini、Qwen。三者都未达线则均不采用，冻结不启动。

首次合规率、重试后合规率、规范化数、跨维冲突数、耗时中位数和 p90、三遍一致率和候选间逐题一致率单报。首次率和 p90 只用于并列排序，不另设采用阈值。耗时另列已发失败与缺值。拆维 Qwen 对 ①g 整包 Qwen 只在相同输入的合规交集比较。拆分、证据表示和运行规则同时改变，比较只能部分区分拆维效应。

## 构造预期答案

${table}

## 机器清单

\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`
`;
  return { plan, inputs, bytes: Buffer.from(markdown) };
}

export function deriveBakeoffProxyAddendum(original, sources, proxySource) {
  requireThat(/^(HTTPS_PROXY|HTTP_PROXY|https_proxy|http_proxy)$/.test(proxySource), 'invalid proxy source');
  const markdown = original.toString('utf8');
  const parent = contrastRegistration(markdown);
  const plan = { ...parent, sources, parentRegistrationSha256: hash(original), judgeTransport: { proxied: true, proxySource },
    candidates: { ...parent.candidates,
      ...Object.fromEntries(Object.entries(proxyBakeoffRunIds).map(([key, runId]) => [key, { ...parent.candidates[key], runId }])),
    } };
  const parentProse = markdown.slice(0, markdown.lastIndexOf('## 机器清单'));
  const header = `# 第二轮 ①h 代理补跑预登记附录

锁定原预登记 SHA256：\`${plan.parentRegistrationSha256}\`。只有 Haiku 和 Gemini 的 OpenRouter 传输经显式环境代理（\`${proxySource}\`）；不留代理地址和凭据。两批使用新评测身份及新 run ID \`${proxyBakeoffRunIds.haiku}\`、\`${proxyBakeoffRunIds.gemini}\`。各为单进程，并发 4，不续跑。模型、提供方、预算、样本、采用线 a–e、选优规则和两层停线不变。

原 Haiku/Gemini 批次保存为「基础设施未通，未测到」。Qwen 使用原 \`${parent.candidates.qwen.runId}\` 判决，不再发请求。选优仅使用这两个补跑批次和原 Qwen 批次，三方按原判线合并比较。无胜者则不启动冻结。出口地区拒绝按原供应商失败规则停线。

以下原预登记正文逐字保留；其中旧 run ID 仅供核对，不作补跑指令。执行使用本附录的机器清单。

`;
  const bytes = Buffer.from(`${header}${parentProse}## 机器清单\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n`);
  return { plan, bytes };
}

export function makeBakeoffProxyRegistration(proxySource) {
  const parent = readLocked(join(archiveRoot, splitJudgeCandidates.qwen.runId, 'preregistration.md'), originalBakeoffRegistrationSha256);
  const { plan, inputs, bytes } = makeBakeoffRegistration();
  const withoutSources = ({ sources: _, ...fixed }) => fixed;
  const locked = contrastRegistration(parent.toString('utf8'));
  const prose = bytes => bytes.toString('utf8').split('## 机器清单\n')[0];
  requireThat(same(withoutSources(plan), withoutSources(locked)) && prose(bytes) === prose(parent), 'the original bakeoff plan or gates changed');
  const sources = { ...plan.sources, 'src/openrouter-proxy.mjs': hash(readFileSync(new URL('./openrouter-proxy.mjs', import.meta.url))) };
  return { ...deriveBakeoffProxyAddendum(parent, sources, proxySource), inputs };
}

export function prepareJudgeBakeoff(config, estimating) {
  const { judgePolicy, judgeProxySource, registration, registrationDigest, mode, id, root, concurrency, limits } = config;
  requireThat(registration && registrationDigest, 'judge bakeoff requires its shared preregistration path and SHA256');
  requireThat(judgeProxySource === undefined || mode === 'real' && Object.hasOwn(proxyBakeoffRunIds, judgePolicy) && !config.resume,
    '--proxy-from-env is only for real Haiku or Gemini bakeoff runs without --resume');
  const { plan, inputs, bytes } = judgeProxySource === undefined ? makeBakeoffRegistration() : makeBakeoffProxyRegistration(judgeProxySource);
  const preregistration = readFileSync(registration);
  requireThat(hash(preregistration) === registrationDigest && preregistration.equals(bytes), 'bakeoff preregistration, sources, or samples changed');
  const candidate = { ...splitJudgeCandidates[judgePolicy], runId: plan.candidates[judgePolicy].runId };
  const ceiling = bakeoffBudget(candidate.policy);
  requireThat(same(limits, caps(ceiling)), 'use both registered hard limits for the judge bakeoff');
  if (mode === 'real' && !estimating) requireThat(id === candidate.runId && root === archiveRoot && concurrency === bakeoffConcurrency, 'use the registered ID, root and concurrency');
  else requireThat(!Object.values(splitJudgeCandidates).some(candidate => id.toLowerCase() === candidate.runId)
    && !Object.values(proxyBakeoffRunIds).includes(id.toLowerCase()), 'estimate and offline runs require a separate ID');
  const source = { prior: plan.prior };
  const base = evaluationIdentity({ mode, limits, provenance: source, sources: Object.keys(plan.sources) });
  const identity = { ...base, version: splitBinaryIdentityVersion, ruler: splitBinaryRuler, judgeOutputContract: splitBinaryOutputContract,
    policy: candidate.policy, routes: mode === 'real' ? { judge: candidate.route } : 'pi-ai-faux', judgePolicy, registeredId: candidate.runId,
    planned: plan.queue, preregistrationSha256: registrationDigest,
    ...(plan.judgeTransport && { judgeTransport: plan.judgeTransport, parentRegistrationSha256: plan.parentRegistrationSha256 }) };
  return { plan, inputs, candidate, ceiling, identity, identityId: hash({ mode, scenario: judgeBakeoffScenario, identity }), source, preregistration };
}

export function runJudgeBakeoff(config, { identity, identityId, source, preregistration, plan, inputs, ceiling }) {
  const { id, mode, limits, checkReceipt, scenario = judgeBakeoffScenario } = config;
  return runCellBatch(config, { id, scenario, taskId, mode, identity, identityId, budget: ceiling, limits,
    planned: plan.queue, source, checkReceipt }, (folder, context) => {
    const row = plan.queue.find(sample => sample.id === folder);
    const { messages, bytes } = inputs.get(folder);
    const fixtures = mode === 'offline' ? splitBinaryOfflineResponses(row.condition ?? 'no_teach', messages, context.control.splitNext().call) : undefined;
    return executeCell({ ...context, id, mode, variant: row.condition ?? row.id, coordinate: row.repetition && { repetition: row.repetition },
      frozen: messages, frozenBytes: bytes, judgeOnly: row.sourceRunId, fixtures });
  }, preregistration);
}
