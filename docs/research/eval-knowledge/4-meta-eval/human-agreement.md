# 人工一致性与公开实测

## Cohen’s κ 衡量校正边际后的同档程度

**出处** Jacob Cohen，*A Coefficient of Agreement for Nominal Scales*，1960，「未读原文」。Mary L. McHugh，*Interrater reliability: the kappa statistic*，2012，Cohen’s kappa 一节与表 3，已读。[Cohen 书目](https://doi.org/10.1177/001316446002000104) · [McHugh 原文](https://pmc.ncbi.nlm.nih.gov/articles/PMC3900052/)

**具体内容** 对两个评分者的同一组配对单位，令 `Oᵢⱼ` 为联合比例、`pᵢ` 和 `qⱼ` 为各自边际。`p_o=ΣᵢOᵢᵢ`，`p_e=Σᵢpᵢqᵢ`，`κ=(p_o−p_e)/(1−p_e)`。1 代表完全一致，0 是在该边际独立基线下的同档率，负数低于基线。若双方均恒定在同一档，`p_e=1`，κ 未定义。McHugh 表 3 回顾常用的 .41–.60 moderate、.61–.80 substantial、.81–1 almost perfect，并指出这些描述不足以确定实际接受门槛。

**对 TeachArena 的意义** 每维并列报告精确同档率、κ 和 3×3 混淆矩阵。假设人工 95 条给 0、5 条给 1，而裁判全给 0，同档 95% 但 `p_o=p_e=.95`、κ=0。需要检查两端档的计数和机会分布。无有效评分另设可用性分母。参见 `contracts/judge/README.md:9–20,28,43`。

## 加权 κ 保留相邻档和跨两档的区别

**出处** Jacob Cohen，*Weighted kappa: Nominal scale agreement with provision for scaled disagreement or partial credit*，1968，「未读原文」。scikit-learn `cohen_kappa_score` 的 `linear`、`quadratic` 权重与 McHugh（2012）表 3。[Cohen 书目](https://doi.org/10.1037/h0026256) · [实现文档](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.cohen_kappa_score.html) · [解释表](https://pmc.ncbi.nlm.nih.gov/articles/PMC3900052/)

**具体内容** 令 `Eᵢⱼ=pᵢqⱼ`，`κ_w=1−ΣᵢⱼwᵢⱼOᵢⱼ/ΣᵢⱼwᵢⱼEᵢⱼ`，这里 `w` 是错档成本。0/1/2 的线性 `w=|i−j|/2` 给相邻错 .5、两档错 1。二次 `w=(i−j)²/4` 分别给 .25 和 1。1 为完全一致，0 对应加权边际独立基线，分母为 0 则未定义。可以用普通 κ 的 .61–.80/.81–1 作粗略描述，但没有通用的加权 κ 门槛。换权重或换人群会改变结果。

**对 TeachArena 的意义** 预登记线性 κ 为主指标。它较二次 κ 更重视会翻转 E2「差一档」结论的相邻错档。二次 κ 作为灵敏度分析，同时算 `MAE=Σ|J−H|/n`、`mean(J−H)` 与 `P(|J−H|=2)`。不要把六维合并为独立样本。参见 `contracts/judge/README.md:39`。

## Krippendorff’s α 适合多人、缺评和复评

**出处** Klaus Krippendorff，*Computing Krippendorff’s Alpha-Reliability*，2011，2013 更新，§1 及第 5–8 页，已读。`.800/.667` 经验线来自作者 *Content Analysis: An Introduction to Its Methodology* 的内容分析建议，「未读原文」。[计算手册](https://www.asc.upenn.edu/sites/default/files/2021-03/Computing%20Krippendorff%27s%20Alpha-Reliability.pdf) · [书目](https://us.sagepub.com/en-us/nam/content-analysis/book258450)

**具体内容** `α=1−D_o/D_e`。在至少有两份评分的单位内配对形成有序共现计数 `oᵢⱼ`，有 `mᵤ` 份评分的单位每个有序对权重为 `1/(mᵤ−1)`。令 `nᵢ=Σⱼoᵢⱼ`、`n=Σᵢnᵢ`，`D_o=Σoᵢⱼδ²(i,j)/n`，`D_e=Σnᵢ(nⱼ−1[i=j])δ²(i,j)/(n(n−1))`。标准有序距离在 `i<j` 时为 `δ²(i,j)=[Σ_{k=i}^jn_k−(nᵢ+nⱼ)/2]²`，相同档为 0。α=1 是零观测分歧；0 是期望分歧；负值是分歧更大；`D_e=0` 为未定义。常见内容分析经验线是 ≥.80 可接受，.667–.80 支持暂定结论，具体风险另定。

**对 TeachArena 的意义** 当以后每条有 ≥3 名独立人工评分，或将同一模型三次复评作为三个评分列时，可逐维报告有序 α 和题簇置信区间。缺 `null` 的评分保留为缺失，报告缺失率，也检查它是否集中在难评片段。发生缺评时，α 的可计算性无法消除选择偏差。参见 `contracts/judge/README.md:20`。

## Spearman ρ 回答排序关系

**出处** M. M. Mukaka，*A guide to appropriate use of Correlation coefficient in medical research*，2012，表 1。SciPy `spearmanr` 函数说明与实现。[原文](https://pmc.ncbi.nlm.nih.gov/articles/PMC3576830/) · [SciPy 源码](https://github.com/scipy/scipy/blob/main/scipy/stats/_stats_py.py)

**具体内容** `ρ=corr(rank(X),rank(Y))=Σ(Rᵢ−R̄)(Sᵢ−S̄)/√[Σ(Rᵢ−R̄)²Σ(Sᵢ−S̄)²]`。有并列时取平均秩。常用简式 `1−6Σ(Rᵢ−Sᵢ)²/[n(n²−1)]` 只适用于无并列。`ρ=±1` 对应完全同向或反向排序，`ρ≈0` 代表少有单调关系，一侧常量时未定义。Mukaka 对 `|ρ|` 的经验描述为 `<.30` 可忽略、`.30–.49` 低、`.50–.69` 中、`.70–.89` 高、`≥.90` 很高。这些是相关强度描述。

**对 TeachArena 的意义** 若人工总分 `[3,5,7,9]`、裁判 `[5,7,9,11]`，`ρ=1` 仍会每条多打 2 分。可作为总分单调性诊断。校准的主结果看逐维加权 κ、准确同档和方向偏差。参见 `contracts/judge/README.md:18`。

## MT-Bench 的 85% 取决于平局处理

**出处** Lianmin Zheng 等，*Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*，NeurIPS 2023，§4.1–4.2，表 5–6。[原文](https://arxiv.org/html/2306.05685)

**具体内容** MT-Bench 表 5 的 S2 排除 tie，GPT‑4 pairwise 对专家首轮 85%（859 票）、次轮 85%（864 票），人工与人工 81%（479 票）和 82%（474 票）。S1 含 tie，GPT‑4 pairwise 对人两轮均为 66%（1,343、1,325 票）。表 6 的 Arena 分别为 S2 87%（1,944 票）、S1 64%（3,066 票）。

**对 TeachArena 的意义** 对 E2 逐项列低一档、同档、反转、缺分。保持原始分母。若单另报告去除同档的方向正确率，连同保留下来的占比一起展示。偏好投票的 85% 无法当作六维三档的外部校准成绩。

## AlpacaEval 的 0.98 是系统排序相关

**出处** Yann Dubois、Balázs Galambosi、Percy Liang、Tatsunori B. Hashimoto，*Length-Controlled AlpacaEval: A Simple Way to Debias Automatic Evaluators*，COLM 2024，图 1、§4.2。[原文](https://arxiv.org/html/2404.04475)

**具体内容** 对同一批被纳入的系统，长度控制把 AlpacaEval 与人类 Chatbot Arena 排名的 Spearman ρ 从 .94 提到 .98。每个系统的评测单位是相对参考模型的胜率，人类一侧是 Arena 的系统排名。

**对 TeachArena 的意义** 面试报数字时先说明粒度。单段人机评分、坏教师定向差和系统级排名相关需要不同数据和分母。TeachArena 校准应保留逐维逐段。

## JudgeBench 用可验证的答案对检验裁判

**出处** Sijun Tan 等，*JudgeBench: A Benchmark for Evaluating LLM-Based Judges*，ICLR 2025，§3–4，表 1–2。[原文](https://arxiv.org/html/2410.12784)

**具体内容** 350 个挑战性回复对，一对有一条客观正确、一条客观错误。GPT‑4o vanilla 的整体准确率 50.86%，Arena-Hard prompt 为 56.57%，猜测基准 50%。表 2 的 o3-mini high 为 80.86%。该论文是在验证成对答案选择，与开放教学的人机同档用不同参照。

**对 TeachArena 的意义** 收集同样清楚的已知档位或方向锚点，例如首答完整揭底与保留试错。用这些对子看裁判是否区分已知差异。对独立推理或教学机会的含混边界仍需要盲标。

## 高人工一致仍可能掩盖裁判偏差

**出处** Aman Singh Thakur 等，*Judging the Judges: Evaluating Alignment and Vulnerabilities in LLMs-as-Judges*，2024 预印本，GEM² 2025，§3–4.1、附录 A 与图 16。[原文](https://arxiv.org/html/2406.12624)

**具体内容** 事实问答的人工验证子集 1,200 条由三人评。以含本人投票的多数标签为参照，平均原始一致率 98.52%，Scott’s π=.962。图 16 对人工标签的 π 为 GPT‑4 .87、Llama 3 70B .88、Llama 3.1 70B .88。§4.1 显示整体原始一致率高于 90% 的裁判，对某些被测模型的分仍可偏离逾 10 点。

**对 TeachArena 的意义** 人与共识的数若共识含该评分者，会出现依赖。报告裁决前盲标 A 对 B 的一致性。人机偏差也按正常、已知退化、教学机会和评分人分层，给出带符号的偏差。

## MRBench 同时量了人对人和自动评对人

**出处** Kaushal Kumar Maurya、Kv Aditya Srivatsa、Kseniia Petukhova、Ekaterina Kochmar，*Unifying AI Tutor Evaluation: An Evaluation Taxonomy for Pedagogical Ability Assessment of LLM-Powered AI Tutors*，NAACL 2025，§4.2、§6、附录表 5–6。[原文](https://arxiv.org/html/2412.09416) · [出版页](https://aclanthology.org/2025.naacl-long.57/)

**具体内容** 192 个数学辅导对话语境、1,596 个候选教师回复、8 项三类标注。四名标注员受训、读指南并答题。四人独立标同 8 个对话用于先导，每人 544 个标签，Fleiss κ=.65。主标时 40 个对话由两人独立标，平均 Cohen κ=.71。对人类标注，两个自动裁判的逐 tutor、逐维 Pearson 系数多为负。表 5 Prometheus2 范围 −.72 至 +.18，表 6 Llama-3.1-8B 为 −.80 至 +.17。

**对 TeachArena 的意义** 近邻场景也需要本域人评。可直接借鉴 4 人训练先导、双标对话和面向维度的报告。其单位为数学错误语境中的单个候选回复，TeachArena 的单位是有学生后续证据的完整对话。

## BEA 2025 把精确三档和合并档指标并列

**出处** Ekaterina Kochmar、Kaushal Kumar Maurya、Kseniia Petukhova、KV Aditya Srivatsa、Anaïs Tack、Justin Vasselli，*Findings of the BEA 2025 Shared Task on Pedagogical Ability Assessment of AI-powered Tutors*，BEA 2025，§2–4、§6 表 2–5。[原文](https://arxiv.org/html/2507.10579) · [出版页](https://aclanthology.org/2025.bea-1.77/)

**具体内容** 开发集 300 对话、2,476 回复，测试集 191 对话、1,547 回复。校准时六位组织者独立标 10 对话的 83 条回复，Fleiss κ=.64，随后讨论分歧。测试各任务最佳 exact/lenient macro‑F1 为错误识别 `.7181/.9185`、定位 `.5983/.8404`、指导 `.5834/.7860`、可行动性 `.7085/.8659`，每对最大值可来自不同提交。lenient 把 `Yes` 和 `To some extent` 合并。BEA 把另一个 κ=.65 系于 200 个开发对话并引用 MRBench，后者的 §4.2 把 .65 系于 8 个 pilot 对话。这里用 BEA 可明确定位分母的 .64。

**对 TeachArena 的意义** 三档精确匹配和加权错档都要保留。即使给出二元指标，也先定义合并哪些档以及会掩盖哪些错误。BEA 的数是人际 κ 和系统对 gold 的 F1，分别报告。

## 校准指南在开发样本上迭代

**出处** Shreya Shankar 等，*Who Validates the Validators? Aligning LLM-Assisted Evaluation of LLM Outputs with Human Preferences*，UIST 2024，§6–7.3。Hamel Husain，*Using LLM-as-a-Judge For Evaluation: A Complete Guide*，步骤 1–6、FAQ。[EvalGen 原文](https://arxiv.org/html/2404.12272) · [Critique Shadowing 原文](https://hamel.dev/blog/posts/llm-judge/)

**具体内容** EvalGen 让 9 位有 LLM 生产经验的从业者在 Zoom 中边用工具边口述。参与者看过输出后继续改评价标准，有人回改早先的评分，论文称 criteria drift。Hamel 建议领域专家先对实例做 pass/fail 并写 critique，在训练、开发和测试之间拆开样本，留出未见数据做误差分析。

**对 TeachArena 的意义** 借鉴独立写理由、修订指南、锁指南后盲评三个动作。保留现有 0/1/2，校准集设计见 `calibration-plan.md`。对有机会但未做、无机会、证据不足并列打诊断标签，方便定位分歧。参见 `contracts/judge/README.md:25–28,43`。
