# TeachArena 构念效度调研摘要

当前尺子描述同一题、四轮模拟对话中可以引用原文的教学行为与学生响应。`e2-real-20261119-06` 在四个预登记目标上分别产生 2/1/1/2 档分差。表征与支持增减没有各自的定向坏教师对照，六维合成分的外部学习效标待建。基线 `00fecc4`。项目证据见 `config/e1.mjs:1–2`、`contracts/judge/README.md:9–18,30–50`、`docs/status.md:114–134`。

## 缺口、借鉴做法与实现代价

估算只用于排序。1 人日约 8 小时，真人招募和审批另计。

| 缺口 | 可借鉴做法与交付点 | 出处 | 实现代价 |
| --- | --- | --- | --- |
| 「无机会」「错过机会」「证据不足」存在混淆。 | 为六维写机会判据，给现有轨迹旁标三种状态。各策划一组「有实际误解却未处理」「学生早已懂，无需纠错」的对比。 | `contracts/judge/README.md:24–28,41–44`。NCES 2-6-2A 内容与反应过程。[NCES](https://nces.ed.gov/statprog/2002/std2_6.asp) | 低，0.5–1 人日先做人工诊断。进生产分档约 2–4 工程人日，再补验证。 |
| 六维定义有文献对应，缺独立的内容覆盖审查。 | 先写 6 维 × 3 档锚点与无机会样例，让 2 名学科教师与 1 名教学法研究者审相关性、覆盖和相邻档。 | MRBench §4.2 的 4 人、8 段试标。NCES 2-6-1A 专家评审与记录。[MRBench](https://arxiv.org/html/2412.09416v1#S4.SS2) · [NCES](https://nces.ed.gov/statprog/2002/std2_6.asp) | 低至中，整理 1–2 人日，专家每人约 60–90 分钟。 |
| 已有坏教师会改变多项动作，区分效度尚缺窄扰动。 | 做 4 对对照，只改提前揭底、学生是否自己选法、是否换表征、语言是否热情之一，记录目标分和旁支分的预期。 | `docs/status.md:104–110,130–134`。Campbell & Fiske 1959 原始 PDF 未读原文，思路见 [MTMM](construct-validity.md) §3。 | 低，约 1–2 人日；完整跨方法矩阵待有多题与样本。 |
| 可能漏掉学科错误、可执行性与关怀。 | 由数学教师先在 6–10 段中核对可验证的核心结论。关怀和可执行性先独立记录，作为过程维度解释的补充。 | TutorEval §3.2 分评正确性与表达。Bridge §6.1 单列 care。MRBench Table 2 指导与可执行。[TutorEval](https://arxiv.org/html/2402.11111#S3.SS2) · [Bridge](https://arxiv.org/html/2310.10648) · [MRBench](https://arxiv.org/html/2412.09416v1#S3.T2) | 低，1–2 人日人工诊断。课程扩大后取决于学科审查。 |
| `verification_or_transfer` 的高档允许独立解释和迁移两条路径，二者仍属于段内。 | 暂用独立解释/改变条件后应用两个旁注。另做隔离的无帮助前测、同构新题后测，结果单列。 | `contracts/judge/README.md:16,46–50`。Bastani Table 1 的练习/考核分离，Kestin Methods 的独立命题。[Bastani](https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/#t01) · [Kestin](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/) | 中，模拟试点约 2–4 人日。人类试验约 1–2 周筹备与分析。 |
| 同一课堂条件下的过程分与学习增益没有成对数据。 | 预登记「修复得分与无辅助新题解释同方向」，控制前测和题目并报告区间。将关联与干预因果分析分开。 | Tutor CoPilot §4 的 4 百分点处理效应和单列教学动作分析。[Tutor CoPilot](https://arxiv.org/html/2410.03017v1) | 中至高。复用前后测，新增约 1–2 人日分析与盲化；样本量由试点确定。 |
| 旧 v6 的 35/16/24/25 总分与现有六维覆盖不同。 | 用独立内容诊断和结果列保留新增证据。先审哪些行为值得计入合成分，以及相互补偿是否合理。 | `%TEMP%/teacharena/ruler-old-vs-new.md` §2；`contracts/judge/README.md:18,46–50`；NCES 2-6-2 要求合成分另有解释证据。[NCES](https://nces.ed.gov/statprog/2002/std2_6.asp) | 低，约 0.5 人日出覆盖对照。合成定义变更另需验证。 |

## 依次优先做三件事

1. 先给六维补机会判据与 18 个档位锚点，由学科教师和教学法专家审查。重点从表征转换、误解修复和冻结的 0 对 0 验证案例开始（`contracts/judge/README.md:15,28,43–44`、`docs/status.md:104–110`）。
2. 做四组只改变一个行为的对照，并人工核对核心数学推理。补上支持增减、表征转换的定向证据，记录目标及相邻维是否改变（`contracts/judge/README.md:11–16,30–39`）。
3. 单列一次无 AI 的前后测/迁移试点，先预登记一条过程分与结果关联，再评估是否值得做真人研究（`contracts/judge/README.md:46–50`）。

## 阅读入口

框架和标注方法见 [tutoring-frameworks.md](tutoring-frameworks.md)，构念的操作化见 [learning-science.md](learning-science.md)，真人结果与效标见 [learning-outcomes.md](learning-outcomes.md)，有效性证据见 [construct-validity.md](construct-validity.md)，逐维对应和缺失项见 [dimension-map.md](dimension-map.md)，面试原问题及证据边界见 [interview.md](interview.md)。
