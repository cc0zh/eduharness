# 三阶段验收卡

按 S1、S2、S3 顺序验收。S1–S3 是项目阶段，S0-06 是数据集任务。方法见用户级技能 `evidence-first-project-workflow`。当前进度见[状态](status.md)，评分口径见[裁判契约](../contracts/judge/README.md)。

## S1 稳定的环境

状态：进行中。E1 已验收，E2 待真实验收。

| 栏 | 内容 |
| --- | --- |
| 谁 | 从 README 和 AGENTS.md 接手的操作者及报告复核者。 |
| 条件 | 干净且版本可核对的检出，固定数据与评测身份，按运行手册使用真实模式。 |
| 能完成什么 | 用公开入口运行一次评测，得到可回读的报告，验证教学工具可用并检查四个坏教师。E1 真实双格、E2 四项真实对照、工具成功证据及两项回归均满足时，第 1 步完成。 |
| 证据 | 用 E1 卡的历史 run 和 E2 卡的 `e2-real-<日期>-<序号>` 回读退出码、manifest、结果、调用原件、运行收据及 manifest 指向的检查收据。用 E1 正常格 `teacher-events.json` 的同一个 `toolCallId` 核对 `check_distance` 的前后 hook 和 `isError: false`。本节末尾两项回归通过并保存退出码及检查输出。[回读步骤](runbook.md) |
| 失败可定位 | 用检查收据定位检出差异，用 manifest 定位输入版本，用格子、轮次、调用、尝试及消息 ID 定位工具、评分或对照失败。 |
| 不算交付 | 只有离线双格、缺一项坏教师对照、靠未授权的填分得到总分，或只能从会话中找到证据。 |

### E1 S0-06 真实双格

状态：已验收。记录提交 `cd0de52`，真实执行检出 `e045d49`。

| 栏 | 内容 |
| --- | --- |
| 谁 | 首次验证运行和证据链的接手者。 |
| 条件 | 固定 S0-06、学生画像和尺子。正常教师与 `answer_dump` 共用同一编排。 |
| 能完成什么 | 取得两格有效总分，凭绑定消息确认首个实质回应揭底使 `productive_struggle` 至少低一档。 |
| 证据 | run `e1-real-numbered-two-cells` 退出 0。读 `runs/e1-real-numbered-two-cells/{manifest,result}.json` 与 `runs/_receipts/e1-real-numbered-two-cells.json`，再进 `normal/`、`answer_dump/` 下的 `judge.json`、`transcript.json`、`teacher-events.json`、`calls/`。检查收据为 `runs/_receipts/check-e045d492f290df23108fdd28fe792f56a7696ba0.json`。本机缺产物时，先用 `git show cd0de52:docs/status.md` 查验收记录，再索取原件。[运行手册](runbook.md) |
| 失败可定位 | 用绑定坐标和遥测区分学生边界、工具执行、裁判失败和教学行为。 |
| 不算交付 | 只有离线夹具、只裁判冒烟，或只有分数没有消息引用。 |

### E2 四个坏教师自检

状态：离线链路已验证，真实验收待完成。E1 的 `answer_dump` 只作历史旁证。E2 要在同一 run 对同一正常格完成四项对照，E1 结果不能抵扣其中一项。

