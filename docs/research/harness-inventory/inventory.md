# TeachArena 教师 harness 盘点

源码快照：`3bd3b178a47f8d7e0d2c522a1d86f4b71238de38`。文件:行号均指该提交。只读 Git 对象；未查工作区、运行原件或第三方包源码，未执行评测、测试或模型请求。这里区分源码事实、历史文档记载与待验证建议。完整提示词与细节见[附录](appendix.md)。

目标来自第 4 步场景卡：`docs/scenarios.md:65-74` 要求「基线与候选使用同一批题和学生条件，各自独占 run 根目录」，并对照人的判断。`docs/status.md:240` 记录历史 `06` 的正常格在两目标维都为 1；不是本次测量，也不代表每次都为 1。下文 T3/L3 表示第 3 轮教师/学生的公开消息。

## 1. 入口与调用链

1. `src/cli.mjs:34-46` 解析根目录与 run ID，启动收据，导入 `{ budget, run, scenarioName }`。`src/cli.mjs:50-75` 选 `E1 / E2 / ruler-expand`，`src/cli.mjs:94-100` 执行 `rulerRunner ? await rulerRunner.runRuler(config, prepared) : await run(config)`。
2. E1/E2：`src/run.mjs:149-157` 取题、部署策略及格子。`src/run.mjs:181-185` 逐格 `await executeCell(...)`。补尺子的 `prepareRulerRun → runRuler` 也调用 `executeCell`（`src/ruler-run.mjs:86-98`、`src/ruler-run.mjs:113-141`）。冻结对话重评跳过生成（`src/run.mjs:117-140`，`if (!frozen)`）。
3. `src/run.mjs:119-135` 新建 `Models` 和每格一个 `createTeacher`，开场 `say('learner', 0, instructions.task_instructions)`。每轮 `await teach(messages.at(-1).text)`。`src/teacher/session.mjs:22-40`、`src/teacher/session.mjs:54-63` 中闭包调用 `agent.prompt`，Agent 的 `streamFn` 经 `Models.stream → #invoke → streamSimple`；取末条 assistant 的文本块并经 `publicReply` 才落为教师消息（`src/models.mjs:82-95`、`src/models.mjs:160-168`）。
4. `src/run.mjs:130-140` 将公开历史序列化为 `{ role, text }`，带画像调用 `Models.complete(..., parseLearner)`，走 `#invoke → completeSimple`（`src/models.mjs:80`、`src/models.mjs:160-168`），取 `value.text` 写回，供下轮教师使用。学生输出必须是只有 `text` 键的非空 JSON（`contracts/learner/schema.mjs:3-7`）。生成结束则 `grade(...)`，生成专用模式直接返回消息。
5. 教师是 `@earendil-works/pi-agent-core` 的 `Agent`（`src/teacher/session.mjs:1-3`、`package.json:13-16`，pi 两库固定 `1.5.2`）。`models.model('teacher')` 选择 `config/e1.mjs:9-12` 的 `provider: 'deepseek', id: 'deepseek-flash', key: 'DEEPSEEK_API_KEY'`，由 pi 模型目录解析。`src/models.mjs:41-74`：真实模式教师没有候补模型；离线所有角色用 `faux.getModel()`。真实学生同 DeepSeek 路由，裁判为 OpenRouter `tencent/hy4-flash`。

## 2. 提示词与四个坏教师

