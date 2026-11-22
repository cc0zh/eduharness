# 运行手册

使用 [README](../README.md) 的离线命令。`--run-root` 默认 `runs`，`--id` 默认 UUID（不覆盖同名目录），`--mode` 默认 `offline`。真实模式先用 `--estimate-only` 预估，取得授权后才使用 `--mode real --confirm-cost --max-attempts <上限> --max-requested-output-tokens <上限>`；凭据按进程环境变量优先、当前目录 `.env` 其次读取 `DEEPSEEK_API_KEY` 与 `OPENROUTER_API_KEY`（见 [空白模板](../.env.example)）。

真实模式（含 `--judge-only`）在加载凭据前强制检查干净工作区与当前 HEAD 的 `runs/_receipts/check-<sha>.json`（由干净工作区执行 `npm run check` 生成）；`--estimate-only` 零请求，可在无收据时执行。只裁判冒烟可用 `--mode real --judge-only e1-real-structured --estimate-only`；E2 入口为 `--scenario E2`（历史规则见 [e2.md](archive/plans/e2.md)）。

## 阶段 2a 高压学生保真

这一路径只读取 `config/hard-learners.mjs` 的两道已暴露训练题，不加载混合题库。

1. 在干净 HEAD 运行 `npm run check -- --scope=hard-learners`，生成范围收据 `runs/_receipts/check-hard-learners-<sha>.json`。
2. 执行 `node src/cli.mjs --scenario hard-learner-fidelity --mode real --estimate-only --id <预检 ID>`（小样或复跑自证伪修复时加 `--learner-fix pilot|a --proxy-from-env`），锁定预登记 SHA256。
3. 获授权后改 `--confirm-cost` 并传入 `--preregistration <文件> --preregistration-sha256 <摘要>` 与硬上限串行运行；单条回复最多重试 2 次，连败 3 次或累计学生回复失败 8 条停线。
4. 执行 `node src/cli.mjs --verify-run <ID>` 核对 PID 与遥测；`acceptance` 表示拿齐审核，正式 `assessment` 才是画像判线。Gemini 历史独立重审命令保留在 [历史运行步骤](archive/runbook-historical.md#阶段-2a-本地历史脚本复核已迁移工作树)。

## 阶段 2b 开发集余量检查

`--scenario stage2b-headroom` 只加载与 manifest 匹配的 8 道 dev 题（默认根目录 `D:\Archive\teacharena\stage2-holdout\`，可用 `TEACHARENA_STAGE2_HOLDOUT_ROOT` 指向副本），缺失或摘要不符直接失败。

1. 干净 HEAD 运行 `npm run check`，先用 `--mode real --proxy-from-env --concurrency 4 --estimate-only` 绑定两个预登记 SHA256。
2. 获授权后替换 `--estimate-only` 为 `--confirm-cost` 启动 `stage2b-headroom-real-01`；结束后执行 `--verify-run <ID>` 与 `node scripts/stage2b-headroom-report.mjs <ID>`（同时比对[同输入裁判波动](archive/stage1-closeout.md#同输入翻转率)）。

## 阶段 3 状态驱动教师

入口 `--scenario stage3-state-machine` 只支持 dev，不提供留出集入口；离线模式不加载真实开发集、凭据或代理：

```sh
node src/cli.mjs --scenario stage3-state-machine --mode offline --id stage3-offline-01 --run-root runs/stage3-offline
node src/cli.mjs --verify-run stage3-offline-01 --run-root runs/stage3-offline
```

真实 dev 须先在干净 HEAD 跑通 `npm run check`，使用 `--edition 1|2 --concurrency 4 --proxy-from-env` 与 [锁定预登记](research/stage3/preregistration.md) / [附录 01](research/stage3/preregistration-addendum-01.md) SHA256 完成 `--estimate-only` 预检再 `--confirm-cost --estimate-id <预检 ID>` 启动；结束后执行 `--verify-run <ID> --run-root runs/stage3-dev` 核对 `stage3.pid` 与分角色用量。`report.json` 的 `decision` 为筛选结论，阶段 3 最终已作**不采用**收口。

## 格级并发和断点续跑

- `E1`、`E2`、`S1-binary` 支持 `--concurrency 1..5`（仅并发格子，格内串行）与 `--resume --id <原 ID>`；HTTP 429 时本进程并发自动降一档（最低 `1`）。
- 续跑校验原模式、场景、HEAD、源码哈希、评测身份与预登记 SHA256，保留已校验判决只补未完成格；所有进程共用原子预留的尝试与输出 token 硬上限，中断预留不退还。

## 导出离线 HTML 回读报告

```sh
node src/cli.mjs --export-report <run-id> [--run-root runs] [--back-href ../index.html] [--out <path.html>]
node scripts/export-project-report.mjs --out-dir docs/report --s1-root runs --stage3-root <stage3-runs-dir> --force
```

单 run 页支持公开的 S1 二元 v1/v2/v3、Stage 3 dev v2 与 E1/E2 六维 v3 产物（不重算分数或用量，缺判或不一致红字标出，不可验证引用不跳转）；项目总览导出零外网依赖的多页包到 `docs/report/index.html`。

## 产物与故障定位

用 `node src/cli.mjs --verify-run <id> [--run-root <dir>]` 校验 `runs/_receipts/` 与逐调用原件（返回码 `0` 机器通过、`1` 未达线或执行故障、`2` 输入无效）。

| 原件路径 | 用途 |
| --- | --- |
| `<run>/manifest.json` · `result.json` · `<root>/_receipts/<id>.json` | 评测身份、预算与运行收据 |
| `<run>/<cell>/transcript.json` · `judge.json` · `teacher-events.json` | 可见消息原文、证据绑定与工具 hook |
| `<run>/<cell>/telemetry.json` · `<run>/<cell>/calls/` | 尝试元数据、脱敏出站上下文与实报用量 |

按 `failure.role/turn/call/attempt` 与 `attemptPath` 定位原件；首轮 / 第二轮早期专题步骤见[运行手册历史归档](archive/runbook-historical.md)。
