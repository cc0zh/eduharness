# 当前状态

E1 已发起一次获授权的真实运行，但未通过验收。**未在真实场景走通**。正常教师格完成了对话，裁判失败；`answer_dump` 未启动。未重跑整格，未更换模型或评分规则。

真实命令 `node src/cli.mjs --mode real --confirm-cost --run-root runs --id e1-real-confirmed` 退出 1。[结果](../runs/e1-real-confirmed/result.json) 和 [收据](../runs/_receipts/e1-real-confirmed.json) 均记录 `acceptance: false`。正常教师格为 `infra_failure`、`scored: false`、`validTotal: false`，无总分和提前给答案维度分。裁判第 4 轮第 1 次调用的三份原件：[槽位错序](../runs/e1-real-confirmed/normal/calls/judge-4-1-1.json)、[分组错序](../runs/e1-real-confirmed/normal/calls/judge-4-1-2.json)、[请求中止](../runs/e1-real-confirmed/normal/calls/judge-4-1-3.json)。没有可用的裁判引用。

[遥测](../runs/e1-real-confirmed/normal/telemetry.json) 记录 10 次逻辑调用、12 次尝试（含 2 次重试）；请求输出上限合计 239,472 token。已上报的输出合计 30,563 token，最后一次裁判请求中止，实际用量未知。四份学生模型请求均只包含公开对话，没有出现教师内部标记。`runs/` 和可达 Git 历史未命中两项凭据的原值。

离线 [结果](../runs/e1-offline-reviewed/result.json) 和 [收据](../runs/_receipts/e1-offline-reviewed.json) 仍保存在本机，退出 0。`npm run check` 通过 20 项测试及导入边界检查。真实运行的本地凭据按用户确认从旧 `.env` 的 `EVAL_STUDENT_API_KEY` 和 `EVAL_JUDGE_API_KEY` 迁移，不进入 Git；未读取旧 `config/settings.json`。

相关入口见 [E1](scenarios.md)、[计划](plans/e1.md) 和 [运行手册](runbook.md)。`npm run check` 只运行本地离线测试和导入边界检查，不运行真实评估。S0-01 答案键检查覆盖旧确认片段，不修改数据集或判定 E1 分数。