| 栏 | 内容 |
| --- | --- |
| 谁 | 维护尺子与复核目标教学行为的人。 |
| 条件 | 固定 S0-06、学生、模式和评测身份，正常格和四种坏教师在同一 E2 run 执行。[预登记与命令](plans/e2.md) |
| 能完成什么 | 四项对照分别达到预登记分档条件，逐项确认原件支持目标行为和教学机会。[行为与目标维度](../contracts/judge/README.md#e2-坏教师的目标维度) |
| 证据 | 已有离线 run `e2-offline-reviewed`。真实验收采用 `e2-real-<日期>-<序号>`，要求退出 0。先核对 `runs/_receipts/<id>.json`、`runs/<id>/manifest.json` 及 manifest 指向的检查收据，再从 `runs/<id>/result.json` 的 `comparisons` 回到两格的 `judge.json`、`transcript.json` 和 `calls/`，核对原始分档和机会消息。人工回读结论放 `runs/<id>/review.md`，逐项注明维度、两侧消息 ID 和是否支持目标行为。[运行手册](runbook.md) |
| 失败可定位 | 保留同档、反向分差、不可判定和基础设施故障，分别写格子、目标维度、证据组与消息 ID。 |
| 不算交付 | 用非目标维度、缺少真实教学机会的低分、离线差值或旧双格替代同次对照。 |

### S1 回归证据

- S0-01 答案键。`node --test contracts/dataset/contract.test.mjs` 退出 0。对照 `contracts/dataset/example.json` 的 `m10` 与 [答案推导](../contracts/dataset/README.md)，验证确认 57 被识别、确认 43 合规。原题、变式和私测分开核查。
- 输出截断与额度拦截。`node --test test/models.test.mjs test/e1.test.mjs test/judge-recovery.test.mjs` 退出 0。用固定夹具回读截断、无正文、推理用量未知、超时信息和发请求前拦截。用测试名以及 `role/turn/call/attempt` 定位失败。超时夹具的重放证据不代替真实服务的 deadline 行为验证。
- 两项回归随 `npm run check` 执行。单跑没有评测 run ID，核对命令及测试退出码。干净检出全量检查的收据位于 `runs/_receipts/check-<sha>.json`。

## S2 独立的改进环境

状态：待实现和验收。

| 栏 | 内容 |
| --- | --- |
| 谁 | 执行 harness 改动的 Agent 和审核隔离证据的操作者。 |
| 条件 | S1 已通过。固定任务 S0-06，准备当前请求、锁定的版本和可校验的权威原件。旧版和改动版分别冷启动，核对两侧 `manifest.json` 的 `taskId` 均为 `S0-06`。 |
| 能完成什么 | 在开发检出之外分别运行两版。两侧独占各自运行目录、临时文件、缓存、记忆、会话及其他可写状态。每轮新会话只从本轮请求与权威原件重建输入。 |
| 证据 | 验收约定为 `runs/s2-<日期>-<序号>/`。`isolation.md` 保存开发检出路径与试验前后状态、两侧真实路径及写权限清单。分别从 `<验收根>/old/` 与 `<验收根>/changed/` 回读各自 `s2-old`、`s2-changed` 的 manifest、结果和同根 `_receipts/<id>.json`，记录启动命令与退出 0。`isolation.md` 同时保存交叉写入探针的非零退出码、两侧标记互不可见的输出、开发检出及权威原件的前后哈希。对每侧保存初始目录清单、请求与原件哈希和首个请求记录，核对旧会话未被载入。复核者从 `isolation.md` 的相对路径进入两侧原件。 |
| 失败可定位 | 记录越界的真实路径、权限、共享存储、启动时载入的会话或哈希不一致的输入。 |
| 不算交付 | 只换 run ID、共用可写缓存、只靠指令约束写入，或用上轮会话摘要充当本轮权威输入。 |

## S3 改进循环

状态：待 S2 通过。

| 栏 | 内容 |
| --- | --- |
| 谁 | 改进 Agent 与回读对照的验收者。 |
| 条件 | S2 已通过。每轮沿用该隔离约定，从本轮请求及权威原件启动。各轮固定任务 S0-06，按 E5 核对两侧 manifest。预登记要调整的提示词、教学阶段或工具及预期行为。 |
| 能完成什么 | 连续完成至少两轮 E5。每轮从消息证据判断改好、改坏、无变化或不可判定，记下保留、撤回或暂不采纳的决定。下一轮根据已核对的版本和原件重新开始。 |
| 证据 | 约定使用 `runs/s3-<日期>-<序号>/`。`iterations.md` 按轮记录请求和原件哈希、S2 隔离复核、两个 run ID、退出码、收据路径、目标动作、双方消息 ID、结论及下一轮基准版本。每轮按 E5 的路径回读 manifest、对话与裁判原件，逐条核对结论。 |
| 失败可定位 | 定位到轮次、基准与候选版本、偏离的身份字段、指定教学行为，或缺失的原件。 |
| 不算交付 | 只有一轮、只报总分、静默更换尺子，或从无法核对的结果采纳改动。 |

### E5 单轮改进对照

状态：待实现和验收。以下是未来验收产物约定。

| 栏 | 内容 |
| --- | --- |
| 谁 | 提交当轮 harness 改动并解释教学影响的人。 |
| 条件 | 复用 S2 的冷启动与写入隔离。预登记固定任务 S0-06、可变资产和目标维度。核对两侧 `manifest.json` 的 `taskId` 均为 `S0-06`。两侧身份只允许预登记的 harness 差异。[身份核对](../contracts/artifacts/README.md#评测身份) |
| 能完成什么 | 用两侧目标分档和具体教学动作解释当轮变化。机会或证据不足时标为不可判定。 |
| 证据 | 在 S3 验收根的 `round-<NN>/old/` 和 `round-<NN>/changed/` 运行 `r<NN>-old`、`r<NN>-changed`。归档各自退出码，执行成功要求退出 0。回读同根 `_receipts/<id>.json`、`<id>/{manifest,result}.json` 和每格 `judge.json`、`transcript.json`，必要时用 `calls/` 和 `teacher-events.json` 复核。`round-<NN>/comparison.md` 保存预登记、身份差异、两侧消息 ID 与结论，由 `iterations.md` 索引。 |
| 失败可定位 | 区分身份漂移、基础设施故障、有效证据缺失和可回读的教学退化。 |
| 不算交付 | 把故障或无机会当无变化，只比较总分，或用尺子给教师排位。 |
