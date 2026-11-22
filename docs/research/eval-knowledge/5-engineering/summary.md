# TeachArena 评测工程差距与实施顺序

项目锚点为 `d88471d2e2ee34bf9fba8bf5a08dd14bbba4d414`。E2 完整五格已验收。S1 稳定性验证因调用故障停止，仍待签收。S2、S3 是后续验收阶段。本文所列实施代价为单人工作量粗估。真实运行另需授权，供应商账单和耗时以复核为准。`docs/status.md:3-12,151-161`，`AGENTS.md:5-9`。

| 缺口 | 可借鉴做法 | 出处 | 实现代价 |
| --- | --- | --- | --- |
| P0，180 秒后才知流未完成 | 复用 `onResponse` 和 `onProviderStreamEvent` 记录响应头、首事件与进展，另记流终态。设首事件、无进展、尝试与 run 时限。先用 200 后超时、心跳、流错误做离线回归。 | [OpenRouter Streaming](https://openrouter.ai/docs/api_reference/streaming)，[AWS Builders' Library](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)，`src/models.mjs:154-167`，`docs/status.md:155-161` | 中，约 2–4 工程日。保活注释能否到达 pi 回调需测试。 |
| P0，路由实报超上限与用量未知 | 保存脱敏请求、实际端点和 generation ID。分开请求输出上限、实报推理、账单及未知值。用冻结源点验端点约束。 | [Provider selection](https://openrouter.ai/docs/guides/routing/provider-selection)，[Generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-generation)，`docs/status.md:136-149,190-197` | 中，约 2–3 工程日，加获授权的少量真实调用。ID 缺失时维持未知。 |
| P0，应用重启后残留运行进程 | 在可信启动器用 OS 持有进程树。保存 PID 和创建时间，做父、子、孙的强杀及重启测试。协议明确任务随所有者退出或由独立监督器托管。 | [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)，`src/run-receipts.mjs:74-115,218-229`，`docs/status.md:161` | 中，约 2–4 工程日 Windows 试验。独立监督与重连另估。 |
| P1，S2 两侧隔离尚未取证 | 每侧私有身份、HOME、临时目录、会话、缓存和 Git 元数据。用交叉写拒绝、标记不可见、首请求及哈希验收隔离。分别记录双侧运行退出码与 `--verify-run` 的收据复核结果。 | [S2 草案](../../s2-isolation-design.md)，[Inspect AI sandboxes](https://inspect.aisi.org.uk/sandboxing.html)，`docs/scenarios.md:50-61`，`src/cli.mjs:22-32` | 中高，约 3–6 工程日。先离线证明真实权限。正式 S2 按场景卡要求双侧运行退出 0。 |
| P1，S3 逐轮比较与晋升记录尚未交付 | 写一次预登记，固定合法身份差异与可见反馈。隔离侧别证据，至少两轮 E5。用目标动作、消息 ID 和执行结果决定保留、撤回或暂不采纳。保留集由外部执行器做晋升门。 | [Meta-Harness](https://arxiv.org/html/2603.28052)，[COS Preregistration](https://www.cos.io/initiatives/prereg)，`docs/scenarios.md:63-87` | 中高，约 3–6 工程日完成比较器与轮次产物，至少两轮真实运行另计。 |
| P2，失败归类和持续回归尚缺固定记录 | 先将 `r2/no_teach` 的三个尝试和一个缺分结果记录成工程故障样例，建立首错分类及失败路径测试。另用每轮一行摘要关联试验、对照和原件。 | [Husain、Shankar：Error analysis](https://hamel.dev/blog/posts/evals-faq/why-is-error-analysis-so-important-in-llm-evals-and-how-is-it-performed.html)，[Eugene Yan](https://eugeneyan.com/writing/product-evals/)，`docs/status.md:155-161` | 低，约 0.5–1.5 工程日，复用现有原件与 Node 回归。 |
| P2，批量费用收益和并发上限未验 | 先将互相独立的冻结裁判计划赋稳定 ID，在单侧限量并发。保留每格终态、原件和预登记分母。路由支持与账单经过验证后，再考虑供应商批量。 | [OpenAI Batch API](https://developers.openai.com/api/docs/guides/batch)，[OpenRouter Prompt Caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching)，`src/run.mjs:119-174` | 低中，约 1–3 工程日。跨进程全局配额和供应商异步接口另估。 |

## 建议先做的三件事

1. **补齐裁判调用的流终态与计费证据。** 先完成可控长流的离线回归，再用同一冻结对话和小预算核对端点、实际用量与时限。复盘 `r2/no_teach` 的 3 次截尾。`docs/status.md:155-161` · [时限与重试](04-routing-timeouts-retries.md) · [账单](05-cost-caching-batch.md)
2. **把运行交给负责进程树的可信启动器，并用它验证 S2。** 首先在 Windows 验证监督者退出后的进程行为，再为两侧加独立可写根、身份、交叉探针和首请求证据。正式 S2 仍按卡等待 S1 签收。`docs/scenarios.md:50-61` · [生命周期](06-process-lifecycle.md)
3. **离线建立最小 E5 比较器，S2 签收后执行两轮 S3。** 预登记唯一差异、目标动作和接受条件，绑定两个 run 的身份与证据。记录不可判定的原因。若要声明迁移性，另预登记独立确认材料并在候选冻结后开启。`docs/scenarios.md:63-87` · [改进闭环](03-improvement-loop.md)

## 调研判断记录

| 判断 | 证据 | 结果 |
| --- | --- | --- |
| 采用当前源码及已记录的历史运行，校正 S2 草案 | `src/cli.mjs:22-32`，`contracts/artifacts/README.md:5-11`，`docs/status.md:3-12` | `--verify-run` 和进程退出收据已有实现，隔离仍待验收。 |
| 让工程故障先于 S3 教学判定 | `docs/status.md:155-161`，`docs/scenarios.md:83-87` | 将流超时、未知用量、孤儿进程放入实施优先级。 |
| 用公开精选题库选择面试题 | [AI Engineer 75](https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/AI-ENGINEER-75.md)，[ByteCamel 题库](https://www.bytecamel.com/interview-questions/site-reliability-engineering) | 给出可核查原题。题库优先级代替无法证实的公司面试频率。 |
