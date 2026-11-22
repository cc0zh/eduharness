# 延长观察不等于救回判决

**现象。** ①b 三次 OpenRouter 裁判调用在本地 180 秒截止前只有推理、没有正文，实际用量未知。它们来自三个格子的首尝试，A2 和 R0 均重试恢复，R1 到达停线。①c 用 v2 和单独的 360 秒诊断期限重放同三份输入，每份两次，另有三份成功过的对照各一次。九次中四次在约 242–254 秒停于 `length`，始终没有正文。五次合规调用都早于原截止。

**根因与边界。** 四次 `length` 都在约 2–5 秒收到首字节，末阶段仍是推理，实报推理和总输出均为 65,536。路由未按请求中的 16,384 推理上限停止，推理耗尽整个输出预算。延后本地截止能揭示这四次的结束状态，未让它们获得判决。①b 的旧尝试没有最终用量且提示词版本不同，不能断言它们都会走同一路径，也不知道路由不执行上限的内部原因。

**证据。** ①b 遥测：A2（`runs/round2-perturbation-01/A2-assigned-multiplier/telemetry.json`）、R0（`runs/round2-perturbation-01/R0-still-learner-origin/telemetry.json`）、R1（`runs/round2-perturbation-01/R1-student-score-cards/telemetry.json`）。同格 `calls/judge-4-1-1.json` 可回读首尝试。①c 自 `4c41f0a:src/models.mjs` 记录 `phaseMs` 与实报计数。回读 `runs/round2-timeout-v2-01/R1-student-score-cards-r1/telemetry.json` 的首/末推理、`firstVisible: null`、`finish_reason: "length"` 和两列 token。其它三次为同 run 的 `b-counts`、`R0-still-learner-origin-r2`、`A2-assigned-multiplier-r2`。诊断全表（`.tmp/scratch/timeout-exp/report.md`） · [①c 状态](../../archive/status-log-2026-11.md#round2-perturbation-v2) · 复核（`runs/round2-timeout-v2-01/verify-run.json`）

**现状。** 360 秒只限诊断，正式 180 秒不变。真实复测中 `b-quiet` 两次在原截止前仍只有推理；缺少实报，不能把它们记成推理耗尽。

**预防。** 排查无正文时，把响应头、首字节、首末推理、首正文和停止原因分开看。用隔离身份延长少量观察，再查实报推理是否挤满总预算。要宣称延长截止有用，须看到超出原截止后确实拿到合规正文；不要把「看完故障」算成恢复。
