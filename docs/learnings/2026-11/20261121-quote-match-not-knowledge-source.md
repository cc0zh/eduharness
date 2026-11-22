# 原字引文匹配不等于找对知识来源

**现象。** `stage2a-hard-learners-02` 的 48 条审核都通过严格 JSON 和本地引文校验。审核仍把 #8 给出的 36、7 和 25/13 当成 #9 无依据跃迁的证据。S0-06 顽固误解型针对错因的两遍 #9 都比较出 5 和 3，并解释到 A 不等于到边的最短距离；一遍为 `repair` 加跃迁，另一遍仅为 `attempt`。

**根因与边界。** 本地校验只证明引用是该消息的原字和位置。两条审核理由没有把 #9 复述的数值回溯到 #8。它们和预登记「照抄不计跃迁」不符。几何两遍的标签差异有原件，形成差异的模型内部原因未知。

**证据。** `runs/stage2a-hard-learners-02/r2/S0-01/answer-seeker/answer/transcript.json`、`r2/S0-06/pretender/answer/transcript.json`、`r{1,2}/S0-06/stubborn/targeted/transcript.json` 的 #8/#9。标签在同 run 的 `result.json` 与各组 `audit.json`。[阶段 2a 状态](../../archive/status-log-2026-11.md#stage2a-hard-learners)

**现状。** 原审核和判线保留。报告区分模型标记与原文回读，不把两题的可教性判断外推。没有画像获准考教师。

**预防。** 下一轮在生成前登记「教师给数后复述」和「用已知工具完成反例」两类阴性校准样本，检验审核能否追溯知识来源。正式回读把 #8 的来源、#9 的新增推理和模型标签并列。先解决审核歧义，不能事后改线或把数字复述当知识进步。

**复验。** `stage2a-audit-calibrated-01` 只改审核提示，四项整条同判为 9/12。审核仍将没有给出 E 的最终距离列成跃迁理由。`stage2a-audit-calibrated-02` 让审核单报是否实际尝试、是否修正并附依据、#9 中可能无来源的新事实。宿主对新事实原字查教师消息，再按原定义生成标签。两条直接复述的跃迁位和两条几何修正的标签均通过两遍锚点复验。整条同判为 11/12，剩下一处进步档分歧。v3 复审（`runs/stage2a-audit-calibrated-01/result.json`） · v4 复审（`runs/stage2a-audit-calibrated-02/result.json`）
