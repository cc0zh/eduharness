# 运行手册历史步骤归档（首轮与第二轮早期批次）

> 本页收录阶段 4 收口前已完成或封存的早期一次性命令行步骤（自原 `docs/runbook.md` 迁出只读保留）；现行操作手册见 [runbook.md](../runbook.md)。

## 阶段 2a 本地历史脚本复核（已迁移工作树）

Gemini 对验证集和 run 05 的历史审核不走学生生成入口。只读复核已完成运行时，从保存原件的工作树根执行以下命令（不需要凭据，本地脚本、输入和 SHA256 见 `.tmp/scratch/hard-learners/gemini-audit/progress.md`）：

```sh
node .tmp/scratch/hard-learners/gemini-audit/validation.mjs --verify-run stage2a-qwen-hard-audit-validation-01
node .tmp/scratch/hard-learners/gemini-audit/validation.mjs --verify-run stage2a-gemini-audit-validation-01
node .tmp/scratch/hard-learners/gemini-audit/re-audit.mjs --verify-run stage2a-hard-learners-05-gemini-reaudit-01
```

## E2 冻结对话复核

E2 的 `no_teach` 裁判复核使用 `--scenario E2 --judge-only <源 run ID> --judge-cell no_teach`。运行器把冻结对话与源裁判请求的消息和绑定核对，即使源裁判未产出分数也可复核。新 run 单列裁判结果，完整 E2 验收仍按场景卡核对。

使用 `--scenario E2 --judge-only <源 run ID> --judge-cell all` 可用当前尺子补评冻结五格。真实模式要求真实源 run。新 manifest 保存源评测身份、源 manifest 哈希和每格对话哈希，结果对照使用本次裁判给出的分档。OpenRouter 结构化裁判的调用原件保存脱敏 `outbound` 请求字段。将 `reasoning.max_tokens` 与遥测的 `reasoningTokens` 核对。超限时记录「路由未执行上限」，用量缺失时记录未知。

## 第二轮 S1 五格复判

`--scenario S1-binary --judge-only e2-real-20261119-06` 用[二元尺子](../../contracts/judge/binary.md)复判同一组五格三遍。先在干净 HEAD 运行 `npm run check`。以新的预检 ID 加 `--mode real --estimate-only` 核对源对话及预算。登记实际 run ID、预检上限、判线和构造预期答案，计算预登记文件 SHA256。

按授权额度启动时用 `--mode real --confirm-cost --preregistration <文件> --preregistration-sha256 <摘要> --id <已登记 ID>`，加预检的 `--max-attempts` 和 `--max-requested-output-tokens`。每格目录为 `r1/normal` 等。完成后执行 `node src/cli.mjs --verify-run <ID>`，再运行 `node scripts/s1-binary-report.mjs <ID>` 生成分数、引用和构造矩阵。以报告的逐遍适用分率及目标维方向检查预登记判线。

## 扩展题集（首轮训练与未见题）

补尺子训练使用 `--scenario ruler-expand --phase train`。用 `--generate-only` 生成锁定训练清单的对话。用 `--judge-only <生成 run ID>` 评分。评分前会核对源进程和评测收据及每段对话的字节哈希与消息顺序。测试入口在尺子冻结前拒绝请求。每次先以新 ID 加 `--estimate-only` 预检，再登记实际使用的 run ID。

| 阶段 | 常规请求 | 请求硬上限 | 请求输出 token 硬上限 |
| --- | ---: | ---: | ---: |
| 生成 15 条训练对话 | 120 | 396 | 1,881,216 |
| 训练初评 | 15 | 45 | 2,949,120 |

生成完成后用 `--verify-run <生成 run ID>` 核对收据，再串行运行初评。每题产物在 `<run>/<题号>/<教师条件>/`。达到第四题失败或剩余额度不足时停止。核对两个真实 run 后用 `node scripts/ruler-labels.mjs <生成 run ID> <初评 run ID>` 导出盲标材料。盲标文件在系统临时目录的 `teacharena/ruler-expand/labeling/`。映射和机器分数保存在初评 run 下。

