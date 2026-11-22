# 分档锚点与 checklist

## 1. 用相邻档正反例钉住行为边界

**出处** `contracts/judge/schema.mjs:10–19,155`、`contracts/judge/README.md:9–16,24–28`、`docs/status.md:37–42,59–61,98–110,126–134`。

**具体内容** `agency_handoff` 的 0 是只复述或只表达困惑，1 是教师仍主导方法且学生独立产生有限推理步骤，2 是学生在末三分之一选择并说明方法，或自己检验并解释后果。提示举「学生在既定方法内设置一个新关系」作 1 的例子，「照抄关系或只问为什么」标作 0。「沿指定路径算一次中间值」不足以升 2。末段从零基 `floor(2N/3)` 起。历史 v2 中 `lecture` 和正常格是 1/1。相同冻结对话在 v3 修复输出契约后是 0/1。这一历史包含尺子和输出契约变化。

**对 TeachArena 的意义** 用最小改写的三份片段固定边界。「我还是不懂」是困惑，「我列出 BE 的新关系」是独立有限一步，「我选择作垂线，并说明如何检验它确为垂距」才是高档候选。同一片段配置必须有对话编号及这些动作的前置条件。冻结结果提供了案例，单次分差无法拆出每项 prompt 改动的贡献。

## 2. CheckEval 将定性维度拆成可以独立回答的问题

**出处** Yukyung Lee 等，*CheckEval: A reliable LLM-as-a-Judge framework for evaluating text generation using checklists*，2024 预印本，核对 2025 年 v3，§3 和附录 D、F。[论文原文](https://arxiv.org/html/2403.18771v3)

**具体内容** 论文先定义评价维度，再生成种子问题、扩写与筛选，最后用布尔 QA 判定。原文例题是 `Are all words in the sentence spelled correctly?`，比笼统询问语言是否符合语法更容易定界。实际请求同批询问多个问题，维度得分可用 yes 数汇总。SummEval 的标注实例每维约 25 个问题。附录给出分维题数与提示。

**对 TeachArena 的意义** 以 `verification_or_transfer` 为例，先问「教师是否要求解释或应用概念」，再问「学生是否提供独立解释或迁移」。每题带 `#N`。口头确认不算第一项，复述不算第二项。0/1/2 仍按既有锚点决定。上游缺机会时需要显式状态。可先观察 2–3 个问题带来的诊断价值，避免每个六维都扩成约 25 个问题。

## 3. BiGGen-Bench 为每个实例写可检查的参考与分档描述

**出处** Seungone Kim 等，*The BiGGen Bench: A Principled Benchmark for Fine-grained Evaluation of Language Models with Language Models*，2024 预印本，核对 2025 年 v2，§3.1 与附录 F；官方数据行 `planning_compositional_planning_0`。[论文原文](https://arxiv.org/html/2406.05761) · [数据原件](https://huggingface.co/datasets/prometheus-eval/BiGGen-Bench)

**具体内容** 实例包含 system、input、reference answer，以及按 1–5 写出各档描述的 `score_rubric`。论文报告 765 个实例和 77 项任务。`planning_compositional_planning_0` 的参考案先收玩具，再吸尘，再整理书。rubric 检查是否把清理拆成具体可管理行为，以及时间和资源安排是否合理，低档举出只有模糊计划的情况。裁判提示先写针对 rubric 的反馈，再给 1–5 整数。

**对 TeachArena 的意义** 可以给重点题加窄参考，比如 S0-06 的 `misconception_repair` 参考以「AE=5 尚不足以证明垂距为 5」为最低检查点，支持坐标或几何等价说明。给 0 档一条只有鼓励的反例，2 档要求学生解释垂线关系而非复述数值。通用维度保持原定义，按题说明何种原文满足已有槽。`docs/status.md:57,130–134`。

## 4. TICK 为一条指令生成专用 checklist

**出处** Jonathan Cook、Tim Rocktäschel、Jakob Foerster、Dennis Aumiller、Alex Wang，*TICKing All the Boxes: Generated Checklists Improve LLM Evaluation and Generation*，2024，§3.1、Figure 1、附录 G。[论文原文](https://arxiv.org/html/2410.03608v1)

**具体内容** 用 few-shot 提示把每条指令的显性及领域隐性要求变成 YES/NO 题，并统一 YES 代表满足。单例 `PR_i = Σ_j a_ij / n_i`，跨例 `DRFR = Σ_iΣ_j a_ij / Σ_i n_i`，`a_ij` 为 0 或 1，`n_i` 为该例检查项数。Figure 1 将一条电视剧总结指令拆成 4 项，分别检查剧季、叙述语气、小标题与列表格式、是否少于 500 词。

**对 TeachArena 的意义** 为同一道题先冻结一组检查条件，然后评各教师。若各题检查项数不同，TICK 的总体公式会给条件更多的题更大权重。保留每条检查及来源，可先把它用作单格诊断，然后依现行六维档位规则填档。禁止对每个候选分别生成不同的过关条件。
