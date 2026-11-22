# 运行手册

使用 [README](../README.md) 的离线命令。`--run-root` 默认 `runs`，相对当前工作目录。`--id` 默认 UUID，不覆盖同名目录。`--mode` 默认 `offline`。真实模式入口使用 `--mode real --confirm-cost`。先用 `node src/cli.mjs --estimate-only` 预估。预估只写进程记录。CLI 优先读取进程环境变量 `DEEPSEEK_API_KEY` 和 `OPENROUTER_API_KEY`，其次读取当前目录 `.env` 中的对应变量。见[空白模板](../.env.example)。

付费运行按用户另行确认的额度执行。

使用新 ID 重新试跑时，用 `--max-attempts` 和 `--max-requested-output-tokens` 限定本次额度。已有 ID 默认报 `run_conflict`。补跑原批次请用下述 `--resume`，不要把剩余额度填成新的硬上限。

E2 入口为 `node src/cli.mjs --scenario E2 --id <新 ID>`。见 [预登记与真实运行命令](plans/e2.md)。在 `result.json` 的 `comparisons` 对照每个目标维度的原始分档、证据序号和轮次。用同格 `judge.json` 查证据分组与机会窗口，再用 `transcript.json` 回读消息 ID。任一格发生基础设施故障时，保留已有比较并停止后续格子。缺少任一侧的分档时，该比较的差异值为 `null`。

真实模式（包括 `--judge-only`）在加载凭据前检查 Git 工作区和当前 HEAD 的 `runs/_receipts/check-<sha>.json`。干净工作区运行 `npm run check` 会生成含通过数的收据；有未提交变更或切换 HEAD 后不能沿用旧收据。`--estimate-only` 可以在没有收据时使用，不发请求。

只裁判冒烟可先运行 `node src/cli.mjs --mode real --judge-only e1-real-structured --estimate-only`。取得授权后，移除 `--estimate-only`，加 `--confirm-cost --id <新 ID>`。该模式只读取同一 `--run-root` 下源 run 的完整 `normal` 对话，只需要 `OPENROUTER_API_KEY`。源原件不会改写；新 run 的 `acceptance` 只表示该裁判冒烟通过，不是双格 E1 验收。

## 阶段 2a 高压学生保真

这一路径只读取 `config/hard-learners.mjs` 的两道已暴露训练题，且不加载混合题库。不要使用默认 E1 或无范围的全量检查代替。

1. 在干净 HEAD 运行 `npm run check -- --scope=hard-learners`。该检查运行导入边界和不读取题库的测试。收据为 `runs/_receipts/check-hard-learners-<sha>.json`，只准入本场景，不代替全量检查。
2. 用 `node src/cli.mjs --scenario hard-learner-fidelity --mode real --estimate-only --id <新预检 ID>` 取得零请求预算。写好四条件、预期行为、判线和停线并计算预登记 SHA256。记录正式 ID 和事前授权硬上限。
3. 串行执行 `node src/cli.mjs --scenario hard-learner-fidelity --mode real --confirm-cost --id <已登记 ID> --preregistration <文件> --preregistration-sha256 <摘要>`，用 `--max-attempts` 和 `--max-requested-output-tokens` 指定预登记上限。凭据从 `DEEPSEEK_API_KEY` 和 `OPENROUTER_API_KEY` 读取。DeepSeek 学生请求使用 `response_format: {type:"json_object"}`，系统提示含 JSON 示例。调用原件记录围栏、首尾文字和可逐字恢复的反斜线修复。歧义转义作为回复失败记录。
4. 单条学生或审核回复最多重试 2 次。连续 3 次供应商级/传输级调用失败、连续 3 条学生回复失败、或累计学生回复失败达到 8 条，任一即停。失败回复逐条列出，不计画像行为分母、不算画像行为失败；审核只覆盖有效学生回复，审核回复故障另列。停线后保留原件，不重启或补稿。省略 `--learner-fix` 沿用 `config/fidelity-audit.mjs` 的 Qwen 策略，严格 JSON，不发送推理字段或允许回退。
5. 运行 `node src/cli.mjs --verify-run <ID>`。核对启动和进程 PID、manifest 写入 PID 与逐调用遥测。`result.json` 的 `acceptance` 只表示拿齐审核，正式 48 条的 `assessment` 才是画像判线。每份审核都绑定 `r<遍次>/<题号>/<画像>/<条件>/transcript.json` 的 #8、#9。固定前八条不是新生成。不要把 faux 夹具当保真证据。

