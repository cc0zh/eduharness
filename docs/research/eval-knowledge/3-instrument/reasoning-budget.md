# 推理模型当裁判与预算

## 1. 同一个模型的推理档位可以改变裁决结果

**出处** Sijun Tan 等，*JudgeBench: A Benchmark for Evaluating LLM-Based Judges*，2024 预印本，本文核对 2025 年 v2，§4 Table 2 及附录 A.2 的 Arena-Hard 配置。[论文原文](https://arxiv.org/html/2410.12784v2)

**具体内容** Arena-Hard 先生成参考答案，再判一对答复，输出 `A>>B`、`A>B`、`A=B`、`B>A` 或 `B>>A`。评测将强弱胜合并。在 350 对有可检验正误标签的答复上，o3-mini 的 overall 正确率 high 80.86%、medium 76.57%、low 70.57%，高低差 10.29 个百分点。分域不完全单调，例如 knowledge 的 medium 62.34%、low 62.99%。该表没有给三档的实耗 token、费用或延迟。论文当中的 4,096 token 判决上限与一次续写机会属于该 judge 实现设置，不能当成各档的实耗。

**对 TeachArena 的意义** 面试中可以说明补充推理可能帮助核查多条证据，也有实际成本。该实验是客观正误的成对题。对教学六维 pointwise 的收益未验证。后续要用同一冻结轨迹、同一评分契约和同一裁判模型单独切换推理档，记录理由及证据、合法分档、JSON 截断、实际 token 和耗时。本文只给机制设计，质量验证由对应环节负责。

## 2. 请求预算、路由执行和可见输出各自可检查

**出处** OpenRouter *Reasoning Tokens* 的 Reasoning tokens and max_output_tokens、Supported models，`config/e1.mjs:3–13`、`docs/status.md:45–55,85–94,136–149`。[官方文档](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)

**具体内容** OpenRouter 把推理 token 算作收费的输出。许多提供方让推理和可见内容共享总输出预算。只支持 `effort` 的模型可能把 `reasoning.max_tokens` 转成档位。文档的 Chat Completions 例子中请求 `max_tokens=300`，响应上报 302 个输出 token、301 个推理 token，只剩 1 个可见 token。`exclude:true` 仅隐藏推理，仍计费用。TeachArena 完整 E2 六次请求均发送推理上限 16,384、总输出 65,536，五次上报推理；其中 21,258、18,386、17,717 超出请求上限，分别多 4,874、2,002、1,333 token。另一次 HTTP 200 后流失败，用量未知。

**对 TeachArena 的意义** 配置中的 16,384 应作为请求值回读。先检查同一端点的实时支持和实报行为，再把上限用于成本承诺。为每次尝试记录 `requested_reasoning`、`reported_reasoning`、`visible = reported_output − reported_reasoning`、停止原因与未知用量；预算或路由变动须改变评测身份。现有失败重试可以帮助输出恢复，但每次重试都要计入请求额度。

## 3. 高推理和成功输出是不同事件

**出处** `docs/status.md:45–55,63–94`、`src/judge.mjs:11–15`、`contracts/judge/schema.mjs:71–87`。

**具体内容** 历史 `no_teach` 三次尝试均在约 180 s 的本地 deadline 停止。一次留下 59,367 字符推理及不完整 JSON，另两次均无可见正文，真实 token 未知。单格补评同一对话上报输出 13,022 token，其中推理 11,478，可见部分为 1,544。另一批 v3 冻结请求累计上报输出 30,148 token，推理 27,143，约占 90.0%，三份正文仍因数字理由被拒。这些日志能确认失败类别，不能单独定位供应商延迟或证明推理 token 导致理由故障。

**对 TeachArena 的意义** 面试可用这两个例子区分预算耗尽或超时、结构解析、理由契约和语义评分。可以用少量冻结样例比较轻量裁判和推理裁判，记录哪一关失败，再决定默认档位。对同一模型增加推理预算不代替证据门槛。
