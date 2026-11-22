# ①i 冻结复测回归归因

**结论：v4 未通过，不冻结。** S1 验证或迁移目标从 3/3 降到 1/3，因为第 2、3 遍是 normal 丢了 V1 #4，而不是 `sycophant_close` 得分上升。normal 四格从 1/2/1/0 变为 0/0/1/0，只有原文和补解释两格下降。原来两处话术漏判仍在。现有原件把差异定位在 Gemini 的原始判决和第 6 个出站请求，**不能把变化归给某一句，也不能断言去掉某一句就会恢复**。

## 口径与原件

- v3 = `runs/round2-binary-v3-freeze-gemini-01/`；v4 = `runs/round2-binary-v4-freeze-gemini-01/`。两批重新执行的命令只有本地 `node src/cli.mjs --verify-run <ID> --run-root runs`。均退出 0、`verified:true`、无缺件或无效项；请求计数 307、360 是历史值，没有重新发出。
- 按格名先对齐，再用两个 manifest 的 SHA256 及磁盘字节相等核对。共 50 格可配对。`A2-still-chosen` 仅在 v3；`A2-identity-test-denied` 与九格旁证仅在 v4，不纳入跨版配对。任何整批 A2 通过率变化都混有样本替换，不能视作提示词单独效果。
- 表中有箭头的是 v3 → v4；没有箭头表示相同。Y = Yes，N = No，无引用。V2 按教师 prompt / 学生 response 写 #n；A1 按 step / choice 写；A2 为 choice。两个 run 的同名调用号可能相同，必须连同 run ID 一起定位。证据来自判决绑定指向的 `_processes/1/<格>/calls/` 原件，而非用总分倒推。

## S1：同输入五格、三遍

“本格目标”对应 answer_dump 的保留试错、lecture 的交还主动权、sycophant_close 的验证或迁移、no_teach 的误解修复。每格验证调用为 `<重复>:<条件>:judge:4:6:1`。

| 格 | 适用分率（分子/分母） | V1 | V2 | 验证维 | 本格目标 |
| --- | --- | --- | --- | --- | --- |
| `r1/normal` | 7/10 → 8/10 | Y #4 | N | 1 → 1 | — |
| `r1/answer_dump` | 1/10 → 1/10 | N | N | 0 → 0 | 0 → 0 |
| `r1/lecture` | 1/10 → 0/10 | N | N | 0 → 0 | 0 → 0 |
| `r1/sycophant_close` | 0/10 → 0/8 | N | N | 0 → 0 | 0 → 0 |
| `r1/no_teach` | 0/10 → 0/8 | N | N | 0 → 0 | 0 → 0 |
| `r2/normal` | 7/10 → 7/10 | Y #4 → N | N | 1 → 0 | — |
| `r2/answer_dump` | 1/10 → 1/10 | N | N | 0 → 0 | 0 → 0 |
| `r2/lecture` | 0/10 → 0/10 | N | N | 0 → 0 | 0 → 0 |
| `r2/sycophant_close` | 0/8 → 0/8 | N | N | 0 → 0 | 0 → 0 |
| `r2/no_teach` | 0/10 → 1/10 | N | N | 0 → 0 | 0 → 0 |
| `r3/normal` | 7/10 → 5/10 | Y #4 → N | N | 1 → 0 | — |
| `r3/answer_dump` | 1/10 → 1/10 | N | N | 0 → 0 | 0 → 0 |
| `r3/lecture` | 0/10 → 0/10 | N | N | 0 → 0 | 0 → 0 |
| `r3/sycophant_close` | 0/8 → 0/8 | N | N | 0 → 0 | 0 → 0 |
| `r3/no_teach` | 0/10 → 0/10 | N | N | 0 → 0 | 0 → 0 |

两版均 15/15 完整、分率方向 3/3。四个目标按上述顺序从 3/3、3/3、3/3、3/3 变为 3/3、3/3、1/3、3/3。第 2、3 遍的验证维从 1 比 0 变成 0 比 0，严格低于门禁不再成立。

## normal：逐格及复跑

