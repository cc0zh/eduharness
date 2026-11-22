# 阶段 3 收尾：不采用状态驱动教师

两版 dev 都未过线。保留现有线性教师 B，不采用候选，不申请 `sealed`。按[预登记](preregistration.md)和[附录 01](preregistration-addendum-01.md)止于第二版。本次收尾只回读既有 dev 原件，不重跑、不补盲核、不改判线，也没有读取、列举或哈希 `sealed` 或访问训练标签。`sealed` 原样留给以后。

## 判线结果

每版 24 对，B 为基线，S 为候选，C 为 B 只在教师 #8 加话术的回放。下表为锁定口径，分差按同题、同画像配对计算。[v1 报告](../../../runs/stage3-dev/stage3-dev-v1-real-01/report-v1.md) · [v2 报告](../../../runs/stage3-dev/stage3-dev-v2-real-01/report-v2.md) · [v2 逐格结果](../../../runs/stage3-dev/stage3-dev-v2-real-01/report.json)

| 门 | 要求 | v1 | v2 |
| --- | --- | --- | --- |
| 机判完整性 | 三臂 24/24 对，A、V 全配对 | 72/72 格验真，齐备 | 72/72 格验真，齐备；盲核另判 |
| A 交还主动权 | S−B ≥ +0.25 分 | +0.000，未过 | +0.042（+1/24），未过 |
| C 均差 | C−B ≤ +0.05 分 | +0.000，过 | −0.042（−1/24），过 |
| C 假命中 | 全部 C 阳性经盲核，确认假命中为 0 | 无阳性，程序判过；不证明抗骗 | 确认 0，唯一阳性 F18-A／默认缺判，不可判定 |
| C 有效暴露 | 受约束的画像各 ≥2/8 | 默认 0/8、顽固 2/8、伸手 2/8；默认不足，不可判定 | 顽固 1/8、伸手 1/8，均不足，不可判定；默认 2/8 只报告 |
| 盲核真命中 | ≥90%，必审齐备，不以空集合过线 | 0/0，不可判定 | 16 项仅 2 项合规；14 个目标格需 13 个真命中，仅 1 个确认，另 13 个待定，不可判定 |
| 盲核净真命中 | ≥90%，且配对 B 明确不命中 | 无 A 涨分对，0/0，不可判定 | 2 对需 2 对，0 对已确认；2 对均未核齐，不可判定 |
| P 保留有益试错 | S−B ≥ −0.05 分，B 的适用格不丢失，dev 无 2→0 | +0.000，无额外违规，过 | +0.000，无额外违规，过 |
| V 验证或迁移 | S−B ≥ −0.125 分 | +0.042（+1/24），过 | −0.208（−5/24），未过 |
| 总适用分率 | 共同适用维配对差 ≥ −5.00 个百分点 | +3.785 个百分点，过 | −2.847 个百分点，过 |

v1 的机器 A 未过，v2 的机器 A 和 V 均未过，且 C 暴露和盲核证据不齐。v2 的运行结论保留为 `inconclusive`，不是通过，也不把缺判计为零。M、S、R 无单独采用线。[v1 验真](../../../runs/stage3-dev/stage3-dev-v1-real-01/verify-run.json) · [v2 验真](../../../runs/stage3-dev/stage3-dev-v2-real-01/verify-run.json)

## 五项归因核实

### (a) 不符：#8 不是交权最多的时点

v2 的 18 次实际交权分布属实：#4 两次、#6 九次、#8 七次，分布在 17 段对话；#8 之前有 11 次。收尾任务提出待核的推测「多数在 #8，学生来不及执行」不成立。每次 #8 后仍有学生 #9，F12-B／伸手在 #9 说 “I could check it by adding the two pieces” 并当条算完。不能据此反推何时交权最有效。[逐轮动作及 `observerCallId`](../../../runs/stage3-dev/stage3-dev-v2-real-01/gate-readback.json) · [18 次公开窗口](../../../runs/stage3-dev/stage3-dev-v2-real-01/handoff-windows.json) · [逐条跟进回读](../../../runs/stage3-dev/stage3-dev-v2-real-01/handoff-followup-readback.md)

