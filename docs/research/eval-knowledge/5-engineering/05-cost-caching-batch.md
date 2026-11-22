# 调用预算、账单、缓存和批量

## 1. 分开保存申请额度、发送与实付

**出处** · OpenRouter `GET /api/v1/generation` 的响应示例及《API Streaming》的最终 usage chunk，TeachArena `docs/status.md:124-149,151-161`、`src/run.mjs:19-33`、`src/models.mjs:11-18,102-118`。[Generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-generation) · [Streaming usage](https://openrouter.ai/docs/api_reference/streaming#the-final-usage-chunk-chat-completions)

**具体内容** · `06` 预检允许 147 次和 1,610,112 请求输出 token。实际 46 次含 1 次重试，预留输出 581,056。已报告的输入 29,843、缓存读入 38,016、输出 100,846 合计 168,705，另有 1 次用量未知。OpenRouter generation 响应记录 `provider_name`、`native_tokens_prompt`、`native_tokens_completion`、`native_tokens_reasoning`、`native_tokens_cached` 和 `total_cost`。各计数口径随接口和适配器而异，同一用量不能按 pi 与 provider 两份重复相加。

**对 TeachArena 的意义** · 保留现有 `reserve` 预算，再加按尝试查账的账本。最小行包含 `{runId, callId, attempt, requestId, generationId, sent, requestedOutput, usageSource, usageState, input, cacheRead, cacheWrite, output, reasoning, provider, billedCost}`。独立标 `not_sent | pending | reported | unknown`。如果 pi 透出 generation ID，用它绑定账单。否则先核实可信获取点，缺 ID 的记录保留未知。跨两个独立 runner 开跑前由可信启动器分别预分配额度，包含重试和预计输入开销。估算费用继续留出价格、缓存和未知费用余量。`contracts/artifacts/README.md:5-17`。

## 2. 区分供应商前缀缓存、完整响应缓存和实验隔离

**出处** · OpenAI《Prompt caching》的 `What is the prompt cache?`，OpenRouter《Prompt Caching》的 `Provider Sticky Routing`、`Inspecting cache usage`，S2 验收卡 `docs/scenarios.md:50-61`。[OpenAI 缓存](https://developers.openai.com/api/docs/guides/prompt-caching) · [OpenRouter 缓存](https://openrouter.ai/docs/guides/best-practices/prompt-caching)

**具体内容** · 前缀缓存复用相同开头的 KV 计算，模型仍生成新输出。OpenRouter 记录 prompt 的 `cached_tokens` 与 `cache_write_tokens`，generation 可查 `cache_discount`。OpenRouter 文档说明 sticky routing 的空闲期为 60 分钟，`session_id` 可作为 routing key，最多 256 字符。该字段的文档保证涉及亲和路由，供应商的 KV 缓存隔离需单独取证。完整响应缓存复用已有输出，所以也会复用一次抽样的结果。

**对 TeachArena 的意义** · 开发离线回归可以读不可变历史响应。新抽样与 S1 裁判稳定性重复应真实发新请求。若新增本地缓存，将完整调用身份与规范化出站请求哈希纳入键，读到缓存时显式标注来源。每侧本地缓存根独占，record/replay 只共享经校验的只读原件。对照两侧记录缓存读写及端点，冷/热状态各自汇报。若供应商共享缓存无法验证，保留该限制，避免把延迟和费用差归因于 harness。`src/run.mjs:57-99,119-159`，`docs/status.md:136-149`。

## 3. 先把冻结裁判批量化，再评估异步供应商接口

**出处** · OpenAI《Batch API》中的 `Prepare your batch file`、`Retrieve the results`、`Rate limits`、`Batch expiration`。TeachArena `docs/runbook.md:13-17`、`src/run.mjs:119-174`。[Batch API](https://developers.openai.com/api/docs/guides/batch)

**具体内容** · 原文给出 50% 费用折扣、24 小时窗口、批次最多 50,000 请求或 200 MB 输入文件。每行 JSONL 有 `{custom_id, method, url, body}`，输出顺序可不同，通过 `custom_id` 关联。过期批次保留已经完成的结果并计费，未完成行写入错误文件。上述数字属于 OpenAI Batch 接口。

**对 TeachArena 的意义** · 优先只并发互不依赖的冻结裁判格。第一版在一个可信调度器内以小量有界并发提交，按 run/cell/逻辑调用/attempt ID 保存独立原件，汇总保留原顺序与每格终态。面试时可画从计划行到结果行的稳定 ID 映射。教师和学生同段对话有轮次依赖，保留格内顺序。等实际路由支持和账单口径核实后再考虑供应商批量，训练或优化可以用部分结果排查，但正式对照保留预登记分母与缺失理由。`src/run.mjs:119-174`，`docs/scenarios.md:83-87`。
