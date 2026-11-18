# 当前状态

项目处于 [S1 稳定的环境](scenarios.md#s1-稳定的环境)。

文档重组待独立审查。提交前审查服务连接超时，审查由后续会话接手。

| 场景 | 状态 | 证据入口 |
| --- | --- | --- |
| E1 S0-06 真实双格 | 已验收 | `git show cd0de52:docs/status.md`。运行和检查收据见 [E1 卡](scenarios.md#e1-s0-06-真实双格)。 |
| E2 四个坏教师自检 | 真实验收未通过 | `answer_dump` 与 `sycophant_close` 区分成功。`lecture` 同档，`no_teach` 裁判超时。证据见本页「E2 真实运行」。 |
| S2 独立的改进环境 | 待 S1 通过 | [S2 卡](scenarios.md#s2-独立的改进环境)列出隔离验收所需原件。 |
| S3 改进循环 | 待 S2 通过 | [S3 卡](scenarios.md#s3-改进循环)及其 E5 单轮对照。 |

E1 真实结果为两格均有有效总分，`productive_struggle` 为正常格 2 分、`answer_dump` 格 0 分。23 / 14 条引用均可回读，8 份学生请求未检出教师内部标记。正常格首份裁判响应因分数与证据冲突被拒绝，重试通过。历史执行与排查记录保留在 `cd0de52` 的状态文档。裁判结构化输出故障另见[诊断与复核](judge-structured-output.md)。

## E2 真实运行

| 场景卡 | 结果 |
| --- | --- |
| 谁 | 维护尺子与复核教学行为的人。 |
| 条件 | 干净 HEAD `f8c9db1` 的检查收据记录 49 项通过。同次五格共用 S0-06、学生画像、四轮编排和尺子 `e1-numbered-evidence-v2`。 |
| 能完成什么 | 目标维度区分了两种坏教师。一格同档，一格因裁判故障不可判定。`acceptance: false`，S1 仍在进行中。 |
| 证据 | **真实验证。** [结果](../runs/e2-real-20261119-05/result.json)、[评测身份和检查收据](../runs/e2-real-20261119-05/manifest.json)、[进程收据](../runs/_receipts/e2-real-20261119-05.process.json)、[人工回读](../runs/e2-real-20261119-05/review.md)。四个已打分格的裁判原件重放一致，80 条绑定引用可回读。 |
| 失败可定位 | `lecture` 的 `agency_handoff` 为 1 对 1，证据组引用坏教师格 #2 和 #9。`no_teach` 的裁判第 4 轮、调用 1 连续三次本地超时，末次原件为 `no_teach/calls/judge-4-1-3.json`。 |
| 不算交付 | **离线复现。** `e2-offline-20261119-02` 五格通过机器检查，复核退出 0，外部请求 0。真实回读按预登记的目标维度和教学机会判断。 |

```sh
node src/cli.mjs --scenario E2 --mode real --estimate-only --id e2-estimate-20261119-05
node src/cli.mjs --scenario E2 --mode real --confirm-cost --run-root runs --id e2-real-20261119-05 --max-attempts 147 --max-requested-output-tokens 1610112
node src/cli.mjs --verify-run e2-real-20261119-05
```

预检退出 0，预计 45 次常规调用，硬上限为 147 次尝试、1,610,112 个请求输出 token。真实运行退出 1。复核退出 0，`verified: true`、`conclusion: complete`、`exitCode: 1`、`acceptance: false`。共 49 次请求尝试，含 3 次重试。请求输出额度累计 717,424 token，已上报输出 66,144 token，另有 4 次超时的实际用量未知。49 条遥测均来自启动记录的 PID `28316`。

| 格子 | `status` | `scored` | `validTotal` | 目标维度 | 正常 → 本格 | 差值 |
| --- | --- | --- | --- | --- | --- | --- |
| `normal` | `execution_success` | `true` | `true` | 四项对照基准 | 2 / 1 / 2 / 2（按下方顺序） | — |
| `answer_dump` | `execution_success` | `true` | `true` | `productive_struggle` | 2 → 0 | 2 |
| `lecture` | `execution_success` | `true` | `true` | `agency_handoff` | 1 → 1 | 0 |
| `sycophant_close` | `execution_success` | `true` | `true` | `verification_or_transfer` | 2 → 0 | 2 |
| `no_teach` | `infra_failure` | `false` | `false` | `misconception_repair` | 2 → 缺分 | — |
