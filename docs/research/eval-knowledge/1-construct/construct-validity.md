# 构念效度的证据链

## 1. 先限定分数解释，再问缺什么证据

**出处。** U.S. NCES, *Statistical Standard 2-6: Educational Testing*，已读 2-6-1、2-6-2 及指南。Michael Kane (2013), *Validating the Interpretations and Uses of Test Scores*，已读作者机构摘要，全文未读原文。[NCES](https://nces.ed.gov/statprog/2002/std2_6.asp) · [ETS](https://www.ets.org/research/policy_research_reports/publications/article/2013/jpdc.html)

**具体内容。** NCES 2-6-2 将原始分、子分、分差、合成分和画像都纳入证据要求。2-6-2A 列内容、反应过程、内部结构和与效标关系。Kane 把解释与用途写成可检验的推论与假设。同一种分数的用途越广，所需推论越多。

**对 TeachArena 的意义。** 可支持的表述是「在固定 S0-06、四轮和模拟学生条件下，六维描述公开轨迹中可回读的教学与学生响应」。把论证拆为三个待证命题：原文支持该档位；观察到的样本覆盖六维所要求的机会；更宽的用途有独立外部证据。前两步可补内容有效性，真实学习和跨题推广当前需要新增证据（`README.md:3–5`、`config/e1.mjs:1–2`、`contracts/judge/README.md:3,24–28,50`）。

## 2. 专家先评构念覆盖和相邻档边界

**出处。** NCES 2-6-1A/B、2-6-2C。Maurya et al. (2025), *Unifying AI Tutor Evaluation*，已读 §4.2。Google DeepMind (2024), *LearnLM: Improving Gemini for Learning*，已读 §3.1。[NCES](https://nces.ed.gov/statprog/2002/std2_6.asp) · [MRBench](https://arxiv.org/html/2412.09416v1#S4.SS2) · [LearnLM](https://arxiv.org/html/2412.16429#S3.SS1)

**具体内容。** NCES 要求专家审查领域定义和工具规格，记录专家资格、流程、结果，并在试点和实地试验前后复审条目。MRBench 的 4 名标注者先用 8 段做定义试标。LearnLM 场景评审检查清晰、完整、正确、与原则和用例相关。

**对 TeachArena 的意义。** 建议请 2 名学科教师和 1 名教学法研究者先独立审查。对 6 维 × 3 档做 18 个正/反例锚点，再加无机会样例。逐项回答「测了目标行为吗」「漏了哪类好教学」「什么变化会误升一档」。输出行为定义、边界争议及修订理由。人数和例数是试点工作量，专家共识属于内容证据，不能代替预测增益。

## 3. 聚合前先做收敛与区分假设

**出处。** Donald T. Campbell & Donald W. Fiske (1959), *Convergent and Discriminant Validation by the Multitrait-Multimethod Matrix*, Psychological Bulletin 56(2), 81–105。原始 PDF 取文失败，**未读原文**，方法线索按 pp. 82–83。已读 NCES 2-6-2A。[原始 PDF](https://users.cla.umn.edu/~nwaller/prelim/campbelfiskemtmm.pdf) · [NCES](https://nces.ed.gov/statprog/2002/std2_6.asp)

**具体内容。** MTMM 的矩阵按「特质 × 方法」建列。同一特质由不同方法测得的相关应较高。应比较这条效度对角线与异特质的同方法和异方法相关，防止共同来源制造的高相关。方法分歧也可能来自观察范围或档位不同，不能只看一个系数。

**对 TeachArena 的意义。** 收敛假设示例：独立专家按 Bridge 式诊断线索外加学生独立修正作盲评，应与 `misconception_repair` 同方向，并强于与 `representation_pivot` 的关系。区分假设示例：只把教师口吻改得更热情、长度相近且不改教学动作，六维不应集体上升。再做学生自我监控改变但教师帮助不变的样例，以区分主动权和撤架。第二个裁判照抄同一提示产生的相关主要检验实现一致性，独立编码才有机会提供不同测法。当前 5 格同题不足以估计稳定矩阵，先报告每条反事实对照的方向（`contracts/judge/README.md:11–18,30–39`、`docs/status.md:116,126–134`）。

## 4. 教学机会和模拟学生可能改变六维的含义

**出处。** `docs/glossary.md:23–28`、`contracts/judge/README.md:24–28,41–44`、`src/run.mjs:137–155`、`docs/status.md:104–110,130–134`。效度上的内容与反应过程分类见 NCES 2-6-2A。[NCES](https://nces.ed.gov/statprog/2002/std2_6.asp)

**具体内容。** `representation_pivot` 的 0 同时覆盖无机会、未换表征和仅换措辞。`no_teach` 低档可能缺实际误解机会。学生生成要求起步只用画像已有知识、随支持小步推进、不要独自跳到答案。冻结正常格第 4 轮由教师指明目标量并问 x，模拟学生求 x，验证维为 0。完整五格正常格问垂距坐标及理由，学生仍不确定，验证维为 1。

**对 TeachArena 的意义。** 对每个维度分别记录「机会存在」「未出现机会」「证据不足」，先在人工回读中单列。用同一目标在「已懂」「暴露误解」两个状态看分差是否仍可解释。一个模拟学生可能主动完成检查，也可能受角色规则所限不产生相同的响应。报告应保留机会、教师动作、学生响应，便于定位哪部分推动了分数。

## 5. 坏教师提供定向反例，总分的补偿性仍待论证

**出处。** `contracts/judge/README.md:11–20,30–44`、`docs/status.md:104–110,124–134`。复合分需要理论与证据见 NCES 2-6-2。[NCES](https://nces.ed.gov/statprog/2002/std2_6.asp)

**具体内容。** 四个坏教师有预先指定的目标维度与至少一档分差。完整同次五格的四个目标差 2/1/1/2。冻结补评中表征维曾出现正常与首答揭底格都为 2，验证维两格都为 0。六个 0/1/2 档直接等权相加意味着例如主动权 +1 可以和误解修复 −1 在总分上抵消。

**对 TeachArena 的意义。** 已观察到的目标分差可以作为对典型教学行为的初步定向证据。继续用总分作记账摘要，同时用六维画像判断构念。试点可比较相同总分但不同画像的对话，让专家判断何者符合同一教学目标，以及何时错误内容应单独标记。该结果才能帮助论证是否保留等权补偿。
