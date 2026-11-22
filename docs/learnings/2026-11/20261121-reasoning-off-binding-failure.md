# 推理为零、正文及时，仍须校验证据锚

**现象。** HY4 的关推理小对照中，三次调用都在 2.5 秒内开始返回正文，供应商实报推理 token 均为 0，无推理 delta。首格依然没有合规判决。

**直接原因。** `r1/normal` 的三份正文都将 `M0.misconception` 指到 #1，将 `M2.misconception` 指到 #3，并把 #5 引作修复。尺子要求这两个 `misconception` 槽绑定同一消息，因此拒绝三份判决。原件能证明这次拒收发生在哪个锚，不能证明关推理导致了换锚。

**证据。** 本机 run `round2-reasoning-off-01` 的 报告（`runs/round2-reasoning-off-01/reasoning-off-report.md`）、遥测（`runs/round2-reasoning-off-01/r1/normal/telemetry.json`） 和 `r1/normal/calls/judge-4-1-{1,2,3}.json`。每份原文均可重放出 `M2: M0 anchor mismatch`。同锚约束见[二元尺子契约](../../../contracts/judge/binary.md)和 `contracts/judge/binary.mjs:92–94`。

**处置。** 两次同类重试后停止，未采用关推理。没有放宽锚点检查、补分或重跑首格。

**预防。** 将出站设置、实报推理和合规判决分别验收。停线导致构造项缺判时同时报告缺失数；没观测到误判不是准确率证据。
