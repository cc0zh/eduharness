# 运行手册

使用 [README](../README.md) 的离线命令。`--run-root` 默认 `runs`，相对当前工作目录。`--id` 默认 UUID，不覆盖同名目录。`--mode` 默认 `offline`。真实模式入口使用 `--mode real --confirm-cost`。先用 `node src/cli.mjs --estimate-only` 预估。预估只写进程记录。CLI 优先读取进程环境变量 `DEEPSEEK_API_KEY` 和 `OPENROUTER_API_KEY`，其次读取当前目录 `.env` 中的对应变量。见[空白模板](../.env.example)。

付费运行按用户另行确认的额度执行。

重新试跑时，用 `--max-attempts` 和 `--max-requested-output-tokens` 传入剩余额度。同一 run 的各格共享这一上限，每次尝试在发送前预留额度；预算不足报 `budget_exhausted`。已有目录报 `run_conflict`，不会写入。manifest 的 `writer.pid` 对应每条调用遥测的 `pid`。

E2 入口为 `node src/cli.mjs --scenario E2 --id <新 ID>`。见 [预登记与真实运行命令](plans/e2.md)。在 `result.json` 的 `comparisons` 对照每个目标维度的原始分档、证据序号和轮次。用同格 `judge.json` 查证据分组与机会窗口，再用 `transcript.json` 回读消息 ID。任一格发生基础设施故障时，保留已有比较并停止后续格子。缺少任一侧的分档时，该比较的差异值为 `null`。

真实模式（包括 `--judge-only`）在加载凭据前检查 Git 工作区和当前 HEAD 的 `runs/_receipts/check-<sha>.json`。干净工作区运行 `npm run check` 会生成含通过数的收据；有未提交变更或切换 HEAD 后不能沿用旧收据。`--estimate-only` 可以在没有收据时使用，不发请求。

只裁判冒烟可先运行 `node src/cli.mjs --mode real --judge-only e1-real-structured --estimate-only`。取得授权后，移除 `--estimate-only`，加 `--confirm-cost --id <新 ID>`。该模式只读取同一 `--run-root` 下源 run 的完整 `normal` 对话，只需要 `OPENROUTER_API_KEY`。源原件不会改写；新 run 的 `acceptance` 只表示该裁判冒烟通过，不是双格 E1 验收。

E2 的 `no_teach` 裁判复核使用 `--scenario E2 --judge-only <源 run ID> --judge-cell no_teach`。运行器把冻结对话与源裁判请求的消息和绑定核对，即使源裁判未产出分数也可复核。新 run 单列裁判结果，完整 E2 验收仍按场景卡核对。

使用 `--scenario E2 --judge-only <源 run ID> --judge-cell all` 可用当前尺子补评冻结五格。真实模式要求真实源 run。新 manifest 保存源评测身份、源 manifest 哈希和每格对话哈希，结果对照使用本次裁判给出的分档。OpenRouter 结构化裁判的调用原件保存脱敏 `outbound` 请求字段。将 `reasoning.max_tokens` 与遥测的 `reasoningTokens` 核对。超限时记录「路由未执行上限」，用量缺失时记录未知。

补尺子训练使用 `--scenario ruler-expand --phase train`。用 `--generate-only` 生成锁定训练清单的对话。用 `--judge-only <生成 run ID>` 评分。评分前会核对源进程和评测收据及每段对话的字节哈希与消息顺序。测试入口在尺子冻结前拒绝请求。每次先以新 ID 加 `--estimate-only` 预检，再登记实际使用的 run ID。

| 阶段 | 常规请求 | 请求硬上限 | 请求输出 token 硬上限 |
| --- | ---: | ---: | ---: |
| 生成 15 条训练对话 | 120 | 396 | 1,881,216 |
| 训练初评 | 15 | 45 | 2,949,120 |