未见题测试使用 `--scenario ruler-expand --phase test --freeze <冻结决定的完整提交 SHA>`。入口拒绝缺失冻结记录、尺子源码或清单哈希不符，以及 `--generate-only`、`--judge-only` 或自选题。冻结决定及训练参考见[冻结记录](status-log-2026-11.md#冻结记录)。

1. 用新 ID 加 `--mode real --estimate-only` 预检。登记测试 `identityId`、哨兵题及请求上限。锁定 25 题最省档的常规请求数为 450，硬上限为 1,650 次尝试和 17,054,400 个请求输出 token。
2. 确认授权和干净 HEAD 的 `npm run check` 收据后，登记实际 ID。去掉 `--estimate-only`，加 `--confirm-cost`，以及授权的 `--max-attempts` 和 `--max-requested-output-tokens`。使用单进程串行执行。先跑 `normal` 和 `answer_dump`、`lecture`、`sycophant_close`，再跑前四道 `no_teach`。只有至少三格有有效总分且剩余额度覆盖后两格，才继续 `no_teach`。第六道故障题或预算耗尽时停止，不重跑已执行格。
3. 用 `--verify-run <测试 run ID>` 核对进程和评测收据。将 `manifest.writer.pid` 和格子的遥测 PID 与启动记录比对。用原始 `judge.json` 和 `transcript.json` 回读预登记维度的证据；运行 `acceptance` 只表示拿齐有效分，不代表测试通过。
4. 用 `node scripts/ruler-test-report.mjs --id <测试 run ID>` 生成证据回读清单。完成回读后，追加 `--audit <回读 JSON>` 复算。报告、逐题计算结果和回读清单保存在该 run 下。不带回读记录的输出不能授予通过。

## 第 4 步 harness 对照（首轮 A/B）

`--scenario ruler-expand --phase ab --freeze e34d8c767ada4a31de5c58016d07d87c2b231ffb` 固定冻结 v3 与预抽样的 10 题。用 `--harness baseline` 或 `--harness improved` 生成并评分。`--harness rhetoric` 加 `--judge-only <基线 ID> --source-root <基线根>`，从已核对的完整基线取副本，只给 #8 追加预登记话术，再评分。

1. 干净 HEAD 上运行 `npm run check`。给三侧各分配一个独立 `--run-root` 和一个新 `--id`。先在每侧命令中使用 `--mode real --estimate-only` 和单独的预检 ID。
2. 确认预算后将 `--estimate-only` 替换为 `--confirm-cost --max-attempts <上限> --max-requested-output-tokens <上限>`，按 `baseline`、`improved`、`rhetoric` 串行运行，每侧结束后执行 `--verify-run`。
3. 先按预登记回读头五题各侧 `transcript.json`，再运行 `node scripts/harness-ab-compare.mjs` 输出逐题分差与 95% 区间；报告写到 `runs/<ab-id>/ab-report.md`。

## ①h 三候选复判

用 `node scripts/judge-bakeoff-preregister.mjs` 将样本、候选参数、硬上限和判线写入 `.tmp/scratch/judge-bakeoff/preregistration.md`。保存 SHA256 并在干净 HEAD 上运行 `npm run check`。

每个候选使用 `--scenario S1-judge-bakeoff --judge-policy haiku|gemini|qwen --concurrency 4` 与 `--preregistration` / `--preregistration-sha256` 完成 `--estimate-only` 预检与 `--confirm-cost` 实跑。完成后用 `--verify-run` 核对每批，再运行 `node scripts/judge-bakeoff-report.mjs --run-root runs --out .tmp/scratch/judge-bakeoff`。维度按 `call` 1 到 6 定位，规则见 [e1-binary-v3 契约](../../contracts/judge/binary-v3.md)。
