# LLM 裁判的判决形式、提示与偏差

## 1. 单份分档、两份比较和参考引导

**出处** Lianmin Zheng 等，*Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*，NeurIPS 2023，§3.1、§3.3、Table 4 和附录提示。[论文原文](https://arxiv.org/html/2306.05685)

**具体内容** 单份评分在固定尺度上打分。成对裁判看 A/B 两份答复，输出 A 胜、B 胜或平手。参考引导可给单份或成对裁判补参考。论文对 10 道数学题分别交换候选位置，共 20 次判断。默认提示错判 14/20，先推导自身答案再比较的 CoT 提示错判 6/20，加入预先生成参考答案的提示错判 3/20。论文默认成对提示要求先给短解释，再按格式给判决。Table 4 涉及求解和参考输入的变化，未单独实验 JSON 字段先后。

**对 TeachArena 的意义** 固定三档让单条冻结轨迹可以独立诊断，即使没有另一位教师的输出也能评分。需要检查一道题的策略差异时，可补成对判决，但要指定比较维度并保留平手。数学参考可用经过核对的最小正确关系、适用条件以及等价解，不要求教师给学生展示某份标准解。可以测试把「填证据、说明判据」放在输出决策前的提示改动。现行 schema 字段列表 `score` 在前，提示已有理由要求，字段顺序是否影响实际解码及判断尚未验证。`contracts/judge/schema.mjs:34–42,46–51,110`。

## 2. G-Eval 把评价步骤放进提示，再对档位概率求期望

**出处** Yang Liu 等，*G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment*，EMNLP 2023，§2、公式 1，§3.2。[论文原文](https://arxiv.org/html/2303.16634)

**具体内容** 先由任务描述和评价标准生成 Evaluation Steps，再把步骤、上下文和候选文本一并输入，按 1–5 填分。最终分 `∑ s_i·p(s_i)` 用输出评分 token 的概率给档位加权。实验 API 的 GPT-4 不返回 token 概率，论文以 20 次采样估计分布。例如三档下概率 `.1/.6/.3` 的期望为 `1.2`，这是公式示例。

**对 TeachArena 的意义** 可先借用「列出观察步骤」的方法。判主动权时先问教师是否掌握方案，再找学生是否提出新步骤，最后查末段是否作了实质检验。原始三档和证据链可继续保留。若评估概率加权，先确认路由能提供对应位置的各候选 token 概率。当前契约接受整数档，概率期望的 `1.2` 无对应行为档；需要另给该指标定义和身份。

## 3. Prometheus 的参考材料是满档例和分档 rubric

**出处** Seungone Kim 等，*Prometheus: Inducing Fine-grained Evaluation Capability in Language Models*，ICLR 2024，§3 和 Table 1；*Prometheus 2: An Open Source Language Model Specialized in Evaluating Other Language Models*，EMNLP 2024，§3、Table 1、附录提示。[Prometheus 原文](https://arxiv.org/html/2310.08491) · [Prometheus 2 原文](https://arxiv.org/html/2405.01535)

**具体内容** 初版输入 instruction、候选答复、定制 rubric、可获 5 分的参考答复，训练模型先输出 feedback，再用 `[RESULT]` 分隔并输出 1–5。Feedback Collection 有 1,000 个 rubric、20,000 个指令、100,000 个候选及 feedback，五档各 20,000 个。Prometheus 2 将分别训练的 direct assessment 与 pairwise 权重合并，前者输出 1–5，后者按指标输出 A 或 B。两个训练集共用 1,000 个评价标准、20,000 个指令及对应参考。

**对 TeachArena 的意义** 面试可用 `agency_handoff` 区分「档位规定什么」与「参考长什么样」。给 2 档一条短师生片段，另给只在教师指定路径内计算的 1 档边界。不把参考案的措辞或篇幅当成得分条件。按题核查时把正确性参考只交给裁判，目前 `src/judge.mjs:7–10` 发送的是通用 rubric 和公开消息。

## 4. MT-Bench 的候选位置与长度操纵有独立对照

**出处** Zheng 等，*Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*，2023，§3.2–3.3，Table 2、Table 3、Figure 2(b)、附录 Figures 10–11。[论文原文](https://arxiv.org/html/2306.05685)

**具体内容** 用 GPT-3.5 对 80 个首轮题各生成两条相近回复，交换位置。默认提示的首位偏向为 Claude-v1 75.0%、GPT-3.5 50.0%、GPT-4 30.0%。作者的保守规则是两种顺序都选同一候选才给胜，冲突作平手。篇幅操纵选 23 条有编号列表的答案，插入一套仅改写措辞的重复列表。Claude-v1、GPT-3.5、GPT-4 偏好加长版的失败比例分别为 91.3%、91.3%、8.7%。Figure 2(b) 中作者描述 GPT-4、Claude-v1 作为裁判时对自身输出的无平手胜率比人工口径高约 10%、25%。它们也偏好其他模型，GPT-3.5 未显示同样现象，作者无法据此确认因果意义上的自我偏好。

**对 TeachArena 的意义** 当前 pointwise 无 A/B 候选位置。未来若加 pairwise，交换两段轨迹的摆放位置，保留轨迹自身顺序。长度诊断应构造同义长短版本，保留教学动作和学生证据。匿名 `role/text` 会隐藏模型名，但风格仍可能暴露来源。比较同家族和跨家族裁判时记录双方模型身份，避免把本项目差异说成已证实的同源问题。

## 5. Hamel 用二元条件定义局部错误

**出处** Hamel Husain 与 Shreya Shankar，*AI Evals: Everything You Need to Know*，问题「Why do you recommend binary (pass/fail) evaluations instead of 1-5 ratings (Likert scales)?」。[作者原文](https://hamel.dev/blog/posts/evals-faq/)

**具体内容** 作者指出 3 与 4 的相邻分难定义，评审容易选中间档，对逐步改善的跟踪可以改用多个具体的二元条件。原文举例把事实正确性的 1–5 换成五个事实各是否出现，记录 4/5。文章给的是实践论证。

**对 TeachArena 的意义** 「首个实质教师回应是否已经给出答案」和「是否提出概念检查」适合写成子条件。对主动权，教师主导下学生完成有限一步和学生自己接管是有明确区分的两档。可先记录具体事实，再按既有规则归档。找不到观察机会时记录其状态。

## 6. 多裁判需要显式规定聚合与证据归属

**出处** UK AI Security Institute，Inspect，*Multiple Scorers* 的 `multi_scorer()` 和 reducer 说明。[官方文档](https://inspect.aisi.org.uk/multiple-scorers.html)

**具体内容** `mode` 是最高出现频数，`majority` 要求严格过半，`collect` 保留所有输出。以三个有效裁判分别给 `0,1,2` 为例，严格多数不存在。三个裁判给 `2,2,0` 有明确多数 2。两个档位结果只给 `2,0` 时也没有严格多数。

**对 TeachArena 的意义** 如果对争议档启用多裁判，规定无多数的状态，保留每名裁判的原档和绑定。胜出的 2 档应来自至少一份完整的同一证据链。不要把多个裁判各自不完整的槽拼成一条满分链。三名并行裁判每格最多需要 3 次基础裁判调用，各调用另有重试额度。

## 7. 用长度控制分离篇幅和成对偏好

**出处** Yann Dubois、Balázs Galambosi、Percy Liang、Tatsunori B. Hashimoto，*Length-Controlled AlpacaEval: A Simple Way to Debias Automatic Evaluators*，2024 预印本，核对 2025 年 v2，§3、§4.1 Figure 3。[论文原文](https://arxiv.org/html/2404.04475v2)

**具体内容** 用含模型、指令和长度项的逻辑回归建模裁判偏好，再令长度差为零，估计同样长度下的反事实胜率。仅改受测模型的简洁或详尽提示时，GPT‑4 原始胜率在 22.9%–64.3% 之间波动，控制后为 41.9%–51.6%。论文方法假设目标是同长度条件下的比较。

**对 TeachArena 的意义** 先做表达长短变化但提示次数、关键教学事实和学生证据相同的配对片段。一旦改写引入实质提示或教师接管，长度就与教学行为一起变了。小规模项目先保留受控对照，拟合长度回归需要更多能独立变化的实例。