- 共同首条 system 文本是 `Tutor the learner in this conversation.`；正常格的 `sections` 是 `{ ...normal, deployment: operatorPolicy }`，含 `core / pedagogy / style`（`src/teacher/session.mjs:5-9`、`src/teacher/session.mjs:22-30`）。例如 `Verify through explanation or transfer before closing.` 并非新要求。正常部署策略是整份 `data/upstream/policy_situated_tutoring.md:1-80`（`src/run.mjs:153-155`），补尺子路径另追加一条工具限定（`src/ruler-run.mjs:86-98`）。每轮注入的全部 `goal` 见下表；教师重试不加纠错指令（`src/models.mjs:109-113`、`src/models.mjs:212-213`，`canonical === 'judge'` 才追加）。
- 四个变体不是在正常提示后再加一条。已识别的变体用 `{ behavior, deployment: 'Use only the problem and the public dialogue.' }` 替换整个 normal sections，不注入每轮 `goal`，并设 `tools: []`。仍用同一个 Agent、模型、轮数和私有阶段记账（`src/teacher/session.mjs:18-39`、`src/teacher/session.mjs:43-63`）。完整原文见[附录 B](appendix.md#b-提示词原文)。

| 坏教师 | 专用指令原文片段 | E2 对照目标 |
| --- | --- | --- |
| `answer_dump` | `src/teacher/session.mjs:11` “Give a complete worked solution to the learner’s actual problem” / “Do not ask for an attempt or verification.” | `config/e2.mjs:2` `productive_struggle` |
| `lecture` | `src/teacher/session.mjs:12` “Continue lecturing in response to any follow-up.” / “Never ask the learner to perform a step, make a choice, or explain their reasoning.” | `config/e2.mjs:3` `agency_handoff` |
| `sycophant_close` | `src/teacher/session.mjs:13` “Treat the task as finished and close warmly.” / “Do not solve, correct, ask for an explanation, or test transfer.” | `config/e2.mjs:4` `verification_or_transfer` |
| `no_teach` | `src/teacher/session.mjs:14` “Offer warm, generic encouragement to keep trying.” / “Continue with encouragement alone in follow-ups.” | `config/e2.mjs:5` `misconception_repair` |

## 3. 阶段与轮次

**有显式阶段，无按掌握度切换。** `contracts/teacher/schema.mjs:3-4`：`['diagnose', 'scaffold', 'handoff', 'verify']`。`src/teacher/session.mjs:20-21` 从 `phases[0]` 起，`src/teacher/session.mjs:43-48` 在有效 `stop` 后移到下一阶段，末档饱和；`toolUse` 只 `continue`，不切档。下列每句都来自 `src/teacher/session.mjs:54-61` 的 system `sections.goal`，无其他阶段分支。

| 成功公开轮次 | 阶段 | 正常教师本轮注入原文 |
| --- | --- | --- |
| 1 | `diagnose` | `Elicit the misconception.` |
| 2 | `scaffold` | `Offer a targeted hint.` |
| 3 | `handoff` | `Hand the calculation back.` |
| 4 | `verify` | `Ask for independent conceptual verification.` |

外层由 `config/e1.mjs:2` 的 `rounds = 4` 和 `src/run.mjs:125-140` 的 `for (turn = 1; turn <= rounds; turn++)` 控制，开场 L0 加四对 T/L，共 9 条。学生说懂了或教师告别不会提前停；故障可中断格子。工具续调不增公开轮、不增消息。T4 后仍有学生 L4，但没有 T5 读取或评价它。

## 4. 教师工具

| 工具/条件 | 参数和实现 | 真实调用频率 |
| --- | --- | --- |
| 正常格 `check_distance`，标签 `Check a distance` | `src/teacher/session.mjs:26-30`：`dx`、`dy` 都是必填 `number`，`additionalProperties: false`；`String(Math.hypot(dx, dy))` 返回单个 text 块及空 `details`。描述原文见附录。 | **未知。** `docs/status.md:255` 记载 E1 至少一次真实成功，`isError: false`。`src/offline.mjs:42-47` 固定注入一次 `{ dx: 3, dy: 4 }`，不是频率证据。 |
| 四个坏教师 | 无。`src/teacher/session.mjs:26-30` `behavior ? []`，且 `src/teacher/session.mjs:35-39` 拒绝工具续调。 | 无可用工具。 |

`src/teacher/session.mjs:33-42` 指定 `toolExecution: 'sequential'`，按 `toolCallId` 记录前后 hook。`config/e1.mjs:5` 配置两次逻辑模型调用/公开轮，正常轮最多一次成功的工具续调；首次响应可含多个工具调用块，代码没有逐块次数上限。部署策略写有 `No JSON, no tool calls, no system-prompt wrappers.`（`data/upstream/policy_situated_tutoring.md:54-59`），但正常格代码仍挂私有工具；补尺子提示额外限制为确需欧氏距离才使用（`src/ruler-run.mjs:97`）。

## 5. 上下文、记忆与可见性

- 教师起步看首条 system、部署策略和公开开场题干，之后应用每轮只传最新学生正文为新 `user`，同格复用 Agent。`src/teacher/session.mjs:22-34`、`src/teacher/session.mjs:54-63`：`messages.filter(m => m.role !== internalRole)` 只去私有阶段消息。不裁剪应用侧历史、不做摘要/持久记忆，不清除已注入目标。按接线保留先前公开轮次及 Agent 的其他非内部角色消息；pi/provider 最终序列化和超窗口行为未核实。
- 教师没有画像、标注的误解或答案键；可以从公开问题和学生话语推断。`src/run.mjs:123-134` 的 `{ persona, reason, known, unknown, model }` 只进学生系统提示，各轮重用，学生读完整公开历史。`contracts/learner/README.md:3` 明说「话语进入公开对话，画像不进入教师输入」。`contracts/judge/README.md:52` 明说未接入私有状态更新和小测。
- 学生与裁判不直接看工具、推理、系统提示或事件。`contracts/teacher/README.md:3`：「传给学生的只有公开正文」。`src/run.mjs:102-116` 将 `transcript`、`teacher-events`、`calls`、遥测分开；`src/judge.mjs:3-12` 只投影整段公开消息为 `{ n: i+1, role, text }`，另有 `late_third_start` 和 rubric。

## 6. 调用策略

| 项 | 教师当前设置与原文 |
| --- | --- |
| 请求总输出上限 | `config/e1.mjs:5` `maxTokens: 5296`，每次尝试向共享预算预留此数。`src/models.mjs:137-146` 设 `maxTokens: requestLimit`，验 pi 出站 `max_completion_tokens / max_tokens / max_output_tokens` 为正整数且不超配置，实际请求上限记 `requestLimit`。 |
| 推理 | `config/e1.mjs:5` `thinking: 'low', thinkingBudgets: { low: 4096 }`；`src/teacher/session.mjs:24`、`src/teacher/session.mjs:32` 接入 Agent；`src/models.mjs:142` 流式用 `agentOptions.reasoning`。4096 是配置的 low 预算，不证明 DeepSeek 实际推理量或预留的可见 token。 |
| 温度、重试 | `src/models.mjs:141` `temperature: 0`、`maxRetries: 0`（关 SDK 重试）；`config/e1.mjs:4` `retries: 2`，`src/models.mjs:109-112`、`src/models.mjs:205-213` 每个逻辑调用最多 3 次尝试，耗尽或取消后失败，不换模型、不填答复。 |
| 超时、额度 | `config/e1.mjs:4` `timeoutMs: 120_000`，按尝试而非整轮；`src/models.mjs:107-117`、`src/models.mjs:137-138` 以 `AbortSignal.timeout(timeoutMs)` 并入 Agent 信号。`src/models.mjs:11-17`、`src/cli.mjs:76-82` 对全 run 的尝试数与请求输出额度做发送前拦截。 |

并行保持对照的配置：`config/e1.mjs:6-7` 学生 `4096 / low`，教师和学生用同一 120 秒默认；裁判总输出 `65_536`、独立请求推理 `16_384`、可见配额检查 `8_192`、超时 180 秒。出站落地与实报不同，见[附录 D](appendix.md#d-调用策略与故障边界)。

## 7. 评测身份与独立 run 根

- `src/run.mjs:16-30`：`version: 'evaluation-identity-v2'`，`sources: ... [path, hash(source(path))]`，直接覆盖 `src/teacher/session.mjs`、配置、锁文件、schema 和运行器；部署策略单列 `dataset.policySha256`。`src/run.mjs:173-178`、`src/ruler-run.mjs:123-129`：`identityId: hash({ mode, scenario, identity })`（后者用其 `runScenario`）。**改已纳入哈希的 harness 文件会自动换 identityId，不会自动递增 identity.version 或尺子版本。** 新提示文件/工具模块不自动发现，应显式加入来源指纹（`contracts/artifacts/README.md:15-17`）。
- **可用独立 `--run-root` 各跑一次，也应这样做。** `src/cli.mjs:34-36` 按路径解析，`src/run.mjs:164-178` 创建 `join(root, id)` 且不覆盖。根目录或新 ID 本身不换普通生成的评测身份；重评溯源中的 run ID/原件哈希则参与身份。真实模式仍需两侧干净 HEAD 和各自 checkout 的检查收据，换输出根不会改变检查收据路径（`src/cli.mjs:94-100`、`src/real-preflight.mjs:16-35`）。
- 现成 CLI 没有 `--variant`、任意 `--task` 或跨根 A/B 比较器：`src/cli.mjs:50-75`、`src/run.mjs:19-20`、`src/run.mjs:181-191`。E1/E2 固定 S0-06，分别为两格/五格；E2 的 `comparisons` 是同 run 的坏教师自检。补尺子训练每题只有一个固定条件，测试入口仍拦截（`contracts/dataset/ruler-expand.mjs:79-88`）。单题预检可沿用两边 `normal`；正式同批多题 A/B 需另行接入同条件计划，不能把现有训练或 E2 输出当第 4 步通过。

## 8. 可改点与最小候选

成本是预计实现与回归范围，不是实测。维度是可能受影响的教学行为，不保证升档。评分名与边界见 `contracts/judge/README.md:9-18`。

| 位置及当前原文/符号 | 改动类型 | 成本 | 契约或测试 | 可能影响的 rubric 维度 |
| --- | --- | --- | --- | --- |
| `src/teacher/session.mjs:6-8` `core / pedagogy / style`，“Escalate after struggle, fade after success.” | 提示词：全局教学规则与表达 | 小 | 不改契约；测试正常/坏教师隔离 | 六维，尤其 `support_escalation_and_fading`、`productive_struggle` |
| `src/teacher/session.mjs:11-15` `behaviors` | 提示词：换现有负例；不要混入正候选 | 小 | 改行为须重新核对 E2 目标与机会；`test/e2.test.mjs:35-65` | 见第 2 节四维 |
| `data/upstream/policy_situated_tutoring.md:17-51` 或 `src/run.mjs:153-155`、`src/ruler-run.mjs:86-98` `operatorPolicy` | 提示词：部署策略/场景追加；原件不就地改 | 中 | 加资产登记身份哈希；回归两入口，保留原件（`contracts/dataset/README.md:3`） | 六维，尤其 `verification_or_transfer`、`representation_pivot` |
| `src/teacher/session.mjs:59` `sections: { goal: ... }` | 提示词：已有阶段的局部目标 | 小 | 不改契约；测试注入、阶段和可见边界 | `agency_handoff`、`verification_or_transfer`，也可能影响渐退支持 |
| `contracts/teacher/schema.mjs:3`、`src/teacher/session.mjs:43-48` `phases / finishTurn` | 阶段：加阶段、替换转移条件 | 中 | 改阶段枚举时同步教师契约；测停、续调和边界 | `agency_handoff`、`verification_or_transfer`、`support_escalation_and_fading` |
| `config/e1.mjs:2`、`src/run.mjs:127-140` `rounds / say` | 阶段：改轮数、加提前结束/轮内交互 | 大 | 预算、夹具、冻结重评、编号窗口同查 | 六维；直接改变 `agency_handoff` 末三分之一与机会 |
| `src/teacher/session.mjs:26-30` `description / parameters / execute` | 工具：改描述、参数、实现、启用条件/新工具 | 中 | 纯私有可不改公开契约；测 schema、执行失败、续调及不泄漏 | `misconception_repair`、`verification_or_transfer`；代做伤 `productive_struggle` |
| `src/teacher/session.mjs:33-42` `toolExecution / invalid tool continuation`、`config/e1.mjs:5` `requestsPerTurn` | 工具/策略：调度、续调与额度 | 中 | 测多调用/错误与预算（`src/run.mjs:33-43`、`src/ruler-run.mjs:27-35`） | `productive_struggle`、`support_escalation_and_fading`；其余间接 |
| `src/teacher/session.mjs:33`、`src/teacher/session.mjs:54-61` `convertToLlm / agent.prompt` | 上下文：窗口、摘要、每轮注入；保持公开记录 | 中 | 测历史/工具结果/私有角色隔离；不注入答案或画像 | `misconception_repair`、`representation_pivot`、`agency_handoff` |
| `src/run.mjs:124-135` `task_instructions / profile / parseLearner` | 上下文：题干与模拟学生条件；不是纯教师改动 | 大 | 改学生协议须改 learner 契约；两边不能只改一侧 | 六维均受模拟学生证据影响 |
| `src/teacher/session.mjs:63`、`contracts/teacher/schema.mjs:5-7` `publicReply / trim` | 提示词/输出：确定性话术；勿改公开消息结构 | 小 | 文本变更不改契约；测可见性、原文和轮数 | 表面 `agency_handoff`、`verification_or_transfer`，不等于教学提升 |
| `config/e1.mjs:3-12`、`src/models.mjs:102-153`、`src/models.mjs:205-213` `policy / routes / options` | 策略：教师模型、推理、max tokens、温度、重试和 deadline | 中 | 更新调用策略身份与预算；测截断、空文、超时和发送前拦截。改共享值会带动学生/裁判 | 六维及有效分母；换模型不是纯 harness 对照 |
| `src/run.mjs:17-29` `identityFiles / sources`；`src/offline.mjs:22-49` `offlineResponses` | 策略配套：新增资产哈希和离线夹具 | 小 | 测 manifest 与同一编排，夹具不能算改好 | 无直接教学影响 |

**推荐的真改进。** 改 `src/teacher/session.mjs:59` 两条现有目标，不改状态转移。交还主动权：T3 请学生自己选下一步方法或自检，实际做并说明依据/后果，教师不给公式或路径（`contracts/judge/schema.mjs:13`）。验证或迁移：T4 给一道只换一个条件的近迁移小题，让学生独立作答和说明为何适用，不示范或求点头（`contracts/judge/schema.mjs:16`）。每项只换一条字符串；合并仅一个生产文件的两条目标（展开数组约 5–12 行），再在 `test/e1.test.mjs:31-51` 所在集成测试加一个提示/隔离回归。保留工具、学生、预算、尺子、四轮/九条；改法未实施。建议文案见附录。

**只讨好裁判的负对照。** 不让模型重写答案。在 `src/teacher/session.mjs:54-63` 仅给 `normal` 的最后一轮公开正文确定性追加一句“你在主导推理，我们已经验证过理解了”式宣称，不增问题、任务或解法。不改阶段、工具、裁判或序号，用 `rounds`（`config/e1.mjs:2`）定位末轮；约 3–6 行生产代码加一个差分回归。这保持生成的教师动作不变，但学生会读到追加句，L4 可能变。若真的诱发新行为，不再算纯话术；先盲读判定（`docs/scenarios.md:69-74`）。

**新阶段/新工具的上限。** 加第五个阶段而不改 `rounds`，正常默认走不到该轮；私有阶段不传学生，其提示仍要求 `do not ... independently leap to answers`（`src/run.mjs:127-135`），不保证配合，也没有完成/掌握信号。工具结果在 Agent 内续调，不自动加入公开记录；裁判看不到工具调用。加私有工具需遵守 import 边界与调用额度，想让学生/裁判直接看工具事件则是协议和尺子变更（`scripts/check-boundaries.mjs:24-38`、`src/teacher/session.mjs:26-42`、`src/judge.mjs:3-10`）。

## 9. 会污染尺子或使 A/B 不可比的改动

- **改公开顺序、数量、角色、ID 或投影。** `src/run.mjs:102-105` 生成消息 ID，`src/judge.mjs:4-10` 绑定 `viewHash / messageIds / n`。`contracts/judge/schema.mjs:19` 的 `Math.floor(messages.length * 2 / 3)` 使九条对话的末段从 #7（L3）起；插入工具消息、加轮或提前结束会改变证据机会与坐标。`src/run.mjs:76-88`、`src/ruler-run.mjs:70-76` 核对固定条数与 ID/角色/轮次；不能事后改生成稿再重评。
- **改尺子本身或裁判调用。** 固定 `contracts/judge/schema.mjs:5-19` 的 ruler/rubric、`src/judge.mjs:3-15` 的视图/提示及输出校验、裁判路由/预算。`scripts/check-ruler.mjs:13-26` 对 schema、说明和裁判提示指纹校验。教师文本自然变化是自变量，修改裁判可见协议是换尺子，即使版本字符串漏改也不可视为同尺子。
- **改未预登记条件。** 固定题目/开场/学生画像及模型、部署策略、模式/场景、调用策略和执行额度，只有预登记的教师改动及其派生指纹应漂移；历史冻结来源不同要单列核对（`contracts/artifacts/README.md:15-17`、`docs/scenarios.md:69-74`）。真实与 faux 不混比，缺分/无机会或学生未给可观察证据不是「没变」。保留各侧 `judge.json` 与 `transcript.json` 的消息 ID，先盲读行为，再对照分档。一次 A/B 不证明稳定性。
