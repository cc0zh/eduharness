# 选 A/B 目标维先核对同批基线的上升空间

**现象。** 第 4 步按第 3 步 25 题 normal 的低均值（1.760）选中 `representation_pivot`。真实 A/B 的 10 个本轮基线格却全部为 2 分，均值 2.00。改进侧为 1.50，配对均值差 −0.50，没有正差。

**根因与边界。** 已证实采用线要求目标维严格正差，而满分基线在这批比较里不可能上涨。第 3 步的 25 题均值不能代替本轮基线；同样 10 个题 ID 在第 3 步保存的分档均值为 1.60（S0-62、S0-51 为 0，其余为 2），也没预示本轮封顶。未证实封顶来自题目、对话变化还是裁判波动，不能推广为该维普遍封顶。

**证据。** `.tmp/scratch/harness-ab/preregistration.md:5–19,27–33` 和 `32ed5be` 的[结论](../../archive/status-log-2026-11.md#第-4-步-harness-对照)。`runs/harness-ab-v1/ab-report.md:9–19`、`ab-calculations.json` 的 10 条 `tasks`；同题旧分见 `runs/ruler-test-v3-real-01/<题号>/normal/judge.json` 的 `groups.consolidation.representation_pivot.score`。

**修复或现状。** 不采用此候选。本轮不在揭分后换题或改目标。封顶不抹掉实测负差，也不证明教师行为因何变化。

**预防。** 设计下一轮时，预先写清只看基线的筛选办法、最低改善空间及停做条件。用同一评测条件下实际要比较的基线检查抽样题，不靠全库均值或上轮同题分数推断；筛选时不看候选结果。
