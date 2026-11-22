# 阶段 2b 开发集余量检查：尚未运行

仓库缺 `D:/Code/eduharness/stage2-holdout/dev`。没有锁定 8 道题及其 4 个家族，不能生成 48 格输入清单。未替换为训练题、旧测试题或夹具，也未访问封存集。真实运行停在输入准入，无正式 `identityId`、进程 PID、运行收据或 `--verify-run` 结果。

## 已锁定的报告口径

[方法预登记](../.tmp/scratch/stage2b-headroom/preregistration.md) SHA256 `b820f7360bf23399e5c9aadf102d0b8359f690247c88bec75892f02211f7d8c9`。[本地归档](../runs/stage2b-headroom-preparation/preregistration.md) 与原文件逐字相同。它锁方法，不代替真实输入登记。旧 `normal` 固定 4 轮、9 条消息。默认学生、顽固误解型、伸手要答案型各 8 题、两遍。高压学生沿用阶段 2a 甲组。排除假装懂了型。评分使用[带边界采用的 v3](stage1-closeout.md#评分入口与身份)，没有采用线。

每维报告适用率、平均得分和失分空间，按画像拆分，并以题号和画像对齐两遍。`N/A` 与 0 分分开，未观测不补分。两遍分差混合对话和裁判变化，另与[历史同输入翻转率](stage1-closeout.md#同输入翻转率)对照。单列 A1 跟算误报和 V1 话术敏感。本次没有观测到计划的 6 维余量或 24 对结果，不能凭历史翻转率列阶段 3 候选。

## 零请求预算校核和恢复点

计划 48 格，不计工具续调用与重试为 672 次请求。含工具续调用时，最多 864 次逻辑调用。拟定硬上限 **2,592 次尝试、11,999,232 请求输出 token**，单进程、`--concurrency 4`。停线按每次调用及整批两层规则，批次为连续 3 次供应商或传输失败、连续 3 个失败格、累计 8 个失败格或额度用尽。详见[目录和配置校核](../runs/stage2b-headroom-preparation/source-preflight.json)。本次未进入 CLI 实跑预检，实发 0 次、0 token，未加载 key 或代理。

恢复时只核对 dev 的文件格式、题号、家族和 SHA256。随后接入并离线核对 dev 专用生成与评分流程，锁实际输入及运行身份。在干净 HEAD 上取得 `npm run check` 收据，再用新 ID 做零请求 CLI 预检。真跑后核对 `--verify-run`、PID、逐格分档和原引文，再按登记口径列候选，不代用户选主目标维。[本地进度](../.tmp/scratch/stage2b-headroom/progress.md)
