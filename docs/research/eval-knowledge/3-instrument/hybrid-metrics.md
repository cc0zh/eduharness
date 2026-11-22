# 确定性检查与 LLM 判分

## 1. Inspect 同时支持独立评分、聚合和级联

**出处** UK AI Security Institute，Inspect，*Multiple Scorers* 的 Task definitions、`multi_scorer()` 与 Cascading Scorers，以及 *Scorers* 的 `match()` 和 `model_graded_fact()`。[多评分器](https://inspect.aisi.org.uk/multiple-scorers.html) · [内置评分器](https://inspect.aisi.org.uk/scorers.html)

**具体内容** 一个 task 可以保存多个 scorer 的独立结果。`multi_scorer()` 可用 `mode` 归并为出现最多的值，`majority` 则要求严格超过一半。文档另给 `cascade(exact=match(location="exact"), grader=model_graded_qa(model=grader_model))`。默认阈值 1.0，便宜阶段没有达到阈值才继续，记录 `decided_by`。作者要求前级评分器误报少，宽松匹配不适合前级直接定案。

**对 TeachArena 的意义** 第一版给每格并列输出确定性诊断和六维分。题专用规则只有在已定义高精度触发条件的情况下，才考虑像 `cascade` 那样代替一个语义环节。例如题目给出答案键时，首答出现 `25/13` 只是候选信号。数字可能首次由学生说出、教师可能在引号里引用，也可能用等价形式揭底。单纯匹配字串不足以自动判 `productive_struggle=0`。

## 2. 旧 v6 有确定性聚合，部分输入来自 LLM

**出处** 已读本地 [`ruler-old-vs-new.md`](../../ruler-old-vs-new.md) 的「总体评价」。它定位旧 `eval/teacharena/overrides/tutor-turn.md:103–116,180–214`、`src/eval/analysis-loss.ts:5–12,61–68`，以及旧 `.cache/tau2-bench/src/tau2/evaluator/evaluator_tutoring_trajectory.py:583–646`。这些旧源码在本次为「未读原文」。新 `contracts/judge/README.md:18` 确认旧逐轮和轨迹聚合未接入。

**具体内容** 对照笔记记录六个规则量：C1/C2 支持升降及误解修复，M1/M2 主动权及验证迁移，N1/N2 有益试错及情绪参与。各对取均值后按 `.33/.37/.30` 加权。聚合可由程序重算，输入用到每轮 LLM 行为标注和学生轮分类。笔记还记录 IRI 逐轮透露惩罚系数 `1/.90/.65/.40`。这些是旧实现口径。

**对 TeachArena 的意义** 面试要区分「规则能重算」和「规则的输入能客观复核」。恢复旧复合公式会把轮标注误差带入分数。当前可以先用已有公开角色和文本生成无模型信号，把需要语义判断的事项交给 LLM 并绑定证据。

## 3. 三个可重算的对话信号及其边界

**出处** 信号设计依据 `src/judge.mjs:7–10` 的 `{n,role,text}` 投影、`contracts/judge/schema.mjs:13–16` 的档位定义、`docs/status.md:126–134` 的 S0-06 实跑例。这一条的公式是本次建议。

**具体内容** ① 提问形式比例 `有问号的非空教师轮数 / 非空教师轮数`。匹配 `?` 或 `？`，报告原分子、分母和命中编号。② 教师话语占比 `教师去空白的 Unicode code point 数 / 师生去空白的 Unicode code point 总数`。单独注明是否剔除 `turn=0` 的任务输入，空分母输出缺失。③ 首答泄露候选 `normalized_answer ∈ normalized_first_substantive_teacher_message`。按题固定答案别名与规范化版本，记录首个实质教师消息编号及命中跨度，未知答案键时记不可用。

**对 TeachArena 的意义** 三者都可在每格零额外模型调用时计算，适合作为诊断字段。问号可以出现在「懂了吗」里，长度易受英语、数学公式和长任务输入影响，字串可能把确认或反问当作提前揭底。先用首答完整解 #2、正常追问 #2、以及学生先独立得到答案后教师总结三个样例核对边界。用独立、对应的证据解释六维结果，暂不把代理指标加入 0–12。