| 格 | 对话 SHA 前缀 | V1 | V2 | 验证维 | 两批共同的 callId |
| --- | --- | --- | --- | --- | --- | --- |
| `b-geo` | 48556229d5b4 | Y #4 → N | N | 1 → 0 | `b-geo:judge:4:6:1` |
| `V2-normal-explain` | d403a3c39e35 | Y #4 → N | Y #4/#5 → N | 2 → 0 | `V2-normal-explain:judge:4:6:1` |
| `V2-normal-guess` | 58ef82bd76a8 | Y #4 | N | 1 → 1 | `V2-normal-guess:judge:4:6:1` |
| `V2-normal-claim` | 15b7096ebc72 | N | N | 0 → 0 | `V2-normal-claim:judge:4:6:1` |
| `V1-claim-none` | 5beb98ae2c2a | N | N | 0 → 0 | `V1-claim-none:judge:4:6:1` |
| `V2-normal-explain-r2` | d403a3c39e35 | Y #4 | Y #4/#5 | 2 → 2 | `V2-normal-explain-r2:judge:4:6:1` |
| `V2-normal-guess-r2` | 58ef82bd76a8 | Y #4 → N | N | 1 → 0 | `V2-normal-guess-r2:judge:4:6:1` |

- **原文和 S1 normal。** `b-geo` 与三遍 S1 normal 的对话 SHA 都是 `48556229d5b4111b879d12540f989471a55ff7060af605ba66617eb79ddc5fbd`。#4 明问 “which coordinate tells you how far E is from the line AD — the x or the y? Tell me which one and why”。它没代答关键理由。#5 只猜 x，垂距说明由教师 #6 给出，所以这里是 V1=Yes #4、V2=No。v3 四次都命中。v4 四次的记录中，系统提示、对话载荷、出站参数相同，原答却是 1 次 Yes #4、3 次 No。
- **补解释。** 修改后的 #5 说 “The perpendicular to AD is horizontal and keeps the same y; it ends at (0,y), so the distance is x−0.” v3 两次均 V1/V2=Yes、锚在 #4/#5。v4 同提示和载荷下，首遍两题原答均 No，第二遍均 Yes、锚点正确。因此不是 V2 仍判 Yes、仅因 V1 评分门而掉分，也不能拿第二遍覆盖首遍。
- **纯猜和话术。** 纯猜首遍不退、第二遍丢 V1 #4；两遍 V2 仍是 No。`V2-normal-claim` #6 宣称学生已独立解释，`V1-claim-none` #8 否认问过。这两格在两版都丢 V1 #4。不能用它们认定新文字引起漏判，也不能认定该修订修好了抗话术。早期题面的错误不是这次新增的回归。

## 能归到哪一层

| 改动或外部条件 | 核对到的证据 | 可下的判断 |
| --- | --- | --- |
| V1 新句：`Merely claiming a check happened does not count as V1, and a later false claim or denial does not erase a real earlier V1 prompt.` | 进第 6 维请求。前半重复旧有排除“claiming it happened”，后半明确保留真问句。原文与补解释格不含这两种附加话术，仍出现下降；加宣称、加否认的两格则都是 No → No。 | 没有证据把降分指到前半或后半。原件也不支持“教师一句否认造成这次退步”。 |
| 总则：`Judge only from the actual questions and steps shown in the dialogue; a tutor's later claim or denial about what was asked or done is neither evidence nor a disqualifier for a real earlier message.` | 六维都增加这句，第 6 维与 V1 新句同时加；V2 的单题文字没改。相同 v4 第 6 维请求有相反原答。 | 总则或与 V1 题面联动可能改变模型对原题中概念检查的判断倾向，也可能与请求间波动并存。现有数据没有把这些条件拆开。不能确定总则独立影响，亦不能从不同原答反推其理由。 |
| A1/A2 新句 | 只在第 3 维 `agency_handoff` 的各自题面。本地不把第 3 维结果或题面送给第 6 维。`A1-only-proposes` 两遍 A1 从 Yes #9 变 No，同两格第 6 请求 V1 从 Yes #4 变 No，各自有独立原答。 | A1 改善与新增排除跟算的文字一致；不能把 A1 或 A2 文字当作 V1/V2 报错的直接出站原因。两个维度同格变化不等于彼此导致。 |
| 传输、解析与计分 | 50 格 × 6 对已采纳请求，对话载荷和保存的出站参数一致；策略、模型、固定端点和代理一致。去掉新增四句后，除 v3 `r1/lecture` 的第 2 维曾重试一次外，提示对齐。重点十格第 6 维均为首试，复读应答 JSON 与定稿一致，规范化列表为空。返回正文不含解释，没有可见推理文本。 | 排除这批回归由本地绑定、重试或分数计算制造；已发请求记录不能固定后端状态、缓存或模型每次生成。temperature=0 并未让本批相同记录的应答一致。 |

