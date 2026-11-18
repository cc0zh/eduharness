# 运行手册

使用 [README](../README.md) 的离线命令。`--run-root` 默认 `runs`，相对当前工作目录。`--id` 默认 UUID，不覆盖同名目录。`--mode` 默认 `offline`。真实模式入口使用 `--mode real --confirm-cost`。先用 `node src/cli.mjs --estimate-only` 预估。预估只写进程记录。CLI 优先读取进程环境变量 `DEEPSEEK_API_KEY` 和 `OPENROUTER_API_KEY`，其次读取当前目录 `.env` 中的对应变量。见[空白模板](../.env.example)。

付费运行按用户另行确认的额度执行。

重新试跑时，用 `--max-attempts` 和 `--max-requested-output-tokens` 传入剩余额度。同一 run 的各格共享这一上限，每次尝试在发送前预留额度；预算不足报 `budget_exhausted`。已有目录报 `run_conflict`，不会写入。manifest 的 `writer.pid` 对应每条调用遥测的 `pid`。

E2 入口为 `node src/cli.mjs --scenario E2 --id <新 ID>`。见 [预登记与真实运行命令](plans/e2.md)。在 `result.json` 的 `comparisons` 对照每个目标维度的原始分档、证据序号和轮次。用同格 `judge.json` 查证据分组与机会窗口，再用 `transcript.json` 回读消息 ID。任一格发生基础设施故障时，保留已有比较并停止后续格子。缺少任一侧的分档时，该比较的差异值为 `null`。

真实模式（包括 `--judge-only`）在加载凭据前检查 Git 工作区和当前 HEAD 的 `runs/_receipts/check-<sha>.json`。干净工作区运行 `npm run check` 会生成含通过数的收据；有未提交变更或切换 HEAD 后不能沿用旧收据。`--estimate-only` 可以在没有收据时使用，不发请求。

只裁判冒烟可先运行 `node src/cli.mjs --mode real --judge-only e1-real-structured --estimate-only`。取得授权后，移除 `--estimate-only`，加 `--confirm-cost --id <新 ID>`。该模式只读取同一 `--run-root` 下源 run 的完整 `normal` 对话，只需要 `OPENROUTER_API_KEY`。源原件不会改写；新 run 的 `acceptance` 只表示该裁判冒烟通过，不是双格 E1 验收。

E2 的 `no_teach` 裁判复核使用 `--scenario E2 --judge-only <源 run ID> --judge-cell no_teach`。运行器把冻结对话与源裁判请求的消息和绑定核对，即使源裁判未产出分数也可复核。新 run 单列裁判结果，完整 E2 验收仍按场景卡核对。

直接运行 `node src/cli.mjs`，stdout 为一个 JSON 文档，stderr 为诊断。退出 0 表示当前模式机器检查通过，1 表示执行或对照未达到条件，2 表示输入无效。E2 的机器条件见[裁判契约](../contracts/judge/README.md#e2-坏教师的目标维度)。运行收据记录 `acceptance`。人工验收时同时保存命令退出码和引用回读结论。

用 `node src/cli.mjs --verify-run <id>` 核对 `runs/_receipts/` 中的进程原件。自定义运行根时传入原 `--run-root`。[运行收据契约](../contracts/artifacts/README.md#运行收据)

| 原件 | 用途 |
| --- | --- |
| `<run>/manifest.json` | 模式、评测身份、输入版本、预算。 |
| `<run>/result.json`, `<root>/_receipts/<id>.json` | 读回结果和收据。 |
| `<run>/<cell>/transcript.json` | 按可见顺序读回原文。 |
| `<run>/<cell>/judge.json` | 对照维度、逐教学周期的证据分组、消息 ID。 |
| `<run>/<cell>/teacher-events.json` | 回合、finishTurn 和工具 hook 的证据。 |
| `<run>/<cell>/telemetry.json`, `<run>/<cell>/calls/` | 每次尝试的元数据、模型请求上下文和输出。 |

按 `failure.role/turn/call/attempt` 和 `attemptPath` 找故障原件；调用级最多重试 2 次，不再重跑格子或换模型。`usage` 来自 pi；无 provider 原因或 token 字段时记录 `null`，不以推理正文估算。`visibleTokens` 是输出减推理，可能含工具参数。调用原件可能包含私有画像、教学指令及模型推理；不要外发，不进 Git。对照须核实模式和评测身份。离线固定回答只是边界夹具，不用于判断教学质量。

裁判校验失败时，下一次尝试携带上一份校验错误。仅可无损重排同一证据槽位的 ID 或互不重叠的组；记录 `normalized` 和 `originalOrder`，原件不改。各调用另记录 `elapsedMs` 和 `timeoutMs`；本地 deadline 到期与 provider 中断分别标记。

OpenRouter HY4 裁判和复评通过 pi 的 `onPayload` 请求 `json_schema` 和 `provider.require_parameters`，`judgementMode` 记录对应分支。工具调用不是这个路由的备选；公开元数据没有承诺强制指定工具。语法和结构之后仍校验本地语义。历史正文重放使用兼容解析，不把重放分数写回原 run。
