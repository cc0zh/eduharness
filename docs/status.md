# 当前状态

项目处于 [S1 稳定的环境](scenarios.md#s1-稳定的环境)。

文档重组待独立审查。提交前审查服务连接超时，审查由后续会话接手。

| 场景 | 状态 | 证据入口 |
| --- | --- | --- |
| E1 S0-06 真实双格 | 已验收 | `git show cd0de52:docs/status.md`。运行和检查收据见 [E1 卡](scenarios.md#e1-s0-06-真实双格)。 |
| E2 四个坏教师自检 | 离线链路已验证，待真实验收 | `runs/e2-offline-reviewed/result.json` 与 `runs/_receipts/e2-offline-reviewed.json`。预登记及执行入口见 [E2 计划](plans/e2.md)。 |
| S2 独立的改进环境 | 待 S1 通过 | [S2 卡](scenarios.md#s2-独立的改进环境)列出隔离验收所需原件。 |
| S3 改进循环 | 待 S2 通过 | [S3 卡](scenarios.md#s3-改进循环)及其 E5 单轮对照。 |

E1 真实结果为两格均有有效总分，`productive_struggle` 为正常格 2 分、`answer_dump` 格 0 分。23 / 14 条引用均可回读，8 份学生请求未检出教师内部标记。正常格首份裁判响应因分数与证据冲突被拒绝，重试通过。历史执行与排查记录保留在 `cd0de52` 的状态文档。裁判结构化输出故障另见[诊断与复核](judge-structured-output.md)。