学生自证伪小样在预检和实跑都加 `--learner-fix pilot`。预登记锁定四组各 10 条的规模、行为计数与选优线。只有预登记选出胜者，才用新 ID 和新预登记将 `pilot` 换成对应的 `a`、`b` 或 `c`，按原计划生成 48 条。两步的真实模式必须加 `--proxy-from-env`，固定使用 Gemini v5 审核。读 `manifest.json` 的 `identity.students` 和出站原件，核对共享条款的画像哈希与实际发送的 `thinking`。小样按组存放原件，不计算正式画像判线。历史原件仍按各自身份复核。

Gemini 对验证集和 run 05 的历史审核不走学生生成入口。只读复核已完成运行时，从保存原件的工作树根执行以下命令。不需要凭据，也不会向模型发请求。本地脚本、输入和 SHA256 见[阶段进度](../.tmp/scratch/hard-learners/gemini-audit/progress.md)。

```sh
node .tmp/scratch/hard-learners/gemini-audit/validation.mjs --verify-run stage2a-qwen-hard-audit-validation-01
node .tmp/scratch/hard-learners/gemini-audit/validation.mjs --verify-run stage2a-gemini-audit-validation-01
node .tmp/scratch/hard-learners/gemini-audit/re-audit.mjs --verify-run stage2a-hard-learners-05-gemini-reaudit-01
```

## 阶段 2b 开发集余量检查

`--scenario stage2b-headroom` 只准入路径附录登记的 8 个 dev 文件。holdout 根目录默认为 `D:\Archive\teacharena\stage2-holdout\`。可用 `TEACHARENA_STAGE2_HOLDOUT_ROOT` 指向同一锁定语料的副本，值为含 `manifest.json` 和 `dev/` 的根目录。所选根缺失或摘要不符时直接失败，不回退到临时目录。加载器先核对 manifest SHA256，再按登记清单逐题校验并用 `readTask` 加载，只读取 `dev/` 下的任务文件，不复制完整 manifest。阶段 2b 不生成保真审核，也不使用 v4。

1. 将方法和路径附录保留在 `.tmp/scratch/stage2b-headroom/`。在干净 HEAD 上运行 `npm run check`。正式模式与预检均带 `--mode real --proxy-from-env --concurrency 4 --max-attempts 2592 --max-requested-output-tokens 11999232`、`--preregistration`、`--path-addendum`、`--preregistration-sha256` 和 `--path-addendum-sha256`。预检用 `--estimate-only --id stage2b-headroom-estimate-01`，不加载凭据或发请求。验真通过后才启动。
2. 按授权移除 `--estimate-only`，加 `--confirm-cost`，换为正式 ID `stage2b-headroom-real-01`。正式启动要求前一步收据绑定同一个干净 HEAD、dev 清单、两个登记摘要和评测身份。不复用 run ID，不续跑或换路由。
3. 对正式 ID 运行 `node src/cli.mjs --verify-run <ID>`，核对启动、结束、manifest 与逐调用 PID。`acceptance` 只表示 48 格全部交付判决；技术停线后也核对已存产物，然后用 `node scripts/stage2b-headroom-report.mjs <ID>` 读实际观察。缺判不计零、也不计 `N/A`，比较时同时看[同输入裁判波动](stage1-closeout.md#同输入翻转率)和两遍生成后的差异。

## E2 冻结对话复核

E2 的 `no_teach` 裁判复核使用 `--scenario E2 --judge-only <源 run ID> --judge-cell no_teach`。运行器把冻结对话与源裁判请求的消息和绑定核对，即使源裁判未产出分数也可复核。新 run 单列裁判结果，完整 E2 验收仍按场景卡核对。

使用 `--scenario E2 --judge-only <源 run ID> --judge-cell all` 可用当前尺子补评冻结五格。真实模式要求真实源 run。新 manifest 保存源评测身份、源 manifest 哈希和每格对话哈希，结果对照使用本次裁判给出的分档。OpenRouter 结构化裁判的调用原件保存脱敏 `outbound` 请求字段。将 `reasoning.max_tokens` 与遥测的 `reasoningTokens` 核对。超限时记录「路由未执行上限」，用量缺失时记录未知。

## 格级并发和断点续跑

- `E1`、`E2`、`S1-binary` 支持 `--concurrency N`，默认 `1`，可设 `1` 到 `5`。只并发格子，格内依旧串行。`ruler-expand` 保留原来的阶段门槛、停线和串行顺序，不接收这两个选项。
- 中断后确认原进程已退出，再给原命令加 `--resume --id <原 ID>`。保留原模式、场景、输入、预登记文件和两个硬上限。并发可另设。真实续跑仍走费用确认与干净 HEAD 检查。若 HEAD、源码哈希、评测身份或预登记 SHA256 不符，命令拒绝续跑。旧格式的 run 不能补写为新格式。
- 原件校验通过的裁判判决一律保留，包括低分或未过预登记判线的判决。只补没有完成判决的格子。若已提交的原件损坏，先恢复原件；不能重抽一份代替。
- 每次尝试先原子记下一次及该角色的最大请求输出额度，再调用模型。所有进程共用硬上限。中断留下的预留也扣减，因为无法确认请求没送达。续跑不退还这笔额度，也不以供应商实报 token 补预算。
- 收到 HTTP 429 或供应商限流时，本进程并发降一档，最低为 `1`。限流等待后再尝试，占用硬额度，不占两次普通重试。一次调用的初次尝试加两次普通重试仍未成功即停线。停线后不再发新请求或重试；已经发出的调用可以结束，结果和耗费仍落盘。预算不足时也不再发放新预留，已预留的调用照常结算。
- 用 `node src/cli.mjs --verify-run <原 ID> --run-root <原根>` 回读。`processes` 列出各进程、各自补上的格子、降档和停线，`budget` 是累计预留。`result.json` 和评测收据按计划次序输出，不按完成先后排序。`verified` 只表示原件一致，不能代替 `acceptance` 或判线。

## 第二轮 S1 五格复判

`--scenario S1-binary --judge-only e2-real-20261119-06` 用[二元尺子](../contracts/judge/binary.md)复判同一组五格三遍。先在干净 HEAD 运行 `npm run check`。以新的预检 ID 加 `--mode real --estimate-only` 核对源对话及预算。登记实际 run ID、预检上限、判线和构造预期答案，计算预登记文件 SHA256。

按授权额度启动时用 `--mode real --confirm-cost --preregistration <文件> --preregistration-sha256 <摘要> --id <已登记 ID>`，加预检的 `--max-attempts` 和 `--max-requested-output-tokens`。每格目录为 `r1/normal` 等。完成后执行 `node src/cli.mjs --verify-run <ID>`，再运行 `node scripts/s1-binary-report.mjs <ID>` 生成分数、引用和构造矩阵。以报告的逐遍适用分率及目标维方向检查预登记判线。

## 导出离线 HTML 回读报告

在含 `runs/<run-id>/` 的工作目录执行：

```sh
node src/cli.mjs --export-report s1-binary-round2-01
node src/cli.mjs --export-report e2-real-20261119-06 --out e2-review.html
```

默认写到 `runs/<run-id>/report.html`。`--out <path.html>` 可选，父目录须已存在，导出不会覆盖同名文件。用浏览器打开报告，不需要网络。当前支持公开的 S1 二元 v1/v2 和 E1/E2 六维 v3 产物，不读取扩展题集、原始调用或 run 外的收据。

先看判线、验真和用量，再点矩阵里的判定或 `#n` 回读原对话。也可以点列标题中的“查看对话”。没有可验证引用的判定只打开该格观察窗口。红字给出不一致的原件、字段或证据序号；无法安全绑定的引用不会跳到其他消息。

