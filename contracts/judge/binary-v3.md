# 二元尺子 `e1-binary-v3`

`S1-judge-bakeoff` 使用 `judge-output-v5` 和 `evaluation-identity-v5`。19 道题的题义和算分见 [v2 评分维度](binary.md#评分维度)。每格对同一公开对话依次发送六个单维请求。出站 JSON Schema 每个维度最多九个可空证据槽，严格校验字段、角色和编号。

M0 与 R0 的证据写在维度顶层 `anchors`。M1、M2、M3 各填本题新增的消息号。R1 填 `newFrame`，R2 填 `uptake`。代码按同一链读回锚点。No 上多填的有效引用在校验后归为 `null`。调用原件以 `normalized` 保留题号和原引用。角色、时序、窗口或门控错误会被拒收。

六维合规后才组装整格。S3 为 Yes 时，P1 必须为 Yes 且两者引用同一开场回复。冲突格标记 `judge_partial_failure`，保留两题答案、引用和调用坐标。整格 `judge.json` 的 `binding.dimensions` 指向六份通过的调用原件。续跑回放已结算的维度及重试次数。
