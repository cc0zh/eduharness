# 表征转换的零分不说明有没有机会

**现象。** `representation_pivot` 的 0 档同时收「没有教学机会」与「有机会但没有实质换法」。第 3 步 `S0-95/normal` 和 `S0-20/sycophant_close` 都是 0。前者裁判标记无机会，学生沿原行列算法即可解开困惑；后者 #3 暴露按原来方式理解比例的困难，教师 #4 没换表征，裁判标有机会引用但没有观测到转换。

**根因与边界。** 已证实 rubric 把不同情形合并到同一档，单看分数无法区分。证据槽仍能分别记录 `not_applicable` 和 `not_observed`，但不是独立确认的机会标签。本例只能说明混用 0 档的风险，不说明本批所有 0 档都被正确归类。

**证据。** [裁判契约](../../../contracts/judge/README.md)第 15、28 行和 `contracts/judge/schema.mjs:15`。`runs/ruler-test-v3-real-01/S0-95/normal/{judge,transcript}.json`、`runs/ruler-test-v3-real-01/S0-20/sycophant_close/{judge,transcript}.json`。同 run 的 `test-report.md:45–53` 将无机会和机会不明单列。

**修复或现状。** 首轮保留原始分档。需要判断教师是否错过机会时，要回读槽位和公开消息，不把所有 0 档算成错过。不知道有没有机会就保留未知。

**预防。** 先报无机会、机会不明、有机会的计数，再在有机会且证据可判的样本上算错过比例。与预登记的计划分母分开报，不用重分档来改善结果。

旧库参照：`mini-eduharness2/docs/learnings/2026-11/20261115-opportunity-rates-and-score-loss.md`。迁移的是分开报机会与失败的做法，不沿用旧权重，也不改变本库 0 档。
