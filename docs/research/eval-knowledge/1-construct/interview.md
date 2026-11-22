# 面试题｜好教学与构念效度

公开面试备考题、公开访谈原话和论文原问题各自注明。项目追问为按原题改编的练习题。本次没有题频数据，以下顺序按 TeachArena 被问到时的重要性排列。

## 1. 你怎么知道指标量到了你想量的东西？

**出处。** Maurya et al. (2025) §4.2 直接问：“Are the proposed dimensions sufficient, and is there redundancy among them?” NCES 2-6-2A 要求内容、反应过程、内部结构或效标证据。该中文题是对应的项目追问。[论文原问题](https://arxiv.org/html/2412.09416v1#S4.SS2) · [NCES](https://nces.ed.gov/statprog/2002/std2_6.asp)

**具体内容。** 面试官可要求说出构念边界、一条反证和最薄弱的推论。分别回答六维是否覆盖四轮辅导中的目标行为，档位是否对准行为，以及指标能否解释外部学习。

**对 TeachArena 的意义。** 可答：我把好教学限定为公开轨迹里能回读的诊断、支持增减、交还主动权、有益试错、表征转换及理解检查。六维分别给 0/1/2 档。E2 四个预登记目标差为 2/1/1/2，是同题定向证据（`contracts/judge/README.md:3,9–18,30–39`、`docs/status.md:116,124–134`）。缺口是专家内容审查、无机会对照、两个未定向维度的反例，以及与独立结果的关系。

## 2. 如何定义一个 AI 功能的成功指标？

**出处。** *AI Product Manager Interview Questions (With Answers)*，公开备考题库 Metrics 第 2 题已读原文：“How would you measure the success of an enterprise AI search tool?” 改问 AI 教师；无公司出题频率证据。[备考题原文](https://theaiproductmanagerblueprint.com/blog/ai-product-manager-interview-questions/)

**具体内容。** 题库原例以成功解决知识查询为目标，分开查询量、用户接受、未来重复问同一问题和无事实支撑等信号。转到辅导时，要分开教师动作、当堂可见学生表现和段外结果。

**对 TeachArena 的意义。** 可答：当前看六维轨迹，用 0–12 作同条件合成摘要，单维和消息证据负责诊断；当堂学生独立解释最多是该段行为证据。若成功定义为学习增益，增加无帮助前后测，设改题不改知识点，并固定判分（`README.md:3–5`、`contracts/judge/README.md:16–18,24–27,46–50`）。缺口是项目尚无学习结果。

## 3. 你如何衡量 AI 家教真的有效？

**出处。** Prakash Narayanan 对 DataCamp 的 Jonathan Cornelissen，*AI:AM LIVE*, 2026-08-18，1:22:19，原话：“How do you measure the effectiveness, though?” 已读公开访谈转录。Kestin et al. (2025) Methods 已读。[访谈原话](https://www.youtube.com/watch?v=3pARXYcWZ28&t=4939s) · [访谈转录](https://www.ai-in-the-am.com/episodes/2026-08-18-agent-governance-and-ai-skills/) · [Kestin](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/)

**具体内容。** 访谈提出用已接受的测验和每小时学习表现评估。Kestin 将 194 名学生置于两课随机交叉条件。共同前测中位 2.75，AI 后测 4.5，课堂后测 3.5。命题与教学设计分开。

**对 TeachArena 的意义。** 可答：E2 的正常格有 10/12，但只算模拟轨迹。一条解释完 x 再让学生算 x 的冻结轨迹，验证维为 0。要回答真人有效，先锁学习目标并让独立命题者设置前测和无 AI 后测，报告组间差和不确定性（`docs/status.md:104,110,130`、`contracts/judge/README.md:48–50`）。缺口是无人类学习数据、没有隔离的项目结果测量。

## 4. 两段对话总分相同，你怎样判断哪段教得更好？

**出处。** Google DeepMind (2024), *LearnLM: Improving Gemini for Learning* §4 公开专家评估原题：“Which tutor demonstrated better tutoring?” 已读原文。附问为 TeachArena 项目改编。[原题位置](https://arxiv.org/html/2412.16429#S4)

**具体内容。** LearnLM 尽量比较同一场景由同一人扮演时得到的两段对话。专家单段按七点量表评 29 个问题，并另作配对偏好。项目追问可设两段同为 8/12：一段误解修复更强，另一段主动权更强。

**对 TeachArena 的意义。** 可答：同样的合成分允许各维互相抵消。先按预登记目标看对应维与消息，核对有没有机会，以及相邻维度是否变化。S0-06 的 E2 四项门槛是目标维至少低一档，读取同一 run 并逐项看证据（`contracts/judge/README.md:18,24–28,32–39`）。缺口是等权对更广用途的理由，以及同分画像的专家偏好验证。

## 5. 如果辅助表现更好，独立表现却变差，怎么解释？

**出处。** 同一公开题库 Metrics 第 5 题原文：“Answer acceptance went up but retention went down. How do you interpret that?” 项目改编为辅助/独立表现。Bastani et al. (2025) Table 1 已读。[备考题原文](https://theaiproductmanagerblueprint.com/blog/ai-product-manager-interview-questions/) · [Bastani Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/#t01)

**具体内容。** GPT Base 辅助练习约高 48%，无辅助考试低 17%。当堂得到教师答案后顺利完成与撤掉工具后能独立做题是两个不同结果。练习中的借助程度可能解释方向不同。

**对 TeachArena 的意义。** 可答：冷测用新的任务材料，避免把对话原句和直接透露的答案传给测验；独立解释、迁移、保持各自记证据。旧学生变化是模拟状态量，且 `no_teach` 曾观察到学生自行进步。新版只保留公开回复（`contracts/judge/README.md:14–18,46–50`）。缺口是单独的测量与归因设计。

## 6. Rubric 是全面还是有重复？给一个会打破你的预期的例子。

**出处。** Maurya et al. (2025) §4.2 同第 1 题原问题。本题是工程追问。参考 NCES 2-6-2A 的内部结构与效标来源，和 van de Pol et al. (2010) Three Key Characteristics。[MRBench](https://arxiv.org/html/2412.09416v1#S4.SS2) · [NCES](https://nces.ed.gov/statprog/2002/std2_6.asp) · [Scaffolding](https://link.springer.com/article/10.1007/s10648-010-9127-6)

**具体内容。** 教师撤去提示是教师侧的强度变化，学生选择一个新检验是学生侧掌控。固定教师帮助强度，只替换末段的学生复述为学生自选检验，应主要影响主动权。若两项同步上升，检查是否把同个信号当两个构念。

**对 TeachArena 的意义。** 可答：`support_escalation_and_fading` 的 2 需要两方向，`agency_handoff` 的 2 要末三分之一实质主导。冻结数据的首答揭底格在表征仍得 2，另有定义禁止把首次完整解后的重讲当转换，说明需要解释文本是否满足相邻维度门槛（`contracts/judge/README.md:12–15,27,44`、`docs/status.md:104–107`）。缺口是控制单一因素的反事实和独立专家标签。
