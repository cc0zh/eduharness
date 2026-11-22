# 面试追问与 TeachArena 可核对的答法

英文引号中保留公开页面的问题原句。中文项目追问是据原题改编。题源是公开面试练习或作者 FAQ，未核实企业出题记录及频次。

## 1. 你怎么知道你的裁判可信？

**出处** Dataslope 公开面试练习原题 “How do you know whether an LLM judge can be trusted?”；Hamel Husain 的公开 FAQ 原题 “How do you validate an LLM judge against human labels?”。[Dataslope](https://dataslope.com/interview-prep/data-scientist/llm-evaluation#how-do-you-know-whether-an-llm-judge-can-be-trusted) · [Hamel FAQ](https://hamel.dev/blog/posts/llm-judge/#how-do-you-validate-an-llm-judge-against-human-labels)

**具体内容** “我先预登记四个退化及各自应下降的维度。S0-06 同次正常格与四个坏教师的目标差为 2、1、1、2 档。产物中的证据 ID 可回读，人工看了相应教学机会和行为。此前冻结组也有核验维同档，项目保留了结果。” 证据见 `contracts/judge/README.md:30–43`、`docs/status.md:98–110,124–134,157`。

**对 TeachArena 的意义** **缺口。** 双人独立人工标注与裁判逐维一致率未测。补 30 条保留对话，公布裁决前人际线性加权 κ、与共识的人机 κ、3×3 混淆矩阵、两档错和题簇区间。追问为什么不用 Spearman 时，可举两套总分各差 2、排序完全相同的例子。见 `contracts/judge/README.md:18,25`。

## 2. 测量结果可以复现吗？

**出处** Hamel Husain 公开 FAQ 原题 “How do you ensure consistency when updating your LLM model?”。同一身份下的 test-retest 是项目追问。Chen、Goldfarb-Tarrant（ACL 2025）附录 A 表 3 给出了同模型温度 0 两次复跑的对照。[Hamel FAQ](https://hamel.dev/blog/posts/llm-judge/#how-do-you-ensure-consistency-when-updating-your-llm-model) · [实验原文](https://aclanthology.org/2025.acl-long.970.pdf)

**具体内容** “完整 E2 的五份保存响应可重放到一致结果。我们锁对话哈希和裁判身份，另对同一批输入做三次独立复评。现有请求代码设温度 0。保留逐维翻档、总分方差和 E2 门槛跨越计数。” 证据见 `docs/status.md:94,116–124`、`src/models.mjs:136–144`。复评进行中来自任务背景，尚无本次可引用的完整测量结果。

**对 TeachArena 的意义** **缺口。** 提供三份复评分数和原件，按题内波动报告。更换裁判模型、路由或 rubric 后要用同一份保留人评复查新身份，旧身份的稳定性结论只归旧身份。`contracts/judge/README.md:3–5` 明确 v2 与 v3 分档不可直接比较。

## 3. 两版平均差 0.5 分，算显著吗？

**出处** Dataslope 公开面试练习原题 “How do you A/B test an LLM feature?”。0.5 分是据此改编的 TeachArena 追问。Miller（2024）§4.2、§5 提供配对与功效方法。[公开题](https://dataslope.com/interview-prep/data-scientist/llm-evaluation#how-do-you-ab-test-an-llm-feature) · [论文](https://arxiv.org/html/2411.00640v1)

**具体内容** “先确认 0.5 是一个维度的平均档差，还是 0–12 总分的平均分差。每题固定预登记条件，将两版本配在一起，算 `D=B−A`。有足够独立题时，按题或题族做配对区间，报告差值和 95% CI。现有 E2 固定一题、同一次 run、同一正常格供四项比较，跨题标准误无法估计。” 仓库证据见 `contracts/judge/README.md:18,39`、`docs/scenarios.md:37–41,83–87`、`docs/status.md:116–134`。

**对 TeachArena 的意义** **缺口。** 需要多题同条件配对和先导方差。若目标单维差 0.5 档且配对 SD 假设为 1，双侧 α=.05、80% 功效约需 32 道独立题。若目标改成总分差 0.5 且 SD 为 2，则约 126 道。见 `paired-statistics.md`；该估算尚未用 TeachArena 数据拟合。

## 4. 最少要多少样本才能证明这些分差？

**出处** Dataslope 公开面试练习原题 “How large does an eval set need to be?”；Miller（2024）§2.2、§3、§5。[公开题](https://dataslope.com/interview-prep/data-scientist/llm-evaluation#how-large-does-an-eval-set-need-to-be) · [论文](https://arxiv.org/html/2411.00640v1)

**具体内容** “当前四种对照共用 S0-06，四个成功不等于四个独立题。两组 1 档差达到预登记最低门槛，任一侧动 1 档就可能丢掉该方向。我们先用同一对话的三次评分量裁判噪声，再用多道独立题和题内重复估方差，以目标效应算样本量。” 仓库证据见 `docs/scenarios.md:37–41`、`contracts/judge/README.md:32–39`、`docs/status.md:126–134`。

**对 TeachArena 的意义** **缺口。** 独立题间方差和真正的端到端重复都待测。对「区分度差是否该改 5 档」追问，先看有机会层、人际和人机的 0/1/2 混淆与复评翻档。举已记录的核验维 `0→0`，两侧可回读证据先说明正常格本身低档，再检查裁判。见 `docs/status.md:98–110`。

## 5. Agent 能不能学会讨好裁判？

**出处** Zheng 等论文引言原句 “But, what if an adversary intentionally cheats auto-annotators to achieve high win rates and capitalize on the resulting promotional benefits?”。中文为项目追问。[原文](https://arxiv.org/html/2410.07137)

**具体内容** “公开研究的常量回复在 AlpacaEval 2.0 取得 86.5% 长度控制胜率。我会冻结一批盲评样例，对相同教学行为只改排版、长度或自评措辞，在原例与改写之间比较人评和裁判分差。当前系统会核对窗口内的引用、角色和顺序。引用是否真支持分档需要人工回读。” 证据见 `contracts/judge/README.md:24–28,41–44`、`docs/scenarios.md:83–87`。

**对 TeachArena 的意义** **缺口。** 补盲测集上的对抗/等义对子，以及每轮更新的「裁判升而人工持平或降」比例。已有 `no_teach` 可做起点。用保留的不同题或题族验证迁移，避免只在单题打磨四种已知坏教师。见 `contracts/judge/README.md:30–43`。
