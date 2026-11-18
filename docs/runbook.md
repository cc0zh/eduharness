# 运行手册

使用 README 命令。`--run-root` 默认 `runs`，相对当前工作目录；`--id` 默认 UUID，不覆盖同名目录；`--mode` 默认 `offline`。只有 `--mode real --confirm-cost` 可连接真实提供商。费用许可由操作者取得，flag 不是授权来源。`--estimate-only` 不发模型请求、不写 run。

重新试跑时，用 `--max-attempts` 和 `--max-requested-output-tokens` 传入剩余额度。两格共享这一上限，每次尝试在发送前预留额度；预算不足报 `budget_exhausted`。已有目录报 `run_conflict`，不会写入。manifest 的 `writer.pid` 对应每条调用遥测的 `pid`。

直接运行 `node src/cli.mjs`，stdout 为一个 JSON 文档；stderr 为诊断。退出 0 表示当前模式机器检查通过，1 表示执行或对照未达到条件，2 表示输入无效。

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
