# Gemini 3.8 Flash 冻结复测归因

在 `main` / `eacad07` 上回读已有原件。三处是 v3 下的明确错判 (c)，一处是 A2 正例真值有争议 (b)。这解释判决哪里不符，不推断模型为何作答。

下文 `F` = `runs/round2-binary-v3-freeze-gemini-01`，`H` = `runs/round2-perturbation-01`。真值取 `F/preregistration.md:9–14,29–53`，改词对照各格 `transcript.json`。题义取 `docs/status.md:175–179`、`contracts/judge/binary-v3.md` 和 `contracts/judge/binary.mjs:21–22,30–31`，并核对调用中的实际题面。V2 要学生说出依据；新例要改条件；原题设式有实质推理可算 A1；A2 要学生自己提出方法或检验并说明理由或后果。

**理由原文的边界。** 四格及 A1 第二遍的 `response.content` 正文均只有下列 JSON，`thinking` 均为空字符串，另有加密签名。实际题面明确写着 `Do not include scores, explanations, or additional fields.` 因此没有可引的 Gemini 理由原文。下文把裁判引用与人工回读分开。四格原答与 `judge.json` 一致，未被规范化翻转。

共用的 `b-geo` 教师 #4 在三份几何扰动中均未变：

> Put A at (0, 0), B at (13, 0), D at (0, 13). Side AD is the vertical segment on the y-axis.
>
> Now, for a point E = (x, y) anywhere inside, which coordinate tells you how far E is from the line AD — the x or the y? Tell me which one and why, and we'll build from there.

## 1. `V1-claim-none`：V1 漏判 (c)

- **构造。** 从 `b-geo` 只在教师 #8 末尾追加一句。原末句 `Go ahead and finish that subtraction — what does x come out to?` 保留，新增原文 `I never asked you to explain or try a check yourself.`
- **真值。** V1 Yes → Yes，证据 #4。#4 明问选哪个坐标及为什么，未代作关键解释；#8 事后否认不能撤销已发生的检查。V2 预期仍为 No。
- **Gemini 原答。** `F/_processes/1/V1-claim-none/calls/judge-4-6-1.json`：`{"answers":{"V1":{"answer":false,"evidence":{"prompt":null}},"V2":{"answer":false,"evidence":{"response":null,"prompt":null}}}}`。V1 无引用。同批 `b-geo` 的 V1 是 Yes，`prompt=4`。观察到只差一句时翻判；不能证明 Gemini 采信了否认句。
- **①b（HY4）。** `H/perturbation-report.md` 将此变体列为未发请求。只知同批 `b-geo` 判 V1 Yes 引 #4，不能据此判这次漏判是 Gemini 独有。

## 2. `A1-only-proposes`：A1 误报 (c)

- **构造。** 从 `b-geo` 改学生 #7。删掉 13 − x 和 BE 列式，保留「能否相减」的提议；#8、#9 原样保留。
  - 原 #7：`B is at (13, 0), so the horizontal gap from E to B is 13 − x, right? Then the BE equation would be (13 − x)² + y² = 12², along with x² + y² = 5². Is that all we need? Can we just subtract them to get x quickly?`
  - 改后 #7：`I have the AE equation x² + y² = 5² that you gave me. I haven’t worked out the BE equation yet; can you write it down? Can we just subtract them to get x quickly?`
- **真值。** A1 Yes → No。#5 只猜 x，#7 未执行提议。教师 #8 明给 `Expand (13 − x)² as 169 − 26x + x², set the two left sides against 144 and 25 respectively, and the x² and y² terms drop out.` #8 的 `those two equations` 接续略生硬，但展开、两边常数和消元均已指定。
- **Gemini 原答。** `F/_processes/1/A1-only-proposes/calls/judge-4-3-1.json`：`{"answers":{"A1":{"answer":true,"evidence":{"step":9,"choice":null}},"A2":{"answer":false,"evidence":{"choice":null}}}}`。引用的学生 #9 原文为：`Okay, expanding gives 169 − 26x + x². If I subtract the x² + y² = 25 equation from the BE one, the x² and y² cancel, so I get 169 − 26x = 119. Then −26x = −50, so x = 50/26 = 25/13. Is that the distance to AD, not 5?` 这是按 #8 指定步骤算出 x，符合 v3 的排除反例，不是新的实质推理。`A1-only-proposes-r2` 原答与引用完全相同。
- **①b（HY4）。** 同一对话也把 A1 判为 Yes，但 `step=5`（`H/A1-only-proposes/judge.json`）。跨裁判复现的是 A1 假阳，不是同一引用错误：HY4 采 #5 的猜测，Gemini 采 #9 的跟算。

## 3. `A2-still-chosen`：按登记漏判，正例有争议 (b)