生成完成后用 `--verify-run <生成 run ID>` 核对收据，再串行运行初评。每题产物在 `<run>/<题号>/<教师条件>/`。达到第四题失败或剩余额度不足时停止。核对两个真实 run 后用 `node scripts/ruler-labels.mjs <生成 run ID> <初评 run ID>` 导出盲标材料。盲标文件在系统临时目录的 `teacharena/ruler-expand/labeling/`。映射和机器分数保存在初评 run 下。

未见题测试使用 `--scenario ruler-expand --phase test --freeze <冻结决定的完整提交 SHA>`。入口拒绝缺失冻结记录、尺子源码或清单哈希不符，以及 `--generate-only`、`--judge-only` 或自选题。冻结决定及训练参考见[冻结记录](status.md#冻结记录)。

1. 用新 ID 加 `--mode real --estimate-only` 预检。登记测试 `identityId`、哨兵题及请求上限。锁定 25 题最省档的常规请求数为 450，硬上限为 1,650 次尝试和 17,054,400 个请求输出 token。
2. 确认授权和干净 HEAD 的 `npm run check` 收据后，登记实际 ID。去掉 `--estimate-only`，加 `--confirm-cost`，以及授权的 `--max-attempts` 和 `--max-requested-output-tokens`。使用单进程串行执行。先跑 `normal` 和 `answer_dump`、`lecture`、`sycophant_close`，再跑前四道 `no_teach`。只有至少三格有有效总分且剩余额度覆盖后两格，才继续 `no_teach`。第六道故障题或预算耗尽时停止，不重跑已执行格。
3. 用 `--verify-run <测试 run ID>` 核对进程和评测收据。将 `manifest.writer.pid` 和格子的遥测 PID 与启动记录比对。用原始 `judge.json` 和 `transcript.json` 回读预登记维度的证据；运行 `acceptance` 只表示拿齐有效分，不代表测试通过。
4. 用 `node scripts/ruler-test-report.mjs --id <测试 run ID>` 生成证据回读清单。完成回读后，追加 `--audit <回读 JSON>` 复算。报告、逐题计算结果和回读清单保存在该 run 下。不带回读记录的输出不能授予通过。

## 第 4 步 harness 对照

`--scenario ruler-expand --phase ab --freeze e34d8c767ada4a31de5c58016d07d87c2b231ffb` 固定冻结 v3 与预抽样的 10 题。用 `--harness baseline` 或 `--harness improved` 生成并评分。`--harness rhetoric` 加 `--judge-only <基线 ID> --source-root <基线根>`，从已核对的完整基线取副本，只给 #8 追加预登记话术，再评分。不会重生成学生或写入基线根。

1. 干净 HEAD 上运行 `npm run check`。给三侧各分配一个独立 `--run-root` 和一个新 `--id`。先在每侧命令中使用 `--mode real --estimate-only` 和单独的预检 ID。预检不发请求，话术预检不要求基线已运行。
2. 按 `AGENTS.md` 用 `ask_user` 报本次调用和请求输出 token 上限。确认后，才把 `--estimate-only` 替换为 `--confirm-cost --max-attempts <上限> --max-requested-output-tokens <上限>`。按 `baseline`、`improved`、`rhetoric` 串行运行。每侧结束后以原根执行 `node src/cli.mjs --verify-run <id> --run-root <root>`，核对启动、进程、manifest 和遥测 PID。遇到调用重试耗尽、第四道故障题或预检额度用完，保留现有原件并停止，不启动下一侧。
3. 先按预登记回读头五题各侧的 `transcript.json`，保存 #n 与行为判断。再运行 `node scripts/harness-ab-compare.mjs --baseline-root <根> --baseline-id <id> --improved-root <根> --improved-id <id> --rhetoric-root <根> --rhetoric-id <id>`。脚本验证收据与身份、话术副本及 PID，输出逐题分差与整题族重抽 95% 区间。它不作采用决定。缺分保留计划分母，不补零；如果有侧未启动，报告为未观测。

将报告写到 `runs/<ab-id>/ab-report.md`，按预登记合并分数和行为证据。不用离线成绩决定是否采用。

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