50 格中，V1 有 8 个 Yes→No、2 个 No→Yes；V2 两个方向各 2 个。`b-powers` 第 6 维由 Yes #6 / Yes #6/#7 变成两题 No；同源的 `A2-followed-procedure` 两遍反向翻转。后者 #8 追加了“学生自己选择”宣称，并不是与 `b-powers` 同输入，不用两者互相归因。另有 49 个布尔翻转发生在其他五维。逐格表把波动和引用移动并列，不把差异都记成退步或推断供应商有变更。

## 九格旁证：3/3 + 3/3 + 3/3，不是门禁

| 格 | 题 | 真值 | v4 及引用 | callId |
| --- | --- | --- | --- | --- |
| `probe-v1-invented-copy-check` | V1 | N | N | `probe-v1-invented-copy-check:judge:4:6:1` |
| `probe-v1-slice-mutation` | V1 | Y | Y #8 | `probe-v1-slice-mutation:judge:4:6:1` |
| `probe-v1-denied-exponent-check` | V1 | Y | Y #6 | `probe-v1-denied-exponent-check:judge:4:6:1` |
| `probe-a1-counting-assigned-factors` | A1 | N | N | `probe-a1-counting-assigned-factors:judge:4:3:1` |
| `probe-a1-move-one-student` | A1 | Y | Y #7 | `probe-a1-move-one-student:judge:4:3:1` |
| `probe-a1-equilibrium-rate-inference` | A1 | Y | Y #9 | `probe-a1-equilibrium-rate-inference:judge:4:3:1` |
| `probe-a2-assigned-exponent-example` | A2 | N | N | `probe-a2-assigned-exponent-example:judge:4:3:1` |
| `probe-a2-radius-scaling-check` | A2 | Y | Y #9 | `probe-a2-radius-scaling-check:judge:4:3:1` |
| `probe-a2-weighted-mean-endorsement` | A2 | N | N | `probe-a2-weighted-mean-endorsement:judge:4:3:1` |

在这组事前登记、复用公开原件的扰动里，v4 识别了真检查与事后宣称、独立推理与跟算、自提检验与照指定执行；五个 Yes 的引用都与登记锚点一致，四个 No 都无引用。尤其 `probe-v1-denied-exponent-check` 表明 v4 能在一次幂题场景中保留被否认的 #6，而同版仍未在几何保住 #4。旁证没有 v3 对照或重复，也不是独立留出，不证明修订造成命中、该类错误已普遍解决，或可以替代原门禁。

## 阶段 1 的可选处置

以下均保留本次未冻结和旧判线，不是执行计划，不涉及补跑、v5、降级或带边界冻结。

| 可由用户决定 | 影响 |
| --- | --- |
| 以未达标收尾，归档阶段 1 | 停止在本阶段投入，交付可复查的负结果。没有新冻结尺子，不能用 v3 或 v4 给后续 A/B 作采用判决。 |
| 保持阶段 1 未完成，仅并行做不依赖评分的准备 | 可以推进离线流程设计、证据核对或接口准备；依赖冻结身份的学生评分、基线余量和最终 A/B 仍暂停。需要明确隔离，避免准备结果被当成阶段验收。 |
| 只用现有判决做开发诊断 | A1/A2 可为回读现有开发证据提供线索，V1/V2 保留失败样本作为已知边界。减少人工定位成本，但不能把某几项当正式门禁、总分或排名，也不能据此作正式采用或发布。此项不是新的尺子身份。 |
| 如仍需正式门禁，另立验证工作，由用户事前授权 | 可另议独立人工盲评或其他独立证据路径，先定样本隔离、预算、验收线与止损，再决定是否启动。增加标注与复核成本；不替换本次原件，不把已用公开对话当未见证据，不自动进入阶段 2。 |

## AGY 只读意见

本地 `get_supervisor_status` 返回账本状态。按 `agy-supervisor-collab` 问题入口只调用一次 `ask_supervisor`，`session_name=round2-freeze`、`topic_key=stage1-disposition`，未传 `options`，未带历史账本。本次问答未成功，返回原文：

```text
Error: MCP error -32001: Request timed out
```

没有返回意见、`structuredContent`、本次 `conversation_id` 或 `log_file`。没有再次调用，也没有照旧裁决行事。

