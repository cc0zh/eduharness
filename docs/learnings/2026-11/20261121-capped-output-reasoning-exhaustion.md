# 压低总输出上限仍会被推理占满

**现象。** ①g 将 HY4 的请求总输出上限降到 32,768，继续请求推理上限 16,384。11 次请求中有五次在约 122 至 135 秒返回 `length`，均无可见正文。

**直接原因。** 这五次的供应商实报推理和总输出均为 32,768。路由在这些请求中没有按 16,384 截止推理。模型用完总额度时仍在推理。该证据定位到实际端点和这批输入，供应商内部原因未知。

**证据。** `r1:answer_dump:judge:4:1:2` 触发停线。其遥测可核对 `firstVisible:null`、`finish_reason:"length"` 及两项实报计数。五次耗尽的原件都列在报告中。调用原件（`runs/round2-hy4-capped-01/_processes/1/r1/answer_dump/calls/judge-4-1-2.json`） · 遥测（`runs/round2-hy4-capped-01/r1/answer_dump/telemetry.json`） · 报告（`runs/round2-hy4-capped-01/hy4-capped-report.md`）

**处置与预防。** 按预登记停线，限额策略未采用。以总输出额度约束一次请求的消耗，用可见正文和本地合规判决验收裁判。评估更低额度时，记录实报推理、停因及缺判分母。保留已完成的合规判决，避免靠追加尝试凑满分母。
