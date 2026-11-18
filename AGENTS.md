# TeachArena 工作入口

- 先读 [README](README.md) 运行 E1。验收看 [场景卡](docs/scenarios.md)，状态看 [status](docs/status.md)，方法引用用户级 `evidence-first-project-workflow`。
- 旧库 `D:\Code\mini-eduharness2` 只读。禁止读取或复制其 `config/settings.json`、`.loopx/`；不改旧库，不提交旧库，不 push。
- 所有 LLM 调用经 `src/models.mjs`。配置预算、推理和重试看 `config/e1.mjs`；预算改动要改变评测身份。API key 只从环境变量读取。真实运行前用 `ask_user` 报调用数和 token 上限，取得授权后才使用 `--confirm-cost`。
- 改对话、分数或产物先看 [术语](docs/glossary.md) 和 `contracts/<owner>/`。教师不读取数据集或裁判契约。离线测试和真实运行走同一编排。不用兜底分数、也不把尺子用于排名。
- 用 `node --test`。先写测试并看到它失败，再写实现让它通过。不要先 mock 被修改的函数再对 mock 做断言。坏输入、截断、空正文、JSON 后跟多余文本都要测。汇报贴红、绿输出；运行 `npm run check`。
- 排障见 [runbook](docs/runbook.md)。产物放 `runs/`，收据放 `runs/_receipts/`。临时文件放 `.tmp/scratch/<任务名>/`，用后清理。`runs/`、`.tmp/` 不进 Git。
- 交接看 [计划](docs/plans/e1.md) 和 [历史](docs/history.md)。提交前独立审查。离线证据不能代替真实验收。
