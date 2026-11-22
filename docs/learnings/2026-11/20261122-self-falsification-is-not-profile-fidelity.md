# 自证伪减少不等于画像达线

**现象。** 四组小样中，只关 `thinking` 的甲组自证伪为 0/8，对照为 2/8。甲组两条老师指定代值均通过，但独立解释的画像命中只有 4/8，对照为 7/8。甲按预登记胜出，仍须通过完整画像判线。

**直接原因。** 假装懂了型在独立解释时应尝试并暴露未解决的卡点。即使没算反例，直接支持旧规则也不合格。重复条件则要求暂不摊开困惑。甲组的正式复跑中，假装懂了型在 S0-01 的两遍独立解释都称六项仍应相消，只提出代入 `z=1`；两遍重复又都主动承认不理解。完整复跑时，这两个条件都只有 2/4，低于 3/4。

**原件。** [小样按组证据](../../../runs/stage2a-learner-fix-pilot-01/pilot-report.md) 与 [正式复跑逐格对比](../../../runs/stage2a-learner-fix-full-01/hard-learner-fidelity-report.md)。复跑两遍 `r1`、`r2` 的 `S0-01/pretender/independent` 与 `S0-01/pretender/repeat` 是四个未命中格。独立解释的 #9 原文片段是「I think the six terms should still cancel」；重复的是「I'm still not totally sure why」。审核 `r1/S0-01/pretender:fidelity_audit:4:1:1`、`r2/S0-01/pretender:fidelity_audit:4:1:1` 分别绑定两遍每个条件的 #8/#9。两条独立解释的 #9 相同，Gemini 的 `progress` 分别为 `attempt`、`none`；两条 `stance` 都是 `misconception`，因此该分歧不改变画像判线。不重标。

**处置与预防。** 两个开关独立成组，用 #9 原话盲读自证伪和指定代值，不把 `repair` 当自证伪。按选优规则选配置后，在同一审核器下完整复跑，保留所有条件的分母。按原线标记假装懂了型不可用，停止实跑。相同前缀、温度 0 的有限重复只支持本次选择，不能断言 thinking 是所有自证伪的根因，也不能把少一次验算当作画像改进。
