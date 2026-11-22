# 教师过程与学生学习结果

过程分的外部效标应来自学习者的独立表现。下面区分研究中得到的处理效应、同一研究里观察到的过程行为，以及 TeachArena 仍待验证的分数解释。

## 1. 辅助练习表现可能和无辅助考试反向

**出处。** Hamsa Bastani et al. (2025), *Generative AI without guardrails can harm learning: Evidence from high school mathematics*, PNAS，已读 Table 1 和 Results。[论文全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/#t01)

**具体内容。** 近千名高中数学学生参与随机现场实验。与只用教材的对照比较，辅助练习意向治疗估计为 GPT Base `+0.137`、带教师提示约束的 GPT Tutor `+0.361`（成绩 0–1，对照均值约 0.28），论文报相对 `+48%` 和 `+127%`。撤走工具后的考试中，GPT Base `−0.054`，即比对照低约 17%。GPT Tutor 点估计 `−0.004`，和对照的差异未达统计显著。未显著不提供等效性结论。

**对 TeachArena 的意义。** 学生在教师已经给出等式后求出正确数值属于辅助表现。将「撤掉教师和既有答案后的新题」留作结果测量。冻结对话 #8/#9 已经出现「算对但没验证概念」，仓库也明确没有独立小测（`docs/status.md:110`、`contracts/judge/README.md:46–50`）。

## 2. Kestin 用前后测和随机交叉设计测即时学习

**出处。** Greg Kestin et al. (2025), *AI tutoring outperforms in-class active learning: an RCT introducing a novel research-based design in an authentic educational setting*, Scientific Reports，已读 Methods、Figure 2、Results。[论文全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/)

**具体内容。** 194 名大学物理学习者在两课中经历针对性 AI 辅导和课堂主动学习，条件分配采用随机交叉。两组 pooled 前测中位 2.75，AI 后测中位 4.5，课堂后测 3.5。相对这个公共基线分别是 1.75 和 0.75 分，这不是配对个体增量的中位数。回归控制前测、课内水平等，报告线性模型效应量 0.63，作者用分位回归处理天花板效应后报告 0.73–1.3 个标准差。命题人独立于 AI 与课程设计，试题按教学目标写。

**对 TeachArena 的意义。** 可以借鉴「先写目标、独立命题、记录基线、报原始分与区间」。若预先指定 `post_i = α + β·条件_i + γ·pre_i + …`，β 是已设计实验中的处理差，可把分数差除以预登记的共同 SD 作标准化，分母要明示。四轮模拟轨迹的分差不能套用其效应量。

## 3. Tutor CoPilot 同时测教学动作和课末掌握

**出处。** Rose E. Wang et al. (2024 作者预印本 v1), *Tutor CoPilot: A Human-AI Approach for Scaling Real-Time Expertise*，已读摘要、方法与结果。[论文全文 v1](https://arxiv.org/html/2410.03017v1)

**具体内容。** 对人类导师随机开放实时 AI 建议，意向治疗分析中学生通过当堂 exit ticket 从 62% 到 66%，差 4 个百分点，论文报 `p<0.01`。低评分导师子组约多 9 个百分点。研究另从 55 万多条消息分类教学动作，观察到获得工具的导师更常用引导性问题、更少直接给答案。随机的是工具可用性，动作是观察结果，课末通关也不是延迟保持。

**对 TeachArena 的意义。** 外部案例支持同一研究分别测过程动作和独立结果。若要说某一个过程维度中介了学习增益，需要额外的机制设计或假设，不能把两个处理组差直接相除。TeachArena 要先在同一批轨迹上连接独立结果，再看先验假设是否成立。

## 4. 「六维过程分高就学得更好」目前是待检验假设

**出处。** Tutor CoPilot 的过程与结果节。Graesser & Person (1994), *Question Asking during Tutoring*，已读收录摘要、全文未读原文。TeachArena `contracts/judge/README.md:11–18,46–50`、`docs/status.md:114–134`。[Tutor CoPilot](https://arxiv.org/html/2410.03017v1) · [Graesser & Person](https://eric.ed.gov/?id=EJ482577)

**具体内容。** 检索中可核实到提问质量与成绩的关联、以及随机干预同时改变过程动作和掌握通关率的结果。两类证据都未验证 TeachArena 的 `0–12` 合成分。当前固定四轮、同题，四个坏教师预登记维度差为 2 / 1 / 1 / 2。仓库未接入私有小测或 `learner_change`，过程变量与外部结果目前不能同样本配对。

**对 TeachArena 的意义。** 先检验有方向的假设，例如「给定前测和题目，误解修复更强的对话预测更好的无帮助同构新题解释」。用盲法命题与独立评分，对同一学生不同题的相关性用聚类区间或层级模型处理。先做小样本可行性，确认无照抄与天花板，再预登记样本量。模拟学生后测只支持模拟场景假设。真实学生上的预测与随机干预因果结论分别需要对应数据。关于直接验证本六维与学习增益关系的结果，本次未找到。
