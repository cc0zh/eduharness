# 构造矩阵零错不代表学生证据充分

**现象。** S1 的二元尺子对预登记的 6 个预期 Yes 和 93 个预期 No 全部判对。与此同时，`normal` 的 V2 三遍都把学生 #5 作为独立解释的证据。原话是 “since AD is vertical? But I’m not really sure why”，而垂距为何取 x 由教师在 #6 补出。执行者 AI 回读不能确认 V2 满足独立解释要求。

**根因与边界。** 构造矩阵只收录坏教师指令能决定的行为。6 个正例是 `answer_dump` 首答两题各复判三次。矩阵没有学生题真值，也没有门控 Yes 的真值。V2 不进入矩阵，判对所有构造格不能验证 V2。三遍同判只证明这份对话的重复一致；裁判为什么采信 #5 未知。

**证据。** 本机 `runs/s1-binary-round2-01/preregistration.md` 的构造预期表与 `s1-binary-summary.json` 的 `matrix.questions.V2`；同 run `r1/normal/{judge,transcript}.json` 的 V2、#4–#6。可提交索引为[第二轮状态](../../archive/status-log-2026-11.md#round2-s1)及 [`binary.mjs`](../../../contracts/judge/binary.mjs) 的 V2 定义。

**现状。** 保留三遍机器分档和预登记结论。报告将构造命中、逐题一致、原字回读分开。没有据此调题、补跑或冻结尺子。

**预防。** 先列每道题的真值覆盖，缺样本用 `0/0`。判给学生的 Yes 要回读该生成消息是否真的解释或执行，而不是看教师已教清、角色绑定有效或三遍一致。要检验这些学生题，另用独立锁定的标注覆盖正反例。