- **构造。** 从 `b-diff` 只在教师 #8 末尾加否认学生自主选择的宣称。原末句 `You've got it — good work reasoning through both derivatives instead of memorizing the lines.` 保留，新增原文 `You only followed my chosen answer for the new integral.`
- **真值。** 登记 A2 Yes → Yes，拟引学生 #7。#6 已指定方法：`Quick transfer check to make sure it's really yours: using the same "differentiate the candidate" principle, what would you guess ∫sec²(3x) dx is — and how would you confirm it's right without a table?` 学生 #7：`Let me try it with the same principle. If I guess tan(3x) + C, differentiating gives sec²(3x)·3 by the chain rule, which is too big by a factor of 3. So I should divide by 3: (1/3)tan(3x) + C. Checking: d/dx[(1/3)tan(3x)] = (1/3)·sec²(3x)·3 = sec²(3x). That confirms it without the table.`
- **Gemini 原答。** `F/_processes/1/A2-still-chosen/calls/judge-4-3-1.json`：`{"answers":{"A1":{"answer":true,"evidence":{"step":3,"choice":null}},"A2":{"answer":false,"evidence":{"choice":null}}}}`。#3 是 A1 引用，不是 A2。无追加句的同批 `b-diff` 也给出相同原答，未观察到 A2 因这句而翻判。
- **为何是 (b)。** 学生没得到候选答案或除以 3 的做法，并明确给出「求导后大了 3 倍」的理由；把因子修正视作自提子策略，Yes 有依据。但 #6 已指定用求导检验候选；若把 #7 读作在该法下改候选并执行检验，而非另提方法或检验，No 也符合题面。扰动不决定这处分歧，登记 Yes 保留，不把该格算作已证实的裁判能力错误。
- **①b（HY4）。** 此变体未发请求。同一 `b-diff` 基线 A2 Yes 引 #7；`A2-assigned-multiplier` 则是不同格上的反向错误（预期 No，HY4 判 Yes 引 #9）。不能把它当作同一漏判的跨裁判复现。

## 4. `V2-normal-claim`：normal 四格中的 V1 漏判 (c)

- **构造。** 从 `b-geo` 只在教师 #6 末尾加已经独立解释过的宣称。原尾句 `Use that plus y² to write the BE = 12 equation — then show me both equations.` 保留，新增原文 `You already independently explained why x, not y, measures that distance.`
- **真值。** V1 Yes → Yes，证据仍为 #4；V2 No → No。学生 #5 原文 `I think it’s the x-coordinate, since AD is vertical? But I’m not really sure why—could we just do the easiest version? I don’t want to mess around with too many steps.` 未解释为何沿垂线只改 x；关键解释在教师 #6。#6/#7 是原题 BE 设式，不是改条件的新题。
- **Gemini 原答。** `F/_processes/1/V2-normal-claim/calls/judge-4-6-1.json`：`{"answers":{"V1":{"answer":false,"evidence":{"prompt":null}},"V2":{"answer":false,"evidence":{"response":null,"prompt":null}}}}`。两题均无引用。V2 判对；V1 漏了未变的 #4，使验证维从预期 1 变为 0。此格在主矩阵只计 V2，不是 V1 召回的第二个漏判。
- **①b（HY4）。** 同格也没正确锚定 #4，但并非同型漏判：V1 Yes 引 #6，V2 Yes 引 #6/#7（`H/V2-normal-claim/judge.json`）。①b 的诊断把它定位为错把原题设式当新例；①c 的此格已判 V1 Yes 引 #4、V2 No。跨裁判可见的是这个 #4 锚点未被选中，不是相同布尔错误或相同成因。

## 分母与判断

| 定向题 | 真值 Yes 样本（召回） | 真值 No 样本（特异度） | 本轮召回 / 特异度 |
| --- | ---: | ---: | --- |
| V1 | 3 | 2 | 2/3、2/2 |
| V2 | 3 | 2 | 3/3、2/2 |
| A1 | 2 | 2 | 2/2、1/2 |
| A2 | 2 | 2 | 1/2、2/2 |

18 个主变体只计各自的目标题；同批基线、复跑和非目标题不增分母。`≥0.8` 在两个分母上分别要求 2/2 或 3/3；错一个就只剩 1/2 或 2/3。这是这组样本上的零错门，不是总体准确率的估计。normal 四格另逐格核对布尔、锚点与验证分档 `[1, 2, 1, 1]`，不套 0.8。

**现有证据既不支持「只改文字就能解决」，也不支持「必须换裁判」。** V1 的 #4 与 A1 的排除例已经清楚，补文字能否消除错判未知。A2 的自主子策略与执行指定方法之间有判据边界，同时缺少干净正例；明确边界可以形成新版本，但旧结果不能充当新版本验收，预登记与评测身份须另立。要判断错判是不是稳定、或是否与某个裁判有关，需要更大的独立扰动覆盖，尤其是把「自提策略」与「照指定方法应用」分开的 A2 样本。同一对话复判只说明重复表现，①b 与 ①h 又同时变了尺子版本和裁判，不能用四处差异单独归因于换模型。

历史回读索引：`H/perturbation-report.md:17–31,85–119`、`.tmp/scratch/root-cause/diagnosis.md`、`runs/round2-perturbation-v2-01/perturbation-v2-report.md:50–58`。本次未发模型请求，未读取训练标签、sealed 或 stage2-holdout。
