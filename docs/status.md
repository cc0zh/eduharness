# 当前状态

E1 离线主路径已实现。真实运行已获授权，限 S0-06 两格、最多 66 次尝试、累计输出上限 682,176 token。旧仓库 `.env` 中未找到非空的 `DEEPSEEK_API_KEY` 或 `OPENROUTER_API_KEY`，因此没有发起真实调用，没有真实 run 或收据。**未在真实场景走通**。

离线 [结果](../runs/e1-offline-reviewed/result.json) 和 [收据](../runs/_receipts/e1-offline-reviewed.json) 保存在本机。`node src/cli.mjs --mode offline --run-root runs --id e1-offline-reviewed` 已退出 0。凭据接入后 `npm run check` 通过 20 项测试及导入边界检查。恢复前需在本仓库 `.env` 补齐两个变量，参照 [空白模板](../.env.example)。进程变量优先于 `.env`。

相关入口见 [E1](scenarios.md)、[计划](plans/e1.md) 和 [运行手册](runbook.md)。`npm run check` 只运行本地离线测试和导入边界检查，不运行真实评估。S0-01 答案键检查覆盖旧确认片段，不修改数据集或判定 E1 分数。
