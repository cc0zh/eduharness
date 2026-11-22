# 连续满分也可能漏掉审核边界

**现象。** Qwen 审核提示 v2 在 16 条构造样本上两遍均为 16/16。用同一提示审核 run 05，给出两种不同的 `stepPerformed` 标签，尽管两条学生回复都选定并说明了同一候选线段。另两条回复在表示同意后明确索要步骤，审核却将其判成表面理解。

**证据。** [16 条历史验证状态](../../archive/status-log-2026-11.md#stage2a-audit-validation-rerun)。本机原件在 `feat/stage2-hard-learners-json` 的工作树，本次为 checkout 根的 `../1cb291a3/`。回读 `runs/stage2a-audit-validation-2/audit-validation-report.md`。在 `runs/stage2a-hard-learners-05/`，`r1/S0-06/answer-seeker/independent` 和 `r2/S0-06/answer-seeker/independent` 各有 `transcript.json`，原判取各组 `calls/fidelity_audit-4-1-1.json` 的对应行。其余分歧见[阶段 2a 复核](../../research/stage2a-review/verify.md)。

**边界。** 原件显示审核提示无法保证模型逐条落实优先规则，也不能保证等价动作跨条同判。这不证明模型能力或学生配置是全部问题；七条复核中还有两条学生画像偏离、一条两者兼有。重复验证只能支持用过的构造题。

**处置和预防。** 保持 v2 审核提示与历史原件不变。新增不同题目的正反对照，分别检验索步骤、实际尝试、陈述卡点、有依据修正。先独立复核和冻结标签，再按计划分母报告难例子集的准确率。正式重审须在候选审核器过线后另行登记。

**复验。** Qwen 在新增难例中把 D01、D02、D03 的 `correctionWithBasis` 判成 true，虽然前两条仍坚持旧规则，第三条未说清旧规则错在哪里。错因与 callId（`runs/stage2a-qwen-hard-audit-validation-01/validation-report.md`）。Gemini 在同一批难例两遍均为 24/24；重审原 48 条时与七个历史核查参考相符，但另外一条伸手型的重复条件失去命中。假装懂了型两条有依据修正并未消失。把新旧标签、原文与同一判线一起保存，才能区分审核器变化和学生行为。重审逐条对照（`runs/stage2a-hard-learners-05-gemini-reaudit-01/reaudit-report.md`） · [实跑状态](../../archive/status-log-2026-11.md#stage2a-gemini-audit)

`r2/S0-06/answer-seeker/independent` 的 Gemini 引文只覆盖卡点。判断 `stepPerformed=true` 还要看同条 #9 开头 “I’d pick AE because it ends on AD at A”，以及 #8 “Try drawing or naming one choice first.”。转录 #8/#9（`runs/stage2a-hard-learners-05-gemini-reaudit-01/r2/S0-06/answer-seeker/independent/transcript.json`） · 审核原件（`runs/stage2a-hard-learners-05-gemini-reaudit-01/r2/S0-06/answer-seeker/calls/fidelity_audit-4-11-1.json`）。这是事后补充引文，不改审核标签。
