# 逐轮、整段与结果判分

## 1. TeachArena 旧逐轮评的是当时的教师动作，新整段能看动作后果

**出处** 新 `src/run.mjs:141–158`、`src/judge.mjs:3–20`、`contracts/judge/README.md:18,22–28`。本地 [`ruler-old-vs-new.md`](../../ruler-old-vs-new.md) 的「单轮评价」引旧 `eval/teacharena/overrides/tutor-turn.md:9–19,34–54,58–110` 和旧 `nl_assertions.py:176–227`。旧代码本次「未读原文」。

**具体内容** 对照笔记记录旧逐轮裁判每个非空教师消息调用一次，窗口最多 8 条非空消息并包含当前教师消息，尚未看到此后学生回复。旧版另有整段 LLM 裁判。新编排在第 4 轮学生回复入轨后，用一个逻辑裁判调用处理整个公开 transcript，失败可重试。整段能查看先遇阻、后调整、再吸收等时序，分档直接对应完整支持链。

**对 TeachArena 的意义** 面试可说清两种逐轮问题。只看教师发言之前的前缀，能判断当时该回应什么。加上下一条学生回应，能诊断是否吸收所给提示。整段原始分保留跨轮行为与先后关系。若给四个正式教师轮各做一次独立诊断，额外逻辑调用为 4 次，另有失败重试。先从每格最多 1 个关键轮开始更容易控制范围。

## 2. 关键轮诊断可以固定选择器和窗口

**出处** `contracts/judge/schema.mjs:13–16,110`、`docs/status.md:59–61,126–134`、`src/judge.mjs:7–10`。以下选择器是本次建议。

**具体内容** `productive_struggle` 的首答揭底是一个前缀事件，重点看首个实质教师消息。`agency_handoff` 则涉及整段，尤其最后三分之一。E2 实跑正常格 #7 提出消元，讲授格 #9 复述 #8 的结果并表示仍不理解。建议选择器预先按目标给出一个触发点，如首个实质教师回复，或最后一次可见学生自主推理机会。保存到该点的前缀、目标轮，以及单独标明的下一条学生回应。找不到机会就记录不可用的原因。

**对 TeachArena 的意义** 可用一个结构记录 `target_n`、`prefix_end_n`、可选的 `next_learner_n` 与 `reason/evidence`。一个批次的选轮方法固定，避免只挑总分低或看起来错的消息。诊断可以回答「问题在哪一步发生」，整段分档仍按原尺子发布。

## 3. PRM 标记中间步骤，首次错误也能做诊断目标

**出处** Hunter Lightman 等，*Let’s Verify Step by Step*，2023，§2.2、§4、附录 F。[论文原文](https://arxiv.org/html/2305.20050)

**具体内容** 过程监督为数学解的中间步标 positive、negative 或 neutral。PRM 在每步末尾预测该步的标签概率，一次前向可以对解法中的各步给出预测。论文最终将 neutral 并到正类，用 `∏_i P(positive 或 neutral | 前缀至第 i 步)` 合成解法分，指出乘积对步骤较多的解法略有惩罚。受控实验仅监督到首次错误，以使过程监督与仅知道最终错误的监督在信息差上更清楚，新增信息是首错位置。

**对 TeachArena 的意义** 借用「定位首次错误」的过程思路，例如记录第一次未回应学生误解或第一次提前交出完整解。按教学轮生成可验证诊断和训练 PRM 是两种实现。教师动作的阶段性作用不同，逐轮得分相乘会改变尺子，也可能惩罚需要跨轮拆解的教学。

## 4. τ-bench 查末态，SWE-bench 查最终补丁的行为

**出处** Shunyu Yao 等，*τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains*，2024，§3 的 task and reward 定义。Carlos E. Jimenez 等，*SWE-bench: Can Language Models Resolve Real-World GitHub Issues?*，ICLR 2024，§2 与附录的 test-based evaluation。[τ-bench 原文](https://arxiv.org/html/2406.12045) · [SWE-bench 原文](https://arxiv.org/html/2310.06770)

**具体内容** τ-bench 在 episode 结束后比较数据库状态与期望状态，并在相应题目里检查 Agent 向用户给出了必要信息。论文指出，即使最终退款结果正确，也可能曾绕过用户确认。SWE-bench 判最终补丁是否通过全部 `FAIL_TO_PASS` 和 `PASS_TO_PASS` 测试，缺失或不通过的测试计失败，两类分别约束修复和回归。

**对 TeachArena 的意义** 学生最后说出正确的 `25/13` 对教学过程仍有多个可能解释。首答照抄和先独立建立关系再计算都可能到达这个结果。可在可核验题上并列给出结果正确性，再用时序证据判断首答揭底、帮助变化或交还主动权。结果项不能从最终答案推出先前是否发生了这些行为。`docs/status.md:59–61,126–134`。
