# 裁判结构化输出诊断

[OpenRouter 模型目录](https://openrouter.ai/api/v1/models) 的 `tencent/hy4-flash` 支持 `include_reasoning`、`max_completion_tokens`、`max_tokens`、`reasoning`、`response_format`、`stop`、`structured_outputs`、`temperature`、`tool_choice`、`tools`。[该模型端点](https://openrouter.ai/api/v1/models/tencent/hy4-flash/endpoints) 则明确 `supports_tool_choice.required` 和 `function` 均为 `false`。因此选 `response_format: json_schema` 和 `provider.require_parameters: true`，不走工具调用。

pi-ai 1.5.2 的 `dist/api/openai-completions.js:550` 起构造 `model`、`messages`、`stream`、预算及可选工具；`:188` 至 `:198` 接收 `onPayload` 返回的替换对象并提交 SDK。`:1143` 至 `:1151` 的工具 `strict` 受 `compat.supportsStrictMode` 控制，`:1293` 默认为 false；它与 `response_format.json_schema.strict` 不是同一字段。

六份原件均为 model `tencent/hy4-flash`、provider `openrouter`。位置以可见正文从 0 开始计，不包括独立的推理块。重放夹具只保存原件 SHA-256、公开对话、正文、停止原因及推理长度。

| 原件 | 原始问题 | 重放 |
| --- | --- | --- |
| `e1-real-confirmed/normal/calls/judge-4-1-1.json` | `misconception_repair.evidence_groups[0].slots` 中 `[m1,m3] → [m2,m4] → [m5]` 跨槽交错。 | 拒绝 |
| `e1-real-confirmed/normal/calls/judge-4-1-2.json` | `misconception_repair.evidence_groups` 在 `m3` 重叠；`support_escalation_and_fading` 也在 `m6` 重叠。 | 拒绝 |
| `e1-real-confirmed/normal/calls/judge-4-1-3.json` | 本地中止，没有正文；仅有独立推理块 68,028 字符。 | 拒绝 |
| `e1-real-recovery/normal/calls/judge-4-1-1.json` | `support_escalation_and_fading.evidence_groups[0].slots.tutor_fading_prompt.opportunity_message_ids[0]` 指向最后一条教师发言 `m8`。已经有教师动作可观察，不需要另一条教师发言。 | 接受；不更改原分档 |
| `e1-real-recovery/normal/calls/judge-4-1-2.json` | 字符 `1617` 的逗号出现在第一个完整对象之后。该对象的 `results` 只有 `misconception_repair`，`support_escalation_and_fading` 错在顶层。 | 拒绝 |
| `e1-real-recovery/normal/calls/judge-4-1-3.json` | 字符 `4983` 是多余 `}`；去掉后，五个维度仍错在顶层，`results` 只有 `misconception_repair`。 | 拒绝 |

已有正文的五份均不含外层代码围栏或混入正文的推理前缀。历史兼容入口只剥除明确的包装，仍要求单一完整对象，不拼接后续内容、丢弃尾随垃圾或移动字段。终轮仍不能用一个未获回应的 learner 消息冒充教师观察窗口。