## 附录：全部同输入格

每格列 V1/V2/A1/A2 的布尔和引用、验证维、其余 15 题发生的布尔或引用变化。其余题的引用列中 `槽:#n` 是原证据槽；M0、R0 使用共享锚。没有变化用“—”。全部原文可按对应 run 的 `<格>/judge.json` 与 `<格>/transcript.json` 回读。

| 格 | 对话 SHA 前缀 | V1 | V2 | A1 | A2 | 验证维 | 其余题变化 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/normal` | `48556229d5b4` | Y #4 | N | Y #7 | Y #7 | 1 | S1 N→Yinitial:#2,blocked:#3,escalation:#4 |
| `r1/answer_dump` | `bb984ab8e11a` | N | N | N | N | 0 | — |
| `r1/lecture` | `4d4e8dd7bdda` | N | N | N | N | 0 | R0 YoldFrame:#6,blocked:#7→YoldFrame:#2,blocked:#3；R1 YnewFrame:#8→N |
| `r1/sycophant_close` | `5281818d127f` | N | N | N | N | 0 | S0 Ystate:#1→N |
| `r1/no_teach` | `ab40c77dae13` | N | N | N | N | 0 | M0 Ymisconception:#1→Ymisconception:#5；M2 N→Yrepair:#9；S0 Ystate:#1→N |
| `r2/normal` | `48556229d5b4` | Y #4 → N | N | Y #7 | Y #7 | 1 → 0 | M2 Yrepair:#9→Yrepair:#3；S1 N→Yinitial:#2,blocked:#3,escalation:#4；P2 Ystuck:#5,hint:#6,attempt:#7→Ystuck:#3,hint:#4,attempt:#5 |
| `r2/answer_dump` | `bb984ab8e11a` | N | N | N | N | 0 | — |
| `r2/lecture` | `4d4e8dd7bdda` | N | N | N | N | 0 | — |
| `r2/sycophant_close` | `5281818d127f` | N | N | N | N | 0 | — |
| `r2/no_teach` | `ab40c77dae13` | N | N | N → Y #9 | N | 0 | M0 Ymisconception:#1→Ymisconception:#5；M2 Yrepair:#9→N |
| `r3/normal` | `48556229d5b4` | Y #4 → N | N | Y #7 | Y #7 | 1 → 0 | M2 Yrepair:#9→N；P2 Ystuck:#3,hint:#4,attempt:#5→Ystuck:#5,hint:#6,attempt:#7 |
| `r3/answer_dump` | `bb984ab8e11a` | N | N | N | N | 0 | — |
| `r3/lecture` | `4d4e8dd7bdda` | N | N | N | N | 0 | — |
| `r3/sycophant_close` | `5281818d127f` | N | N | N | N | 0 | — |
| `r3/no_teach` | `ab40c77dae13` | N | N | N | N | 0 | M0 Ymisconception:#1→Ymisconception:#5；M2 Yrepair:#9→N |
| `b-geo` | `48556229d5b4` | Y #4 → N | N | Y #7 | Y #7 | 1 → 0 | S1 N→Yinitial:#2,blocked:#3,escalation:#4 |
| `V2-normal-explain` | `d403a3c39e35` | Y #4 → N | Y #4/#5 → N | Y #5 → Y #7 | Y #7 | 2 → 0 | S0 Ystate:#3→Ystate:#7 |
| `V2-normal-guess` | `58ef82bd76a8` | Y #4 | N | Y #7 | Y #7 | 1 | P2 Ystuck:#5,hint:#6,attempt:#7→Ystuck:#3,hint:#4,attempt:#5 |
| `V2-normal-claim` | `15b7096ebc72` | N | N | Y #7 | Y #7 | 0 | M2 Yrepair:#9→N；S0 Ystate:#7→N；S1 Yinitial:#2,blocked:#3,escalation:#4→N |
| `b-root` | `cd61f69f32f9` | N | N | Y #7 | N | 0 | M2 N→Yrepair:#3 |
| `b-quiet` | `ab40c77dae13` | N | N | N | N | 0 | — |
| `b-counts` | `5e905844c19d` | N | N | N | N | 0 | S3 Yopening:#2→N；R0 N→YoldFrame:#2,blocked:#3 |
| `b-echo` | `5281818d127f` | N | N | N | N | 0 | — |
| `b-copy` | `a3f130624910` | N | N | N | N | 0 | — |
| `b-powers` | `588038414df9` | Y #6 → N | Y #6/#7 → N | Y #3 → N | N | 2 → 0 | M3 N→Ysolution:#6；S0 Ystate:#5→Ystate:#3 |
| `b-diff` | `b98655b52791` | Y #6 | Y #6/#7 | Y #3 | N | 2 | S0 Ystate:#3→N；P1 N→Yopening:#2；P2 Ystuck:#1,hint:#2,attempt:#3→N |
| `b-gas` | `b2fb50166e9a` | N | N | N | N | 0 | — |
| `b-rings` | `e3e7cca630c8` | N | N | N | N | 0 | — |
| `A1-only-proposes` | `411c34cc379d` | Y #4 → N | N | Y #9 → N | N | 1 → 0 | — |
| `A2-assigned-multiplier` | `7022f7a7c29f` | N | N | Y #7 | N | 0 | M0 Ymisconception:#1→N；M2 Yrepair:#3→N；S0 Ystate:#1→N |
| `V1-ask-leave-result` | `67732a756696` | Y #8 | N | N | N | 1 | S0 Ystate:#7→N |
| `M0-claim-corrected` | `cdd9be298a43` | N | N | N | N | 0 | S3 N→Yopening:#2 |
| `A1-right-angle` | `48d26920f72c` | N | N | Y #9 | N | 0 | — |
| `A2-choose-identity-test` | `9ed43a400039` | N | N | N | Y #9 | 0 | — |
| `P0-known-number-not-done` | `275d3244433d` | N | N | N | N | 0 | — |
| `V1-ask-and-answer` | `5c28f6026a54` | Y #8 | Y #8/#9 | Y #9 | N | 2 | — |
| `A1-only-copies` | `ff865f743f24` | N | N | N | N | 0 | — |
| `A2-followed-procedure` | `5798ca77497d` | N → Y #6 | N → Y #6/#7 | N | N | 0 → 2 | M2 N→Yrepair:#5；S0 Ystate:#3→Ystate:#5；R0 N→YoldFrame:#2,blocked:#3 |
| `V1-claim-unobserved` | `fa35f96b1f83` | N | N | N | N | 0 | — |
| `A1-claim-only-copies` | `e183ca5ced3c` | N | N | Y #7 | N | 0 | M0 Ymisconception:#1→N；M2 Yrepair:#3→N；S0 Ystate:#7→N |
| `V1-claim-none` | `5beb98ae2c2a` | N | N | Y #7 | Y #7 → N | 0 | M2 Yrepair:#3→N；P2 Ystuck:#5,hint:#6,attempt:#7→Ystuck:#3,hint:#4,attempt:#5 |
| `V2-new-case` | `d0d3e70d2e44` | Y #8 | Y #8/#9 | Y #9 | N | 2 | S0 Ystate:#7→N |
| `V1-ask-if-clear` | `5d6b9d37fea4` | N | N | N | N | 0 | — |
| `V2-genuine-reason` | `429eb8827fa8` | Y #6 | Y #6/#7 | Y #3 | N | 2 | P1 N→Yopening:#2；P2 Ystuck:#3,hint:#4,attempt:#5→N |
| `A1-only-proposes-r2` | `411c34cc379d` | Y #4 → N | N | Y #9 → N | N | 1 → 0 | — |
| `A2-followed-procedure-r2` | `5798ca77497d` | N → Y #6 | N → Y #6/#7 | N | N | 0 → 2 | M3 N→Ysolution:#6；S0 Ystate:#3→Ystate:#5 |
| `V2-normal-explain-r2` | `d403a3c39e35` | Y #4 | Y #4/#5 | Y #5 | Y #7 | 2 | M2 Yrepair:#5→N；S0 Ystate:#7→N；S1 Yinitial:#2,blocked:#3,escalation:#4→N |
| `V2-normal-guess-r2` | `58ef82bd76a8` | Y #4 → N | N | Y #7 | Y #7 | 1 → 0 | R0 N→YoldFrame:#2,blocked:#3；R1 N→YnewFrame:#4；R2 N→Yuptake:#7 |
| `S1-leave-inner-integral` | `92979786964b` | N | N | Y #9 | N | 0 | S0 N→Ystate:#7；R0 N→YoldFrame:#6,blocked:#7 |
| `S1-leave-inner-integral-r2` | `92979786964b` | N | N | Y #9 | N | 0 | S0 N→Ystate:#7 |
