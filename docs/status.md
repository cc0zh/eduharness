# 当前状态

E1 的首次真实运行及一次获授权重跑均未通过验收。**未在真实场景走通**。两次均为正常教师格完成对话后裁判失败；`answer_dump` 未启动。未更换模型或评分规则。按停止条件不再尝试。

重跑命令 `node src/cli.mjs --mode real --confirm-cost --run-root runs --id e1-real-recovery --max-attempts 54 --max-requested-output-tokens 442704` 退出 1。[结果](../runs/e1-real-recovery/result.json) 和 [收据](../runs/_receipts/e1-real-recovery.json) 均为 `acceptance: false`。正常教师格为 `infra_failure`，`scored: false`、`validTotal: false`；无总分、提前给答案维度分或可回读的合规裁判引用。

重跑第 4 轮第 1 次裁判调用的三份原件：[没有后续观察窗口](../runs/e1-real-recovery/normal/calls/judge-4-1-1.json)、[非法 JSON](../runs/e1-real-recovery/normal/calls/judge-4-1-2.json)、[非法 JSON](../runs/e1-real-recovery/normal/calls/judge-4-1-3.json)。两次重试都收到上一份校验摘要。三次均 HTTP 200、`finish_reason: stop`，耗时 88.299、98.353、62.888 秒，未触发 180 秒本地超时。[遥测](../runs/e1-real-recovery/normal/telemetry.json) 的 11 条记录均匹配 manifest 的单一 PID，规范化 0 次；4 份学生请求与公开对话逐条一致，没有检测到教师内部标记。

重跑使用 9 次逻辑调用、11 次尝试（含 2 次重试）、234,176 请求输出上限 token，上报输出 46,557 token。两次累计 23 次尝试、473,648 请求输出上限 token，上报输出 77,120 token；首次中止的一次真实用量未知。剩余授权 43 次尝试、208,528 请求输出上限 token，但裁判契约故障再次出现，按约定停止。

真实命令 `node src/cli.mjs --mode real --confirm-cost --run-root runs --id e1-real-confirmed` 退出 1。[结果](../runs/e1-real-confirmed/result.json) 和 [收据](../runs/_receipts/e1-real-confirmed.json) 均记录 `acceptance: false`。正常教师格为 `infra_failure`、`scored: false`、`validTotal: false`，无总分和提前给答案维度分。裁判第 4 轮第 1 次调用的三份原件：[槽位错序](../runs/e1-real-confirmed/normal/calls/judge-4-1-1.json)、[分组错序](../runs/e1-real-confirmed/normal/calls/judge-4-1-2.json)、[请求中止](../runs/e1-real-confirmed/normal/calls/judge-4-1-3.json)。没有可用的裁判引用。

[遥测](../runs/e1-real-confirmed/normal/telemetry.json) 记录 10 次逻辑调用、12 次尝试（含 2 次重试）；请求输出上限合计 239,472 token。已上报的输出合计 30,563 token，最后一次裁判请求中止，实际用量未知。四份学生模型请求均只包含公开对话，没有出现教师内部标记。`runs/` 和可达 Git 历史未命中两项凭据的原值。

复核：首份裁判响应把 `m1,m3` 和 `m2,m4` 放进相邻槽位，呈现交错链；次份的两组共享 `m3` 或 `m6`，不能靠重排消除。第三份 HTTP 200，约 120.008 秒触发本地 120 秒 deadline，只收到 68,028 字符的推理块，无可见 JSON。task-28 空日志且即时结束；task-29 日志含该 run 的结果和退出码。12 条原件时间线与 task-29 一致，未发现双写证据，但旧遥测没有 PID，无法逐条独立归属或证明 task-28 无提供商侧账单。保留该 run，不作验收证据。

修复后的离线 [结果](../runs/e1-offline-recovery-verified/result.json) 和 [收据](../runs/_receipts/e1-offline-recovery-verified.json) 保存在本机，退出 0。`npm run check` 通过 25 项测试及导入边界检查。真实运行的本地凭据按用户确认从旧 `.env` 的 `EVAL_STUDENT_API_KEY` 和 `EVAL_JUDGE_API_KEY` 迁移，不进入 Git；未读取旧 `config/settings.json`。

相关入口见 [E1](scenarios.md)、[计划](plans/e1.md) 和 [运行手册](runbook.md)。`npm run check` 只运行本地离线测试和导入边界检查，不运行真实评估。S0-01 答案键检查覆盖旧确认片段，不修改数据集或判定 E1 分数。
