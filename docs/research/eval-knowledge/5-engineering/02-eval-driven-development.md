# 评测驱动开发

本页记录如何把运行故障或产品失败变成下一次可验证的改动。项目状态以 `docs/status.md:7-14,151-161` 为准。下文步骤为建议，目前没有执行 S2 或 S3。

## 1. 从原始记录生成故障分类

**出处** · Hamel Husain、Shreya Shankar，《AI Evals: Everything You Need to Know》及专题回答。另见 Hamel Husain 的《Your AI Product Needs Evals》，其中 Lucy 案例分 scoped tests、human/model eval、A/B 三层。[FAQ](https://hamel.dev/blog/posts/evals-faq/) · [Error analysis 原文](https://hamel.dev/blog/posts/evals-faq/why-is-error-analysis-so-important-in-llm-evals-and-how-is-it-performed.html) · [Lucy 案例](https://hamel.dev/blog/posts/evals/)

**具体内容** · 原文建议以约 100 条多样 trace 为工作池。领域专家先标约 30 条，用自由文字描述首个导致后续问题的故障，即 open coding。再做 axial coding，把笔记按失败类型归组并计数。让辅助 Agent 在剩余 trace 中找可能的同类案例，由人确认，直到新读记录很少改变分类。30 与 100 是这套人工归纳流程的参考量。

**对 TeachArena 的意义** · 先从已保存的 `manifest`、`requests.jsonl`、`calls/*.json` 和 `transcript.json` 各挑可回读的失败样本。记录 `{runId, cell, role, turn, call, attempt, firstFailure, evidencePath, code, reviewer}`，分别标记传输故障、裁判契约失败和教师行为；成功重试前的故障仍保留。以 `r2/no_teach` 为例，首个确定的故障是第 4 轮裁判第 1 调用超时，缺分留在运行状态里。按涉及的格数、重复尝试数、未知账单数分别计数，决定先修哪个失败路径。`docs/runbook.md:23-36`，`docs/status.md:151-161`。

## 2. 每次改动都能产出可比的一行

**出处** · Eugene Yan，《Product Evals in Three Simple Steps》，2025-11-23。《An LLM-as-Judge Won't Save The Product—Fixing Your Process Will》，2025-04-20。[Product Evals](https://eugeneyan.com/writing/product-evals/) · [Eval process](https://eugeneyan.com/writing/eval-process/)

**具体内容** · 三步为标一批数据、对齐 evaluator、每次配置变动都跑 experiment + eval harness。评测端收 input/output 对，并行调用受限流约束，作者把聚合指标导出为单行 dataframe。若用成对偏好裁判，`<control>` 与 `<treatment>` 中内容对调再评一次，作者把两次方向翻转视为 tie 的候选。

**对 TeachArena 的意义** · S3 每轮写一行机器可读摘要，供 `iterations.md` 索引。最小字段为 `{roundId, baselineRunId, candidateRunId, preregistrationHash, validPairs, plannedPairs, targetDelta, decision, receiptRefs}`。只把已锁定的教学配置交给实验执行器。用固定版本和结构化评分生成旧、新两侧摘要，再回读证据。当前单侧裁判可直接复用；成对偏好评审属于另一种实验设计。`docs/scenarios.md:63-87`。

## 3. 给评测循环设置停止条件

**出处** · Erik Schluntz、Barry Zhang，Anthropic《Building effective agents》，2024-12-19 的 `Workflow: Evaluator-optimizer`。Anthropic《Demystifying evals for AI agents》，2026-01-09 的 `Steps 0–8`。[Building effective agents](https://www.anthropic.com/research/building-effective-agents) · [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

**具体内容** · Evaluator-optimizer 分为生成与反馈调用。合适的前提是人能给出确实让结果进步的反馈，同时模型也能给出同类反馈。Agent eval 指南用 task、trial、grader、transcript、outcome 区分输入、一次独立试验、评分和证据。Step 0 建议早期从实际故障中选 20–50 个简单任务起步。Step 4 要求环境稳定、每个 trial 从干净环境开始，Step 6 要人工回读 trace，Step 7 监测能力套件饱和。20–50 是起步建议，项目的 S3 卡目前固定 S0-06。

**对 TeachArena 的意义** · 一轮只试一个预登记的 harness 改动。先跑便宜的确定性回归，再走 S2 双侧冷启动。身份漂移、进程证据不完整、预算耗尽和裁判缺分各记具体原因，本轮记为不可判定。有效对照再进入好转、退化或无变化。产物记录下一轮采用的基准提交和本轮停止原因。`docs/scenarios.md:50-87`。

## 4. 把离线回归和真实运行放在不同触发点

**出处** · OpenAI《Evaluation best practices》，`Design your eval process` 和 `Identify where you need evals`。[原文](https://developers.openai.com/api/docs/guides/evaluation-best-practices)

**具体内容** · 指南要求先定义目标、收集数据、定义指标，接着运行与比较，最后把评测接入持续变更。示例包括单轮总结、文档问答、workflow 和 agent，按系统结构选检查点。指南还要求把新发现的非确定性失败补进评测集。文档页首另有托管 Evals 平台退役公告，页面给出的关停日期为 2026-11-30。

**对 TeachArena 的意义** · 每个改动跑 `npm run check` 的导入边界和离线测试。冻结对话的裁判冒烟只在裁判接口、解释器或调用策略变化时跑。S3 比较只在隔离、身份和费用授权齐备后跑双侧。开发回归可用历史失败原件，本轮对照继续保留独立原件和批准额度。`scripts/check.mjs:4-15`，`AGENTS.md:5-9`，`docs/runbook.md:7-21`。
