# 术语

以下术语从 E1 v1 启用。方法见 `evidence-first-project-workflow`。

| 术语 | 定义 | 不是什么 | 判定依据 | 归属 |
| --- | --- | --- | --- | --- |
| 有效总分 `validTotal` | 所有必需维度都有合规分数，且证据通过契约校验后的总和。 | 不是均值、部分分或填补缺分。 | `validTotal: true`、`total` 为数值；审阅绑定裁判和对话原件。 | artifacts（结果）、judge（评分） |
| 已打分 `scored` | 至少一个已校验维度有分数。 | 不承诺总分有效，也不等于原件已记录。 | 结果 `scored`；失败尝试原件不参与。 | artifacts |
| 已记录 `recorded` | 格子的结果记录已经保存。 | 不等于执行成功或有分。 | 磁盘 `result.json` 中 `recorded: true`。 | artifacts |
| 执行成功 `execution_success` | 格子的对话和评分流程无最终故障。 | 不等于场景验收通过。 | 格子 `status`，结合 `failure` 和 run `acceptance`。 | core / artifacts |
| 基础设施故障 `infra_failure` | 运行未能产出合规证据或结果的技术故障。 | 不是教学差或零分。 | `failure.status`、`kind`，模型调用保存 `role`、`turn`、`call`、`attempt`、`attemptPath`。 | core |
| 裁判部分失败 `judge_partial_failure` | 裁判无法交付所有必需的合规维度。 | 不是裁判有证据给出合法低分。 | 末次裁判原件缺失合规维度或不满足证据绑定。 | core / judge |
| 证据序号 `message number` | `e1-numbered-evidence-v2` 下当前可见窗口中从 1 开始的整数引用。 | 不是跨窗口稳定的消息 ID。 | 裁判 `message_numbers` 或 `opportunity_numbers`，通过 `binding.messageIds[n-1]` 映射。 | judge |
| 消息 ID `message ID` | 一条公开消息在原始对话中的完整标识。 | 不是裁判输出的证据序号。 | `transcript.json` 的 `id`；落盘裁判引用以该 ID 回读。 | core / judge |
| 学生生成契约故障 `simulator_generation_contract` | 学生输出未通过完整 JSON 和结构检查。 | 不是模拟学生作答错误。 | 末次学生尝试与校验失败分类。 | core / learner |
| 推理耗尽 `reasoning_exhausted_empty` | 达到输出上限、没有可见正文，且 provider 明确报告所有输出 token 均为推理。 | 不根据长度上限或正文为空猜原因。 | 调用遥测的停止原因、请求上限、`reasoningTokens` 和 `usage.output`。 | core |
| 尺子 `ruler` | 固定的评分规则、证据校验和计分方法，用于解释 harness 改动。 | 不是教师本身，也不是名次。 | manifest 的 `identity.ruler` 和 judge schema。 | judge |
| 评测身份 `evaluation identity` | 定义可比较条件的版本化快照，包括数据、尺子、配置、运行源码和 pi 版本。 | 不是 run ID 或单独的模型名。 | `manifest.json` 的 `identity`、`identityId` 和 `mode`。 | artifacts |
| 教师 `teacher` | 模型 + harness。harness 负责提示、工具和教学阶段。 | 不是模型单独完成，也不拥有学生画像私有字段。 | manifest 的模型路由和教师源码指纹，结合调用原件与 `teacher-events.json`。 | teacher |
| 会话目标完成 `goal-complete` | Agent 会话对目标状态的声明。 | 不是验收证据或替代验收。 | 会话控制工具的状态。 | artifacts（仅界定证据边界） |
| 验收通过 `acceptance` | 证据覆盖对应场景卡的全部要求。 | 不是仅有离线 `acceptance: true` 或 `goal-complete`。 | 本卡要求真实产物、读回证据和离线回归；`result.acceptance` 仅表示当前模式的机器可判定行为通过。 | artifacts（运行字段）；[场景卡](scenarios.md)（验收） |
