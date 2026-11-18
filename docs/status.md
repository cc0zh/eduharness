# 当前状态

E1 离线主路径已实现。真实模式未获得费用授权。**未在真实场景走通**。

离线证据在 `runs/e1-offline-reviewed/`，收据在 `runs/_receipts/e1-offline-reviewed.json`。`node src/cli.mjs --mode offline --run-root runs --id e1-offline-reviewed` 已退出 0。`npm run check` 通过 17 项测试及导入边界检查。真实试跑通常 18 次调用，最多 66 次尝试，累计请求输出上限 682,176 token，不含输入。

相关入口见 [E1](scenarios.md)、[计划](plans/e1.md) 和 [运行手册](runbook.md)。`npm run check` 只运行本地离线测试和导入边界检查，不运行真实评估。S0-01 答案键检查覆盖旧确认片段，不修改数据集或判定 E1 分数。
