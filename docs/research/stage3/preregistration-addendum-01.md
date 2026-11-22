# 阶段 3 预登记附录 01：负对照有效暴露范围

用户选择方案乙。本附录在第 2 版真实运行前、未看到任何第 2 版真实结果时制定。只修订[原预登记](preregistration.md)中 C 有效暴露下限的适用画像。原预登记及其 [SHA256](preregistration.sha256) 不变。第 1 版保留原判定，不用本附录重评。本附录不是第 2 版真跑或 `sealed` 的运行授权。

## 适用范围

- C 有效暴露下限只用于顽固误解型 `stubborn` 与伸手要答案型 `answer-seeker`。dev 各须至少 2/8；未来 `sealed` 各须至少 8/32。两个画像各自过线，不合并分母或互相抵消，原数值不变。
- 默认学生 `default` 的暴露和分画像结果继续报告。默认画像不设有效暴露门槛。默认学生仍在三臂样本、所有配对、C 整体的 A 均差和 C 阳性盲核中，不能为凑暴露或分数撤格。
- C 固定话术、教师 #8 插入和逐条差分、有效暴露的鉴定定义、检查提示与路由不变。C 经盲核确认的 A2 假命中必须为 0 格，且 `mean(A(C) − A(B)) ≤ +0.05`，仍对全样本计算。主目标 A ≥ +0.25、盲核、防退化、样本、用量上限和其余执行规则不变。

## v1 基线依据

回读 `stage3-dev-v1-real-01` 的 B 默认画像八份公开对话。#8 有 7/8 是确认、方法总结或收尾，没有布置新的检验；仅 `TA2B-F09-B` #8 有概念追问，教师已给出变式和数值，问 “What does the 42 g difference isolate — a single piece's weight, or a gap?”。学生 #9 沿着指定变式推理，没有机会自行决定检验方法。这里说的是 #8 未提供自选方法的任务，不是说学生绝无可能自发检验。v1 的默认画像有效暴露为 0/8。

| B 默认画像 | 教师 #8 原件与回读 |
| --- | --- |
| [TA2B-F01-A](../../../runs/stage3-dev/stage3-dev-v1-real-01/baseline/TA2B-F01-A/default/transcript.json) | 确认 88 cm，总结规则 |
| [TA2B-F01-B](../../../runs/stage3-dev/stage3-dev-v1-real-01/baseline/TA2B-F01-B/default/transcript.json) | 确认 90 cm，收尾 |
| [TA2B-F09-A](../../../runs/stage3-dev/stage3-dev-v1-real-01/baseline/TA2B-F09-A/default/transcript.json) | 确认 8 g，收尾 |
| [TA2B-F09-B](../../../runs/stage3-dev/stage3-dev-v1-real-01/baseline/TA2B-F09-B/default/transcript.json) | 教师给变式后概念追问，不交给学生选检验 |
| [TA2B-F12-A](../../../runs/stage3-dev/stage3-dev-v1-real-01/baseline/TA2B-F12-A/default/transcript.json) | 确认并总结事件间隔规则 |
| [TA2B-F12-B](../../../runs/stage3-dev/stage3-dev-v1-real-01/baseline/TA2B-F12-B/default/transcript.json) | 确认学生已经做过的检验，总结规则 |
| [TA2B-F18-A](../../../runs/stage3-dev/stage3-dev-v1-real-01/baseline/TA2B-F18-A/default/transcript.json) | 确认极值变式，总结后收尾 |
| [TA2B-F18-B](../../../runs/stage3-dev/stage3-dev-v1-real-01/baseline/TA2B-F18-B/default/transcript.json) | 确认 +4 分钟，明确收尾 |

这是所观测的 B 在默认画像上的结构特征。C 从同格 B 回放，无法创造 B 没留下的机会。适用范围只据这八份 B 原件和[第 1 版暴露回读](../../../runs/stage3-dev/stage3-dev-v1-real-01/report-v1.md#负对照与盲核)确定，不以候选臂结果选画像。

## 机器口径

```json
{"exposureGateStudents":["stubborn","answer-seeker"]}
```
