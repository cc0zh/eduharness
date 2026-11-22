# 六维与文献构念对照

**判定规则。** 「相同」表示文献与项目共享核心构念，表内说明四轮窗口和取证阈值的差异。「近似」表示文献观察了组成动作、理论条件或结果代理。「我方缺失」表示当前六维没有独立项或当前生产没有对应结果证据。定义基线在 `contracts/judge/README.md:9–28,46–50`，可执行档位例在 `contracts/judge/schema.mjs:10–17`。

## 六个现有维度

| TeachArena 维度与高档边界 | 相同或近似的出处 | 还缺什么，是否值得补与代价 |
| --- | --- | --- |
| `misconception_repair`。要看到旧推理为什么错和学生独立修正。（`contracts/judge/README.md:11`） | **近似。** MRBench Table 2 的识别与定位仅看下一条教师回复。Bridge §4.2 的错误、策略、意图先于学生后续。Posner 等 1982 的概念改变理论需要替代概念解释，全文未读原文。[MRBench](https://arxiv.org/html/2412.09416v1#S3.T2) · [Bridge](https://arxiv.org/html/2310.10648#S4) · [Posner](https://eric.ed.gov/?id=EJ262227) | **我方缺失。** 独立分开的错误定位和机会状态。先做标签，约 0.5–1 人日。无机会进计分需版本化，中。 |
| `support_escalation_and_fading`。受阻后加帮助，成功后持续撤去。（`contracts/judge/README.md:12`） | **相同（核心）。** van de Pol et al. 2010 的 contingency 与 fading 对应强度调节。综述没有本项目四轮内必须观察双方向的门槛。**近似。** MathDial Focus/Telling 描述单个动作，不要求看整个序列。[Scaffolding](https://link.springer.com/article/10.1007/s10648-010-9127-6) · [MathDial](https://arxiv.org/html/2305.14536#S3) | **我方缺失。** 单列强度与两种机会的诊断。例子先区分「开场强帮以后放手」与「遇阻才升级，随后撤架」，约 0.5–1 人日。 |
| `agency_handoff`。末三分之一由学生主导实质推理或检查。（`contracts/judge/README.md:13,27`） | **相同（核心）。** van de Pol et al. 的 transfer of responsibility。**近似。** Chi & Wylie 2014 的 Constructive 行为看新产出，未定义末段或谁拥有总体方案，全文未读原文。[Scaffolding](https://link.springer.com/article/10.1007/s10648-010-9127-6) · [ICAP](https://eric.ed.gov/?id=EJ1044018) | **我方缺失。** 没有单独的元认知行为画像。优先补一次计算、自己选法、自查后重选三个示例。约 0.5 人日，先保留主动权现有边界。 |
| `productive_struggle`。卡点引导继续尝试，首答揭底为 0。（`contracts/judge/README.md:14`） | **近似。** MRBench revealing / guidance / actionability 是一次回复。Kapur 2008 的 productive failure 比较规定的教学序列并测迁移，全文未读原文。LearnLM 的参与式原则要求避免提前给答案。[MRBench](https://arxiv.org/html/2412.09416v1#S3.T2) · [Kapur](https://eric.ed.gov/?id=EJ800999) · [LearnLM](https://arxiv.org/html/2407.12687) | **我方缺失。** 明确区分建设性尝试、无效拖延和掌握后总结的边界材料。补 3 对例子约 0.5–1 人日。 |
| `representation_pivot`。原讲法受阻，实质换表征且观察到用法。（`contracts/judge/README.md:15,28`） | **近似。** Ainsworth 2006 DeFT 的表征功能与学习任务，未读全文。Bridge 的 worked example 和 simplify 可能改变呈现但不要求表征跨越或学生吸收。[DeFT](https://eric.ed.gov/?id=EJ737858) · [Bridge](https://arxiv.org/html/2310.10648#S4) | **我方缺失。** 无机会与错过机会在分数语义上分离。优先加旁证约 0.5–1 人日。若改生产计分及对照语义，约 2–4 工程人日外加验证。 |
| `verification_or_transfer`。学生独立解释或在改变条件下应用。（`contracts/judge/README.md:16`） | **近似。** MathDial 的 Perturbing the Question 是教师侧动作。Kestin 等的独立后测是结果指标。二者分别对应同段引出与段外测量。[MathDial](https://arxiv.org/html/2305.14536#S3) · [Kestin](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/) | **我方缺失。** 维度内没有把独立解释与改变条件后的应用区分成两个结果标签，也没有隔离小测。先补解释/迁移两个观察标签，约 0.5–1 人日。独立前后测另见下表。 |

## 横向缺失内容的决策

成本均为试点估算，1 人日按约 8 小时，教师评审和真实学生招募另计。这些条目不构成仓库改动计划。

| 分类 | 外部定义与来源 | 是否补，代价及边界 |
| --- | --- | --- |
| **我方缺失：核心内容正确性、切题与可执行** | TutorEval 把正确和表达分开。MRBench 把指导正确/相关、下一步明确、前文一致分开。[TutorEval](https://arxiv.org/html/2402.11111#S3) · [MRBench](https://arxiv.org/html/2412.09416v1#S3.T2) | 优先补正确性诊断。先请学科专家审 6–10 段核心推理，约 1–2 人日；可执行和切题先放内容评审，不马上加入总分。现有请求仅含六维和公开对话（`src/judge.mjs:8–10`）。 |
| **我方缺失：关怀、动机、表达清楚程度** | Bridge §6.1 的 care，MRBench 的 tone，LearnLM 早期对好理解解释和庆祝进展的要求。[Bridge](https://arxiv.org/html/2310.10648) · [MRBench](https://arxiv.org/html/2412.09416v1#S3.T2) · [LearnLM](https://arxiv.org/html/2407.12687) | 先作独立质检，不奖励泛泛鼓励。人工增加约 0.5–1 人日，测真实体验需真实学习者。旧 v6 轨迹与状态曾含情绪/参与，见 `%TEMP%/teacharena/ruler-old-vs-new.md` §2，新版六维见 `contracts/judge/README.md:9–18`。 |
| **我方缺失：人类自然度、教师来源** | MRBench human-likeness 和 BEA 第 5 赛道。[MRBench](https://arxiv.org/html/2412.09416v1#S3.T2) · [BEA](https://arxiv.org/html/2507.10579#S2) | 不建议增加满分项，预期工程投入 0。若解释风格干扰构念，做等语义改写对照，约 0.5 人日。 |
| **我方缺失：独立掌握、迁移与保持** | Kestin 分开前/后测和教学过程。Bastani 区分有辅助练习和撤工具后的考试。[Kestin](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/) · [Bastani](https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/#t01) | 值得补成独立结果。模拟试点约 2–4 人日，含等值题草案、独立判分和防照抄检查。真人小试约 1–2 周筹备与分析，招募和合规审批另计。现状见 `contracts/judge/README.md:46–50`。 |
