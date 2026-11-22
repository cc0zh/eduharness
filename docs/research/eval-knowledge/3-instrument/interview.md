# 面试练习：如何设计教学 Agent 的裁判

本页保留题源的措辞，并标出题源类型。用户给出的原题和公开练习题可用于模拟面试。由文档和论文推导的复盘追问另行标注。没有公司出题频率的证据。

## 1. 「LLM 裁判有哪些偏差，你怎么处理」

**出处** 本次调研委托中的面试示例原题。TechInterview 公开题库原题为 “What are the common biases present in LLM-as-a-Judge evaluations, and how do you mitigate them architecturally?” 技术数据见 [裁判方法](judge-design.md)。[公开题库](https://www.techinterview.net/questions/llm-evaluation-observability-interview-questions)

**具体内容** 回答时区分三种现象。候选次序可能影响 pairwise，长答可能因篇幅得到偏好，裁判可能偏爱自身或同家族的输出。分别说明本项目已经实现的约束和还待验证的缓解办法。

**对 TeachArena 的意义** 「当前每次独立评一份对话，没有同题 A/B 候选的首位优势。对话时序本身是证据，不能交换师生轮。我们用分档锚点和消息引用，让长篇讲授是否真的交还主动权可以回读。`agency_handoff` 的高档明确要求学生末段实质推理。项目尚无长度和同源偏差的专项检查。若加 pairwise 诊断，我会保留各自时序，只交换两份整段轨迹的摆放顺序。」`src/judge.mjs:7–15`、`contracts/judge/schema.mjs:13,19,155`。**缺口** 需要冻结的等义长短教师回答及按裁判来源交叉评分的设计，才能量化这两种偏差。

## 2. 「为什么用 0/1/2 而不是 1–10」

**出处** 本次调研委托中的面试示例原题。Hamel Husain 与 Shreya Shankar 的公开 FAQ 原题为 “Why do you recommend binary (pass/fail) evaluations instead of 1-5 ratings (Likert scales)?” 两题在问不同尺度选择。仓库契约 `contracts/judge/README.md:9–20`、`contracts/judge/schema.mjs:10–19,34–42`。[公开 FAQ](https://hamel.dev/blog/posts/evals-faq/)

**具体内容** `agency_handoff` 的 0 档对应复述或只表达困惑，1 档对应教师主导时学生独立完成有限推理步骤，2 档对应学生在末三分之一主导实质推理或检验。六项等权合计 0–12。任一维 `null` 的响应不发布分数，不能当成 0。

**对 TeachArena 的意义** 「这三个档各有可观察边界，可以给面试官举复述、在既定方法下列新关系、自己选方法并说明理由三个例子。1–10 会要求额外定义 7 个有用边界，当前契约只区分这三类行为。」这里的设计解释可由锚点推导。**缺口** 查到的提交只记录实现沿革，未找到当初比较三档与十档的决定或实验。要宣称三档更好，需补两个尺度的边界实例和专项对照。`src/judge.mjs:11–20`、`contracts/artifacts/schema.mjs:6–12`、`docs/status.md:59–66`。

## 3. 「裁判引了 #7，你如何知道它引对了？」

**出处** 依据仓库实现自拟的面试追问。`src/judge.mjs:3–15`、`contracts/judge/schema.mjs:46–87,118–191`。邻近问题见 ALCE 的 citation recall 和 precision。[论文 §3](https://arxiv.org/html/2305.14627)

**具体内容** 短编号能绑定到冻结消息。以 9 条对话为例，`#7` 是第 7 条可见消息，位置是 `6`。本地还核对观察槽角色、组内时序、组间跨度和 2 分的支持链。解释引用和评分组分开验证。

**对 TeachArena 的意义** 「第一步查视图散列和序号映射。第二步回到原文，查这句是否真支持结论。还发现一个工程缺口，`reason` 的 `#7` 可以在该维自报的 `evidence` 内，却不在评分组证据里，随后自报列表会被删除。」**缺口** 补一条理由证据与组证据错配的回归，同时覆盖无机会 `representation_pivot` 和首答揭底。`contracts/judge/schema.mjs:75–87,159–191`、`contracts/judge/README.md:24–28`。

## 4. 「逐轮为什么砍掉，丢掉了什么？」

**出处** 依据新旧实现自拟的面试追问。`contracts/judge/README.md:18,22–28`、`src/run.mjs:141–158`。旧版依据 [`ruler-old-vs-new.md`](../../ruler-old-vs-new.md)，笔记引用的旧源码本次「未读原文」。

**具体内容** 旧逐轮一次看最多 8 条非空消息且不见下一条学生回应，新版等 4 轮结束才将完整对话发给裁判。后者可以看跨轮支持和学生吸收，前者的每轮独立结果可直接定位局部问题。

**对 TeachArena 的意义** 「新版只发布整段原始分。如果要定位首次揭底，我会按规则选出首个实质教师轮，保存前缀，另标下一条学生回应，看完再诊断。」**缺口** 当前没有关键轮诊断字段或恢复旧版的决定。要补预先固定的选轮条件、观察窗口和绑定。`src/judge.mjs:7–20`、`contracts/judge/schema.mjs:13–16,110`。

## 5. 「strict JSON schema 开了，为什么仍打不出分？」

**出处** 依据历史故障自拟的面试追问。`docs/status.md:63–94`、`src/judge.mjs:11–15`、`contracts/judge/schema.mjs:71–87`。[OpenRouter 官方指南](https://openrouter.ai/docs/guides/features/structured-outputs)

**具体内容** 旧 v3 冻结补评已有 HTTP 200、正常停止和 JSON，三份六维理由都只有数字，例如 `"1"`。数字字串仍可满足字符串类型，却没有可用解释。现行本地校验要求至少 12 字符、含字母、并引 `#N`。

**对 TeachArena 的意义** 「结构化请求、完整正文、合法分档、证据够不够是四道关。流失败、超时或契约拒绝会进入有限重试。耗尽时留故障原件，不拿 0 分装成教学差。」`contracts/judge/README.md:18–27`、`docs/status.md:68–74,138–149`。**缺口** 需要另验证正确引用是否真支持理由和档位，结构通过无法回答这个问题。

## 6. 「推理预算写了 16,384，怎么还能超？」

**出处** 依据历史遥测自拟的面试追问。`config/e1.mjs:3–13`、`docs/status.md:136–149`。[OpenRouter 推理 token 文档](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)

**具体内容** E2 六次请求都记录 `reasoning.max_tokens=16384` 和总输出 `65536`。五次有推理用量，其中最高 21,258，超 4,874。一次流失败无上报用量。该路由没有把字段按请求值执行为硬上限。

**对 TeachArena 的意义** 「我用出站与实报各自证明有没有发、有没有执行。成本用真实用量及未知项说明，不能拿配置替代账单。选择明确支持参数并验证过的路由，再把推理档纳入身份。」**缺口** 缺稳定执行上限的端点验证以及同一轨迹不同档位的成本和合法输出记录。`src/run.mjs:111–116`、`docs/status.md:138–149`。

## 7. “What is LLM-as-a-Judge in AI Evaluation?”

**出处** TechInterview 公开面试练习，页面 FAQ 原题。[公开题库](https://www.techinterview.net/questions/llm-evaluation-observability-interview-questions)

**具体内容** 用 LLM 依据显式标准评另一模型的输出。TeachArena 的输入是公开师生对话和六维 rubric，输出有原始档、带序号的理由与评分证据组，发布前在本地做类型、时序和绑定校验。

**对 TeachArena 的意义** 「例如 2 分的误解修复需要学生先暴露误解，教师解释原推理为什么不成立，学生随后独立修复。程序检查支持链的槽、角色、顺序和引用。误解是否真的修复需要回读。」`src/judge.mjs:3–20`、`contracts/judge/schema.mjs:11,145–184`。**缺口** 当前没有独立的确定性正确性分。若被追问可核验数学行为，需补按题核对的答案键、等价结果条件及零模型诊断，参见 [混合指标](hybrid-metrics.md)。