### (b) 部分属实：v3 少了同链偏好，不能据此解释全部 10 格

[v2 的合判系统提示](../../../src/binary-judge.mjs#L3-L7)写的是 “Prefer evidence of the same chain where possible, then the earliest equally strong chain.” 这是通用择证规则，不是 A1 题面里专写给 A2 的指令。[v3 拆维](../../../contracts/judge/binary-v3.mjs#L27-L37)原样继承 [A1、A2 的题文和引用槽](../../../contracts/judge/binary.mjs#L21-L22)，但 [v3 的 A 维系统提示](../../../src/binary-judge-v3.mjs#L39-L52)只规定 A1 可选的 `choice` 在上条学生消息、A2 的 `choice` 在最后三分之一，没有同链优先。实际 [F12-B／伸手 A 调用](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-B/answer-seeker/calls/judge-4-3-1.json)的 `context.systemPrompt` 也是如此。两版 dev 用的都是 v3，不是 v2 对 v3 的提示消融。

[v3 仍调用 `scoreBinary`](../../../contracts/judge/binary-v3.mjs#L237-L245)。[代码](../../../contracts/judge/binary.mjs#L122-L129)规定：A1=No 得 0；A1=Yes 时，A2=Yes 且 `A2.choice` 等于 `A1.step` 或 `A1.choice` 才得 2，否则得 1。同条内选法和执行时，`A1.choice` 应填 `null`，由 `A1.step` 匹配 A2；下一条学生消息执行时，由上一条的 `A1.choice` 匹配 A2。代码比的是绑定后的序号，不会重新从对话寻找同链。

S 的 12 个 A2=Yes 中有 10 格 A=1。下表逐格回绑 Gemini 的 `judge.json` 和公开原话；A1 的 `choice` 在这 10 格全为 `null`。A 调用原件均为该格的 `calls/judge-4-3-1.json`，`callId` 为 `candidate:<题号>:<画像>:judge:4:3:1`，完整坐标见 `judge.json` 的 `binding.dimensions.agency_handoff`。执行栏是非盲原文回读，不补填盲核结果。

| S 格与公开原话 | A1 `step`（连到判决） | A2 `choice` | 是否在同条执行所提方法 |
| --- | --- | --- | --- |
| [F01-A／顽固](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F01-A/stubborn/transcript.json) | [#5](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F01-A/stubborn/judge.json) “take off 5 cm twice, not once” | #7 “trace the whole outside boundary directly” | 部分。算出 53＋31＝84，但仍分别从周长扣接边，没有按所提办法逐边沿外围相加。 |
| [F01-B／顽固](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F01-B/stubborn/transcript.json) | [#3](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F01-B/stubborn/judge.json) “102 minus 12 = 90?” | #7 “add only the exposed lengths” | 部分。算出 52＋38＝90，但用原周长各扣 6，没有逐边另验。 |
| [F09-B／默认](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F09-B/default/transcript.json) | [#3](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F09-B/default/judge.json) “four extra X pieces and four fewer Y pieces” | #7 “setting X = Y + 5 and putting that back into both loads” | 有。代回两边，求差得 20 g，与实测差相同。教师 #4 指定的是另一反例。盲核理由 584 字符，未获合规盲核。 |
| [F12-A／顽固](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-A/stubborn/transcript.json) | [#3](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-A/stubborn/judge.json) “12 times 0.3 is 3.6 seconds” | #7 “going back to the 3-to-7 piece” | 有。算 `4 × 0.3 = 1.2`，是用同一已知区间反算，独立性有边界。 |
| [F12-B／默认](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-B/default/transcript.json) | [#5](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-B/default/judge.json) “15 × 0.5 s would give 7.5 s” | #9 “use the known 5-to-9 stretch” | 有。反算已知 2 秒，另拆 `1→9→16` 得 `4 + 3.5 = 7.5 s`。 |
| [F12-B／顽固](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-B/stubborn/transcript.json) | [#3](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-B/stubborn/judge.json) “15 × 0.5 = 7.5 s” | #7 “I'd check a small case: events 1 to 3.” | 有。用自选端点数出两间隔，算 `2 × 0.5 = 1 s`。#2 已示范小例，#4 也提议可用小例。 |
| [F12-B／伸手](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-B/answer-seeker/transcript.json) | [#3](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-B/answer-seeker/judge.json) “there are 4 gaps, not 5 events” | #9 “adding the two pieces” | 有。分算 `1→5` 和 `5→9` 后相加，前段为新步骤。合规盲核为 Yes/Yes。 |
| [F18-A／默认](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F18-A/default/transcript.json) | [#3](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F18-A/default/judge.json) “the third value is still 23” | #7 “computing the actual mean-minus-median before and after” | 有。比较 `6 − 2 = 4`；重算两组均值、中位数的做法此前已由教师 #2 提出，不能仅凭此次计算确认原创。 |
| [F18-A／顽固](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F18-A/stubborn/transcript.json) | [#3](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F18-A/stubborn/judge.json) “the mean went up by 4 but the median didn't change” | #9 “recompute the mean for that changed list too” | 有。补算均值 29.2 和有符号差 −1.8，但用的是教师 #6 指定的 `19→40`。 |
| [F18-B／伸手](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F18-B/answer-seeker/transcript.json) | [#3](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F18-B/answer-seeker/judge.json) “the median stays 33” | #9 “recompute both means directly” | 有。直接算两组均值和有符号差，得到变化 −4；沿用教师 #6 指定的 `24→4`。 |

F12-B／伸手和 F09-B／默认都在同一条内提出并完成检验，但 Gemini 的 A1 都落在 #3，分别没有与 A2 的 #9、#7 对齐。能够确认的是：10 格按所引锚点只得 1 分，至少有一个经盲核确认的正例被这一引用选择漏计。现有原件不能证明少了同链提示就是 10 格的共同根因，也不能把有运算的格都改判为独立执行。

### (c) 部分属实：三格 V 从 2 到 0，只有一格在同一轮替换了基线命中追问

V 的净差是 −5/24 分：下列三格各失 2 分，F12-A／伸手 2→1，F09-A／默认 0→2。[v2 逐格结果的 `pairEvidence` 与 `dimensions`](../../../runs/stage3-dev/stage3-dev-v2-real-01/report.json)保存这些配对。B 的命中 #n 来自各格 `judge.json` 的 V1、V2；下列 B、S 的 V 调用均为各自格的 `calls/judge-4-6-1.json`，`callId` 以 `:judge:4:6:1` 结尾。S 三格均为 V1=No、V2=No。对照[题面与分档](../../../contracts/judge/binary.md#评分维度)，笼统请学生自检不自动算独立概念解释或近迁移。

- **F09-B／默认。** [B 原话](../../../runs/stage3-dev/stage3-dev-v2-real-01/baseline/TA2B-F09-B/default/transcript.json)的命中是第 2 轮 #4 “suppose a different tray run showed that swapping 3 Y's for 3 X's added 21 g.”，#5 推得 “x − y = 7 g”。[S 原话](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F09-B/default/transcript.json)的 #4 已是不同反例，问 “if one X really were just 20 g heavier than one Y, what would 4X − 4Y come out to”；#5 答 80 g，与实测不符。S 在 #6 才用固定句 “How would you check your conclusion?”，#8 总结收尾 “Solid reasoning on the factoring and the check. You're set.”。原机判的 B 命中早于固定句，不能称第 3／4 轮固定句挤掉了它。
- **F09-B／伸手。** [B 原话](../../../runs/stage3-dev/stage3-dev-v2-real-01/baseline/TA2B-F09-B/answer-seeker/transcript.json)第 4 轮 #8 “If T1 were 10 g heavier than T2, what would X − Y be?”，#9 给出 “4X − 4Y = 10 and X − Y = 2.5 g.”。[S 原话](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F09-B/answer-seeker/transcript.json)第 3 轮 #6 才是固定交权句；#7 续求抄写步骤。第 4 轮 `correct` 的 #8 回到原题 “Try writing it as three lines: the two weighings, the subtraction with what each side represents, then the division.”，#9 列原题算式。丢失的第 4 轮近迁移没有被固定句直接替换。
- **F18-A／伸手。** [B 原话](../../../runs/stage3-dev/stage3-dev-v2-real-01/baseline/TA2B-F18-A/answer-seeker/transcript.json)第 3 轮 #6 “if the corrected value had been the middle entry (23) rather than the largest, would the median still have stayed put?”，#7 答 “If the new value is still between 19 and 31, the median would be that new value, not 23.”。[S 原话](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F18-A/answer-seeker/transcript.json)同一轮 #6 改成 “How would you check your conclusion? Propose your own check, explain why it would help, and try it.”，#7 重算原题的两组均值。#8 观察器拒收后走 `diagnose`，公开回复实际确认和总结：“One-sentence takeaway: when a change hits only one end of a list, check separately how each center is defined before assuming they move together.”。这里固定句与 B 命中的近迁移占同一轮，但 S 同时改变了前序推进和末轮动作，不是只替换一句的因果对照。

### (d) 属实：22 次回退可分为 16＋5＋1

- **16 次字段拒收。** DeepSeek 观察器返回了顶层 `type`。例如 [F01-A／默认 #4 前](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F01-A/default/calls/teacher_observer-2-1-1.json)带 `"type":"json_object"`；[F01-B／默认 #4 前](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F01-B/default/calls/teacher_observer-2-1-1.json)是 `"type":"blocked"` 且缺 `state`，不是删掉一键就能通过。两类均报 `invalid observation fields or state`。[观察器契约](../../../contracts/teacher/observation.mjs#L16-L25)要求精确字段。
- **5 次待修锚未对齐。** 是当轮 `unresolved_blocker`，不等于永久自锁。[门控](../../../src/teacher/state-machine.mjs#L45-L55)要求每个待修锚都在 `resolvedBlockers` 匹配 #n 且引文有包含关系。F12-A／默认 #6、#8 的 #3 待修锚是 “I’m not fully sure yet why that should be the divisor for the whole duration.”，观察器却回绑 #3 的另一句 “I was counting the event labels 3,4,5,6,7 as five things”。[F18-B／伸手的门控事件](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F18-B/answer-seeker/teacher-events.json)显示 #6 前回退、#8 前匹配两处锚后恢复。余两次在 F01-A／伸手 #8、F09-B／顽固 #6。
- **剩余 1 次是引用角色错绑。** [F18-A／伸手 #8 前原件](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F18-A/answer-seeker/calls/teacher_observer-4-1-1.json)，`callId` 为 `candidate:TA2B-F18-A:answer-seeker:teacher_observer:4:1:1`。`choice` 把 “I could check by computing both means directly” 填成 #6；这句实际在学生 #7，#6 是教师。校验报 `invalid choice learner citation`。

[门控索引](../../../runs/stage3-dev/stage3-dev-v2-real-01/gate-readback.json)的 `conversations[].turns[]` 为全部 22 次保留了格、`teacher` 消息号、`fallback`、`observationDetail` 和 `observerCallId`。待修锚的原提案见对应 `calls/teacher_observer-<轮>-1-1.json`。

### (e) 属实：14 个盲核技术缺判均由 `reason` 超长触发

16 个必审 Haiku 请求均为 HTTP 200。回包中 14 个 `reason` 长 430–673 字符，超出[本地 schema 的 400 字符](../../../src/stage3-audit.mjs#L19-L28)，各报 `agency audit structure mismatch at /reason`。[长度和尝试路径](../../../runs/stage3-dev/stage3-dev-v2-real-01/blind-audit-contract-readback.json) · [保留的 verdict 或 failure](../../../runs/stage3-dev/stage3-dev-v2-real-01/blind-verdicts.json)。最短拒收是 [F18-B／默认 430 字符](../../../runs/stage3-dev/stage3-dev-v2-real-01/audit/4bc7c27a-bec2-4ee0-8e90-88187d842fb0/calls/agency_audit-4-1-1.json)，最长是 [F18-A／顽固 673 字符](../../../runs/stage3-dev/stage3-dev-v2-real-01/audit/0e5db55e-9daf-4cd0-8b12-58d0e49235cf/calls/agency_audit-4-1-1.json)。其余两条合规。这证明拒收原因，不证明供应商为何没遵守长度，也不是 14 个 No 或 14 个语义分歧。

## 实测行为变化

v2 同批从 B 的 **1/24** 到 S 的 **12/24** 个机判 A2=Yes，S 新增 12 格、反向 1 格。v1 的 B 和 S 均是 0/24。A2 增长是机判观测，不等于独立执行净增或 A 达线，也不能用跨版样本证明是哪一项改动奏效。

- **正例 F12-B／伸手。** [候选原话](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-B/answer-seeker/transcript.json) #8 让学生自选检验；#9 “I could check it by adding the two pieces: event 1 to 5 is 4 gaps, and event 5 to 9 is 4 gaps, so 1 to 9 should be 8 gaps total.” 学生拼成两段核对原结果，说明 “That matches my count”，并算出 4 秒。[合规盲核调用](../../../runs/stage3-dev/stage3-dev-v2-real-01/audit/986fb0b2-f2ee-4d9b-a850-67822637fc9f/calls/agency_audit-4-1-1.json)判原创带理由、独立执行均 Yes；机判 A 仍为 1。
- **反例 F09-B／伸手。** [候选原话](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F09-B/answer-seeker/transcript.json) #6 问 “What would you do to resolve the part that is still open?”，#7 回 “Could you just give me the equation steps to write down?”。没有自选方法、理由或实做，机判 A2=No。和 (b) 中自选代回的 F09-B／默认不是同一格。

## 固定交权模板作废，不得复用

[`contracts/teacher/handoff.mjs` 的三句 `handoffRequests`](../../../contracts/teacher/handoff.mjs#L4-L18)属于已否决的实验变体。代码保留作实验记录，仅 [候选 `edition === 2` 且动作是 `handoff`](../../../src/teacher/session.mjs#L25-L32)时触发，默认教师不触发，也不作修改。后续任何项目都不得复用这三句固定模板。今后若另行设计交权，改用贴合题目和学生进度的动态生成，只指出要解决或检验什么，把方法选择留给学生。本轮不实现。

## 下一轮假设（均未验证，本轮不实施）

1. **同链引用提示。** 仅在 A2 合格且确有对应实做时，让 A1 优先引同链。用同条执行、下一条执行和无执行的反例区分引用改善与诱导假阳性。
2. **A 维计分口径。** 研究是否应独立记录「有实质推理」与「末段自选检验并独立实做」。用人工对照判断现行锚点相等是否充分，不把 A2=Yes 直接算 2 分。
3. **交权时保护验证。** 动态交权也可以留下概念说明或近迁移的验证目标，而不指定解法。另测是否保住 V 和学生主动权，不能假设换掉固定句就会恢复 V。
4. **观察器 schema 容错。** 测试在入口收窄处理已知 `type: "json_object"` 冗余字段，仍拒收缺 `state`、错角色和错引文。测它对字段拒收的影响，不把它当作待修锚失配的修复。
5. **盲核理由长度。** 研究明确的短理由约束能否同时保住证据质量与合规率，核对出站 schema、回包和本地校验。若试新上限，须另行预登记；不截短或重判这批原件。

## 原件与盲核抽查归档

两版 dev 原件保留在原阶段 3 工作树 `17ff2cbe` 的 `runs/stage3-dev/`，本工作树同相对路径留有本地副本。[归档 SHA256 清单](../../../runs/stage3-dev/_receipts/closeout-archive.sha256)记录两个工作树逐文件比对一致的 2,546 份原件及收据，条目路径以 `runs/` 为根。`runs/` 不进 Git。匿名包与揭盲索引分别存放：

- [匿名抽查包 `blind-spot-check.md`](../../../runs/stage3-dev/stage3-dev-v2-real-01/blind-spot-check.md)。14 个盲 ID 与公开原话，不含臂别或机判结果。
- [本地揭盲索引 `blind-disagreements-index.json`](../../../runs/stage3-dev/stage3-dev-v2-real-01/blind-disagreements-index.json)。连接盲 ID、格、机判与 `attemptPath`；如另行抽查，先锁复核判断再看索引。此包只供回读，不补本版盲核或判线。
