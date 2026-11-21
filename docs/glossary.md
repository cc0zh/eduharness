# 术语

以下术语从 E1 v1 启用。方法见 `evidence-first-project-workflow`。

| 术语 | 定义 | 不是什么 | 判定依据 | 归属 |
| --- | --- | --- | --- | --- |
| 已记录 `recorded` | 格子的结果记录已经保存。 | 不等于执行成功或有分。 | 磁盘 `result.json` 中 `recorded: true`。 | artifacts |
| 执行成功 `execution_success` | 格子的对话和评分流程无最终故障。 | 不等于场景验收通过。 | 格子 `status`，结合 `failure` 和 run `acceptance`。 | core / artifacts |
| 基础设施故障 `infra_failure` | 运行未能产出合规证据或结果的技术故障。 | 不是教学差或零分。 | `failure.status`、`kind`，模型调用保存 `role`、`turn`、`call`、`attempt`、`attemptPath`。 | core |
| 裁判部分失败 `judge_partial_failure` | 裁判无法交付所有必需的合规维度。 | 不是裁判有证据给出合法低分。 | 末次裁判原件缺失合规维度或不满足证据绑定。 | core / judge |
| 证据序号 `message number` | `e1-numbered-evidence-v2` 下当前可见窗口中从 1 开始的整数引用。 | 不是跨窗口稳定的消息 ID。 | 裁判 `message_numbers` 或 `opportunity_numbers`，通过 `binding.messageIds[n-1]` 映射。 | judge |
| 消息 ID `message ID` | 一条公开消息在原始对话中的完整标识。 | 不是裁判输出的证据序号。 | `transcript.json` 的 `id`；落盘裁判引用以该 ID 回读。 | core / judge |
| 学生生成契约故障 `simulator_generation_contract` | 学生输出未通过完整 JSON 和结构检查。 | 不是模拟学生作答错误。 | 末次学生尝试与校验失败分类。 | core / learner |
| 推理耗尽 `reasoning_exhausted_empty` | 达到输出上限、没有可见正文，且 provider 明确报告所有输出 token 均为推理。 | 不根据长度上限或正文为空猜原因。 | 调用遥测的停止原因、请求上限、`reasoningTokens` 和 `usage.output`。 | core |
| 尺子 `ruler` | 固定的评分规则、证据校验和计分方法，用于解释 harness 改动。 | 不是教师本身，也不是名次。 | `identity.ruler`。从 `e1-numbered-evidence-v3` 起使用明确的主动权分档边界和理由引用。旧版与新版分档不可直接比较。 | [judge](../contracts/judge/README.md) |
| 评测身份 `evaluation identity` | 定义可比较条件的版本化快照。 | 单独的 run ID 或模型名不足以标识。 | `manifest.json` 的 `identity`、`identityId`、`scenario` 与 `mode`。本次启用 `identity.version: evaluation-identity-v2`，纳入新版尺子和调用策略。 | [artifacts](../contracts/artifacts/README.md#评测身份) |
| 教师 `teacher` | 模型 + harness。harness 负责提示、工具和教学阶段。 | 不是模型单独完成，也不拥有学生画像私有字段。 | manifest 的模型路由和教师源码指纹，结合调用原件与 `teacher-events.json`。 | teacher |
| 会话目标完成 `goal-complete` | Agent 会话对目标状态的声明。 | 不是验收证据或替代验收。 | 会话控制工具的状态。 | artifacts（仅界定证据边界） |
| 验收通过 `acceptance` | 证据覆盖对应场景卡的全部要求。 | 单有离线 `acceptance: true` 或 `goal-complete` 不足。 | 逐栏核对对应卡的证据。`result.acceptance` 记录当前模式的机器判断。 | artifacts（运行字段）、[场景卡](scenarios.md)（验收） |
| 启动记录 `start record` | CLI 本次启动在首次外部请求前写入的进程快照。 | 不是评测 `manifest.json`，也不证明进程正常结束。 | `runs/_receipts/<id>.start.json` 的 run ID、HEAD、工作区状态、模式、参数摘要、PID 和开始时间。 | [artifacts](../contracts/artifacts/README.md#运行收据) |
| 收据 `process receipt` | CLI 进程结束时记录退出码、请求数和验收状态的原件。 | 不是工具回执，也不能单独证明每次请求都可回读。 | `runs/_receipts/<id>.process.json` 与启动记录及请求日志通过 `--verify-run <id>` 一致性检查。 | [artifacts](../contracts/artifacts/README.md#运行收据) |
| 进程序号 `processIndex` | 同一 run 的第几次启动，从 1 开始。 | 不是 PID，不是格内尝试序号。 | `--verify-run` 的 `processes`，结合请求 `callId` 和格子原件目录。 | [artifacts](../contracts/artifacts/README.md#运行收据) |

以下术语用于验收场景。学生变化沿用历史名称。

| 术语 | 定义 | 不是什么 | 判定依据 | 归属 |
| --- | --- | --- | --- | --- |
| 原始分档 `score` | 裁判为单个维度给出的档位。 | `null` 未定档不计为 0 分。 | `judge.json` 的维度 `score` 和绑定证据。 | [judge](../contracts/judge/README.md#评分维度) |
| 观察窗口 `observation window` | 公开视图内可核对某行为发生或缺失的消息范围。 | 有后续发言不必然意味着有教学机会。 | `binding.messageIds`、证据槽及公开消息顺序。 | [judge](../contracts/judge/README.md#证据绑定与观察窗口) |
| 教学机会 `teaching opportunity` | 公开对话中可合理期待教师执行目标教学动作的时机。 | 单有对应角色发言不足。 | 用机会消息和后续发言核对触发条件。 | [judge](../contracts/judge/README.md#证据绑定与观察窗口) |
| 不可判定 `inconclusive` | 原件不足以支撑某次教学对照结论。 | 不能当作无变化或尺度命中。 | 核对教学机会、身份差异、必要分档及绑定原件。当前无对应运行枚举。 | [judge](../contracts/judge/README.md#已知问题)（判定）、artifacts（证据） |
| 单人盲标 | 由一人按统一分档给匿名对话标注，并引用对话证据。 | 不看机器分档、理由和匿名映射，也不代表多人共识。 | 用 SHA256 锁定标注后才能揭分。 | [人工盲标协议](scenarios.md#人工盲标协议) |
| 逐维一致性 | 对每个评分维度分别统计锁定标签与尺子的线性加权 Cohen κ 和精确同档率。 | 不是总分一致，也不单凭两项统计量判定通过。 | 同档率按有效配对中标签与机器分档完全相同的比例计算。通过线见预登记。 | [人工盲标协议](scenarios.md#人工盲标协议) |
| 尺子冻结 | 固定供未见题验收使用的尺子版本和评测条件，冻结与训练一致性结论分开记录。 | 不代表训练已通过，不是冻结对话，不允许用测试结果回头调尺子。 | 核对冻结记录和各次运行的评测身份。 | [冻结记录](status.md#冻结记录) |
| A/B 对照 | 在相同评测条件下，将各手写候选和同一基线分别对照，再与人的判断核对。 | 不是排名，也不是多轮自动优化。 | 各侧使用独立 `--run-root`，用 manifest、分档和消息 ID 回读差异。 | [第 4 步场景卡](scenarios.md#第-4-步-手写-harness-变体-ab) |

评分维度的规范名称、分档和权重统一登记在[裁判契约](../contracts/judge/README.md#评分维度)。

| 术语 | 权威来源 |
| --- | --- |
| 已打分 `scored` | [裁判契约 · 评分维度](../contracts/judge/README.md#评分维度) |
| 有效总分 `validTotal` | [裁判契约 · 评分维度](../contracts/judge/README.md#评分维度) |
| 学生变化 `learner_change`（历史） | [裁判契约 · 学生变化（历史口径）](../contracts/judge/README.md#学生变化历史口径) |