导出不重算分数或用量。验真只读本 run 下已保存的 `verify-run.json`，没有就显示「未验真」。没有判线时不把 `acceptance` 当判线。历史 run 如果没有保存请求总数或用量汇总，报告标明缺项，并列出已有的逐次遥测。

## 扩展题集

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

## ①h 三候选复判

用 `node scripts/judge-bakeoff-preregister.mjs` 将共同的样本、候选参数、硬上限和判线写入 `.tmp/scratch/judge-bakeoff/preregistration.md`。保存脚本输出的 SHA256。在干净 HEAD 上运行 `npm run check`，保留对应收据。

每个候选使用 `--scenario S1-judge-bakeoff --judge-policy haiku|gemini|qwen --concurrency 4`，以及 `--preregistration <文件> --preregistration-sha256 <SHA256>`。先加 `--mode real --estimate-only --id <新的预检 ID>`。取得授权后，用登记的正式 ID 和两个上限，加 `--confirm-cost` 执行。执行完成后用 `--verify-run` 核对每批，再运行 `node scripts/judge-bakeoff-report.mjs --run-root runs --out .tmp/scratch/judge-bakeoff`。

维度按 `call` 1 到 6 定位。判决的 `binding.dimensions` 给出每维原件的 `processIndex` 和 `attemptPath`。停线前已结算的维度在 `_processes/<processIndex>/` 和请求日志中回读。重试的反馈类别、实报用量和拒收细节保存在调用原件。规则见 [e1-binary-v3 契约](../contracts/judge/binary-v3.md)。
