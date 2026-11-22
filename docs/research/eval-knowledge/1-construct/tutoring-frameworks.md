# 辅导评测框架与观察单位

每条区分评测对象、观察单位和标注来源。仓库基线为 `00fecc40f4fbab028327a16b08c4f9facbe35f08`。

## 1. MRBench 的八维是单个纠错回复的属性

**出处。** Maurya et al. (2025), *Unifying AI Tutor Evaluation: An Evaluation Taxonomy for Pedagogical Ability Assessment of LLM-Powered AI Tutors*，已读作者预印本 Table 2、§4.2、§5.1–5.2。[作者全文](https://arxiv.org/html/2412.09416v1#S3.T2) · [NAACL 版本](https://aclanthology.org/2025.naacl-long.57/)

**具体内容。** 八维分别检查：(1) mistake identification，识别学生是否犯错，(2) mistake location，指出真实错误及位置，(3) revealing the answer，是否透露最终答案，正确与否都算，(4) providing guidance，给予正确、相关的解释、提示或例子，(5) actionability，学生下一步是否明确，(6) coherence，回复与学生前文是否逻辑一致，(7) tutor tone，鼓励、中性或冒犯，(8) human-likeness，表达是否自然。给定以错误或困惑结尾的对话前缀，人工标一条候选教师回复。4 名受训标注者按维度用三级标签，先用 8 段试标。共有 192 个上下文和 1,596 条候选回复，132 个上下文来自 MathDial，60 个来自 Bridge。论文 Table 2 的期望标签为多数维 Yes、透露 No、语气 Encouraging。

**对 TeachArena 的意义。** 识别和定位可以独立于学生是否修复来观察，透露也可以独立于学生是否继续有效尝试来观察。用 MRBench 的问题做过程对照时，只转用对应的教师动作语义。TeachArena 的 `misconception_repair=2` 还需要学生独立修正，`productive_struggle=2` 还需要关键卡点后的有效尝试（`contracts/judge/README.md:11–14`）。

## 2. Bridge 给同一错误分别标注诊断、策略和意图

**出处。** Rose Wang, Qingyang Zhang, Carly Robinson, Susanna Loeb & Dorottya Demszky (2024), *Bridging the Novice-Expert Gap via Models of Decision-Making: A Case Study on Remediating Math Mistakes*，已读 §4.2–4.3、§6.1。[作者全文](https://arxiv.org/html/2310.10648#S4) · [NAACL 版本](https://aclanthology.org/2024.naacl-long.120/)

**具体内容。** 700 个真实数学辅导片段，覆盖 120 个课题，保留学生犯错处结束的历史和原教师下一条回复，每条有两份专家方案。专家为下一条回复先写 A 学生错误或理解状态、B 要采取的策略（例如提问、提示、简化、演示）、C 教学意图（例如诊断、解释错误、让学生展开想法），然后写回复。另设盲评，将单条候选与原回复配对，每模型抽 40 对、每对 3 名标注者；比较有用性、关怀、人类自然度和总体偏好。专家决策条件下 GPT-4 的偏好评分相对无决策条件高 76%，这个数字来自回复偏好。

**对 TeachArena 的意义。** 同一句问话可能服务于定位误解或提示下一步。专家审六维边界时可以先写「学生具体错在哪里、教师做了什么、想引出什么证据」，然后对照该维需求。当前误解修复同时依赖教师说明为什么错和学生独立修正。Bridge 提供前两步的内容证据来源（`contracts/judge/README.md:11`）。

## 3. MathDial 的教学动作以教师发言为单位

**出处。** Jakub Macina et al. (2023), *MathDial: A Dialogue Tutoring Dataset with Rich Pedagogical Properties Grounded in Math Reasoning Problems*，已读 Table 1、Table 2、§3。[作者全文](https://arxiv.org/html/2305.14536#S3) · [EMNLP 版本](https://aclanthology.org/2023.findings-emnlp.372/)

**具体内容。** 论文约称 3k 个 1:1 辅导对话，由具教学经验的人类标注者辅导模拟学生。教师在写每次回复前自选教学动作。四类为 Focus（收窄下一步空间，例如引导回忆、要求自纠）、Probing（探索背后的概念，例如改变题设、问相关知识）、Telling（揭示策略或答案）和 Generic（问候等一般交互）。另按对话记录初始错误步骤是否解决，动作标签与修复结果分别保存。论文另把解题成功与透露问题纳入交互评价。

**对 TeachArena 的意义。** 同是问句，Focus 可能把学生导向一个早已指定的步骤，Probing 可能让学生把规则用于新条件。把作者动作标签用于回读的定位说明，能区分「教师问了」和「学生主导了推理」。当前公开证据组提供可复查序号（`contracts/judge/README.md:13,24–27`）。

## 4. BEA 2025 的四种教学标签与第五条识别赛道

**出处。** Ekaterina Kochmar et al. (2025), *Findings of the BEA 2025 Shared Task on Pedagogical Ability Assessment of AI-powered Tutors*，已读 §2–3。[作者全文](https://arxiv.org/html/2507.10579#S2) · [任务官网](https://sig-edu.org/sharedtask/2025)

**具体内容。** 赛道 1 识别错误，2 精确定位错误，3 提供正确、相关的指导，4 给出可执行下一步，5 判断候选回复来源，涉及 7 个 LLM 和专家/新手两类人类来源。给定师生前文及最后的学生错误，单位仍是一条候选回复。组织者沿 Maurya 等指南人工标前四维的 Yes / To some extent / No。开发集 300 个上下文、2,476 条回复，测试集 191 个上下文、1,547 条回复。

**对 TeachArena 的意义。** 识别和定位可以用来发现「教师问了很多但始终没对准错误」的情况。来源分类回答谁写了回复，当前六维无需承担来源判断。BEA 的 3 个回复等级与 TeachArena 的 3 个轨迹等级具有不同含义（`contracts/judge/README.md:9–16`）。

## 5. LearnLM 早期报告用多种观察单位表达教学原则

**出处。** Jurenka et al. (2024，在线版本有后续修订), *Towards Responsible Development of Generative AI for Education: An Evaluation-Driven Approach*，已读 Figure 2、§4.3.1–4.3.2、§5–6 相关段落。[作者全文](https://arxiv.org/html/2407.12687#S4.SS3)

**具体内容。** §4.3.1 的五项原则是鼓励主动学习（讨论、练习和创造），管理认知负荷（多种呈现、组织结构、分块），深化元认知（反思具体思路），维持动机与好奇心，以及根据学习者当前状态与目标调整。参与式与 Wizard-of-Oz 工作把前述原则落实为避免提前揭晓答案、察觉卡住并查证误解等行为。报告的 7 项 benchmark 覆盖学习者自由交互后反馈、教师按单轮或整段打分、教师对同场景的整段配对比较，以及自动行为检查。Table 2 对应自动条目，Table 10 对应整段人工条目，Table 13 对应教师单轮打分。

**对 TeachArena 的意义。** 「鼓励」与「诊断」可以独立存在。`no_teach` 的 #8 鼓励出现在 #7 公开误解之后，仍可判目标维低档。应在文档说明鼓励属于独立内容范围，否则读者容易理解成任何鼓励都无价值（`docs/status.md:134`）。

## 6. LearnLM 后续专家整段评估与受监督真实教学

**出处。** Google DeepMind (2024), *LearnLM: Improving Gemini for Learning*，已读 §3–4。Google DeepMind/Eedi 等 (2025), *AI tutoring can safely and effectively support students: An exploratory RCT in UK classrooms*，已读摘要和结果节。[专家评估报告](https://arxiv.org/html/2412.16429#S3) · [UK 试验](https://arxiv.org/html/2512.23633)

**具体内容。** 前者用 49 个场景让教育专家扮演学习者，另一组专家读完整对话，单段用七点量表评价 29 个问题并对同场景的两段作比较。报告突出主动学习、深化元认知和激发好奇心等项，共 2,360 段对话、10,192 份专家评估。典型比较题是 “Which tutor demonstrated better tutoring?”。后者对 5 所英国学校的 165 名中学生开展探索性 RCT，专家老师监督 LearnLM 消息。访谈的 5 名监督者都提及苏格拉底式追问，部分干预涉及节奏和社会情绪支持。

**对 TeachArena 的意义。** 将「指定教学行为有没有发生」「教育者觉得这段教得如何」「真实学生在哪些条件下学得更好」写成三个证据需求。现有 E2 处理第一个，显式锁定一题与四轮（`config/e1.mjs:1–2`、`docs/status.md:114–134`）。

## 7. TutorEval 的主问题是教材回答质量

**出处。** Alexis Chevalier et al. (2024), *Language Models as Science Tutors*，已读 Figure 1、§3.1–3.2。[作者全文](https://arxiv.org/html/2402.11111#S3)

**具体内容。** 834 个专家编写的 STEM 问题源于 202 章教材。专家写参考要点，给定问题与可选章节后，以每条自由回答为单位，由 GPT-4-Turbo 参考要点分别评 presentation（清楚和表现形式）与 correctness（事实与教材引用是否错误）。论文另设人类专家复评子集。

**对 TeachArena 的意义。** 内容正确性值得单列。一句流畅、可操作的提示仍可能用错定理，影响六维的教学解释。用学科专家或可核验答案核对核心推理的正确性，保留与六维同读的诊断（`contracts/judge/README.md:9–18,24`）。

## 8. 消费级学习模式公开材料的证据边界

**出处。** Anthropic (2025), *Introducing Claude for education* 和 *Anthropic Education Report: How University Students Use Claude*，两份官方原文已读。OpenAI 的当前功能页及教师示例原文已读。OpenAI (2026) *New tools for understanding AI and learning outcomes* 返回 HTTP 403，**未读原文**。[Claude 产品说明](https://www.anthropic.com/news/introducing-claude-for-education) · [Claude 使用研究](https://www.anthropic.com/research/anthropic-education-report-how-university-students-use-claude) · [Study Mode 功能页](https://chatgpt.com/features/study-mode/) · [教师示例](https://openai.com/index/teaching-students-to-think-and-learn-through-questions/) · [OpenAI 结果报告入口](https://openai.com/index/understanding-ai-and-learning-outcomes/)

**具体内容。** Claude 产品材料描述以引导性问题检查理解、鼓励独立思考。使用研究从约 100 万段匿名会话中筛出 574,740 段学业相关对话，自动 Clio 分类用两个轴（直接/协作，解题/创作），得四类会话，每类约 23–29%。其证据是 Claude.ai 学生使用观察，单位为整段会话。Study Mode 功能页举知识检查的两种形式，短测验和开放题。教师示例让学生用过 Study Mode 后脱离聊天，独立写蒸发原理和一道课堂讨论题，由教师识别待复习概念。该示例提供活动设计，产品页未公布评分 rubric，独立结果报告细节待核。

**对 TeachArena 的意义。** 用户提问次数和往返轮数只能描述使用方式。用学生提出的新关系、方法或检查及其后果作为主动权证据，才贴近项目定义（`contracts/judge/README.md:13`）。
