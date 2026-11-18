# TeachArena

TeachArena 用固定尺子检查教学 harness 的改动是否改善了对话，以及变化发生在哪些教学回合。E1 用 S0-06 的正常教师和 `answer_dump` 检查尺子能否识别提前给出完整答案。

需要 Node.js 22.19 或更新版本。首次运行：

```sh
npm ci
node src/cli.mjs --mode offline --run-root runs --id e1-first
```

从 stdout 读取结果 JSON，或打开 `runs/e1-first/result.json`。对照每格的 `judge.json` 和 `transcript.json`，用消息 ID 查原文。离线通过只说明运行和证据链可重跑，不代表真实评估通过。再次运行时使用新的 ID。

`npm test` 运行测试；`npm run check` 还检查契约导入边界。真实运行须先在干净的当前 HEAD 执行 `npm run check`，生成检查收据，再用 `node src/cli.mjs --estimate-only` 查看额度。取得费用授权后设置 `DEEPSEEK_API_KEY`、`OPENROUTER_API_KEY`，使用 `--mode real --confirm-cost` 和新的 ID。CLI 优先用进程环境变量，其次用当前目录 `.env` 中的对应变量，见 [空白模板](.env.example)。只复查裁判时，用 `--judge-only <原 run ID>`，先预估再申请授权。详见 [运行手册](docs/runbook.md) 和 [E1 场景卡](docs/scenarios.md)。
