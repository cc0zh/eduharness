# 连续满分也可能漏掉审核边界

**现象。** Qwen 审核提示 v2 在 16 条构造样本上两遍均为 16/16。用同一提示审核 run 05，给出两种不同的 `stepPerformed` 标签，尽管两条学生回复都选定并说明了同一候选线段。另两条回复在表示同意后明确索要步骤，审核却将其判成表面理解。

**证据。** [16 条历史验证状态](../../status.md#stage2a-audit-validation-rerun)。本机原件在 `feat/stage2-hard-learners-json` 的工作树，本次为 checkout 根的 `../1cb291a3/`。回读 `runs/stage2a-audit-validation-2/audit-validation-report.md`。在 `runs/stage2a-hard-learners-05/`，`r1/S0-06/answer-seeker/independent` 和 `r2/S0-06/answer-seeker/independent` 各有 `transcript.json`，原判取各组 `calls/fidelity_audit-4-1-1.json` 的对应行。其余分歧见本机 `%TEMP%/teacharena/stage2a-review/verify.md`。

**边界。** 原件显示审核提示无法保证模型逐条落实优先规则，也不能保证等价动作跨条同判。这不证明模型能力或学生配置是全部问题；七条复核中还有两条学生画像偏离、一条两者兼有。重复验证只能支持用过的构造题。

**处置和预防。** 保持 v2 审核提示与历史原件不变。新增不同题目的正反对照，分别检验索步骤、实际尝试、陈述卡点、有依据修正。先独立复核和冻结标签，再按计划分母报告难例子集的准确率。正式重审须在候选审核器过线后另行登记。准备状态见[阶段 2a Gemini 审核](../../status.md#stage2a-gemini-audit)。
