# TeachArena（首轮入口归档）

> 2026-11-22 阶段 4 重写根 `README.md` 前的首轮说明保留本页；现行项目首页见 [README.md](../../README.md)。

TeachArena 是一个评测项目，用尺子判断一次教学 Agent harness 改动让教学行为变好、变坏还是没变，并定位到具体对话和行为。题量只有 15 道训练题和 25 道测试题。它不用于排名，也不是 benchmark。

依次验证尺子能否区分坏教师、和人的判断一致、在未见题上仍有效，以及能否识别真实的 harness 改动而不被讨好裁判的改动骗过。首轮已收尾，本次 harness 改动未被证明更好，未采用，`normal` 维持原基线。各步的完成证据见[验收场景卡](../scenarios.md)，首轮与后续详细流水见[历史状态流水](status-log-2026-11.md)。

需要 Node.js 22.19 或更新版本。首次运行：

```sh
npm ci
node src/cli.mjs --mode offline --run-root runs --id e1-first
```

从 stdout 读取结果 JSON，或打开 `runs/e1-first/result.json`。对照每格的 `judge.json` 和 `transcript.json`，用消息 ID 查原文。离线通过只说明运行和证据链可重跑，不代表真实评估通过。重新试跑用新 ID；补原批次见[断点续跑](../runbook.md#格级并发和断点续跑)。

`npm run check` 运行本地测试、契约导入边界检查与文档门禁。真实运行及原件回读见[运行手册](../runbook.md)。各维度、分档、有效总分和坏教师目标见[裁判契约](../../contracts/judge/README.md)。
