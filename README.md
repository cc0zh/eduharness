# TeachArena

TeachArena 用固定尺子判断教学 harness 的改动带来了哪些对话和教学行为变化。

依次验收三个阶段。S1 建立稳定的评测环境，验证报告、教学工具和四个坏教师。S2 为改进 Agent 提供两侧完全独立的运行环境。S3 在该环境中逐轮验证 harness 改动。S1 完整五格已通过，裁判稳定性验证因调用故障停止，签收暂缓。详见[三阶段验收卡](docs/scenarios.md)与[当前状态](docs/status.md)。

需要 Node.js 22.19 或更新版本。首次运行：

```sh
npm ci
node src/cli.mjs --mode offline --run-root runs --id e1-first
```

从 stdout 读取结果 JSON，或打开 `runs/e1-first/result.json`。对照每格的 `judge.json` 和 `transcript.json`，用消息 ID 查原文。离线通过只说明运行和证据链可重跑，不代表真实评估通过。再次运行时使用新的 ID。

`npm run check` 运行本地测试和契约导入边界检查。真实运行及原件回读见[运行手册](docs/runbook.md)。各维度、分档、有效总分和坏教师目标见[裁判契约](contracts/judge/README.md)。
