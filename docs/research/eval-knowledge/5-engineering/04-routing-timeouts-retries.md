# 路由、超时和重试

## 1. 把路由支持声明与实际推理用量分别记录

**出处** · OpenRouter《Provider Selection》中的 `Requiring Providers to Support All Parameters`、`Ordering Specific Providers`，及《Reasoning Tokens》中的 `Max Tokens for Reasoning`。TeachArena `docs/status.md:136-149`、`docs/runbook.md:17,34-36`。[路由](https://openrouter.ai/docs/guides/routing/provider-selection#requiring-providers-to-support-all-parameters) · [推理参数](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#max-tokens-for-reasoning)

**具体内容** · `require_parameters` 默认 `false`。设为 `true` 时，路由过滤声明不支持请求参数的端点。对只支持 `reasoning.effort` 的模型，OpenRouter 文档说数值 `reasoning.max_tokens` 用于映射 effort。可用 `provider.only` 缩小候选端点并通过 `allow_fallbacks: false` 约束回退。TeachArena 历史完整五格 `06` 中，6 次裁判请求都发出了 `require_parameters=true`、推理上限 16,384 和总输出上限 65,536，3 次实报推理超限。该记录证明这次运行观察到超限，尚未定位端点转换或模型行为的具体原因。

**对 TeachArena 的意义** · 每次尝试留 `{configuredModel, endpointPolicy, generationId, reportedProvider, requestedReasoning, actualReasoning, capCheck}`。`capCheck` 取 `within | exceeded | unknown`，并在预登记里决定超限如何使工程验收失败或对照不可判定。冻结同一裁判输入，先用小预算取得端点级证据，再决定是否固定端点。路由集合、回退和预算变动纳入身份，A/B 两侧同步。见 `src/models.mjs:102-214`，`contracts/artifacts/README.md:13-17`。

## 2. 把 HTTP 200、首数据、有效进展、终态分开

**出处** · OpenRouter《API Streaming》中的 `Additional information`、`Final usage chunk`、`Handling errors during streaming`。Marc Brooker 的 AWS Builder's Library《Timeouts, retries, and backoff with jitter》，发布页日期 2019-12-05。TeachArena `src/run-receipts.mjs:117-131`、`config/e1.mjs:3-12`、`docs/status.md:151-161,185-196`。[流协议](https://openrouter.ai/docs/api_reference/streaming) · [AWS 超时](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

**具体内容** · SSE 注释可保活。流开始后的错误可能继续使用 HTTP 200，通过事件正文报告。Chat Completions 正常结束前的 usage chunk 位于 `[DONE]` 之前。AWS 用可接受的误超时率选延迟分位点，示例 0.1% 对应 p99.9，还强调覆盖握手和端到端边界。TeachArena 请求日志的 `request_end` 位于收到响应头或传输失败时。`r2/no_teach` 的三次 200 响应分别在 180,011、180,015、180,016 ms 触发本地裁判时限。当前样本记录不了超时后的真实完成时间。

**对 TeachArena 的意义** · `src/models.mjs:154-167` 已用 `onResponse` 读取状态，用 `onProviderStreamEvent` 读取供应商 chunk 的 `finish_reason` 与 usage。沿这些回调增加 `headersMs`、`firstDataMs`、`firstVisibleMs`、`lastProgressMs` 及 `usageSeen`，在调用结束记录 `terminalMs`。SSE 注释能否到达回调仍需测试。设首有效事件、流无进展、尝试总时限，并传递 run 剩余时限。用可控离线流测试 200 后持续输出、仅保活、流错误、截断及 usage 缺失。之后在获授权的冻结集上按端点和推理档记录成功完成及截尾耗时。有足够数据再选分位点，结合长推理低分位吞吐估算余量。历史 3 次截尾无法给出 p99。新时限写入调用策略与身份。

## 3. 用一个重试控制器区分传输重试与语义纠错

**出处** · OpenRouter《Errors and Debugging》的 `Retry-After header`、`When no content is generated`，及《API Credit & Rate Limits》的 `In-flight spending budget`。AWS《Timeouts, retries, and backoff with jitter》，`Retries and backoff`。TeachArena `src/models.mjs:102-214`、`docs/runbook.md:34`。[错误指南](https://openrouter.ai/docs/api_reference/errors-and-debugging) · [限额](https://openrouter.ai/docs/api_reference/limits) · [AWS 重试](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

**具体内容** · AWS 列举五层各对下游发三次请求时，底层负载达到 `3^5 = 243` 倍。推荐单层重试、有限次数、封顶指数退避和 jitter。OpenRouter 区分可等 `Retry-After` 的 in-flight 额度不足和单请求超过总额度，后一种需要改请求或额度。若 reasoning 花完总输出上限，可能得到 HTTP 200、`finish_reason: length`、空正文，原参数重试价值低。TeachArena model wrapper 已关闭 SDK 重试，并允许每个逻辑调用至多 2 次追加尝试。裁判语义校验重试会附上上一份错误。

**对 TeachArena 的意义** · 给每个重试决策记 `{attempt, reason, waitMs, remainingRunMs, priorDelivery, chargeState}`。对有剩余预算与 deadline 的瞬时 429、503 或暂时 in-flight 额度不足读取 `Retry-After`，本地指数退避加 jitter。鉴权、确定性请求错误、同样配置下的确定性长度不足直接结束或启动另一个已登记策略。HTTP 200 后超时的请求按可能已经计费处理，每次重试单独预留。超时取消只对支持取消的供应商保证停止生成和计费。新尝试 ID 区分调用原件，逻辑调用 ID 用于聚合。`src/models.mjs:11-18,102-214`，`docs/status.md:151-161`。[取消条件](https://openrouter.ai/docs/api_reference/streaming#stream-cancellation)
