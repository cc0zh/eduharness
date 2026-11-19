# 当前状态

项目处于 [S1 稳定的环境](scenarios.md#s1-稳定的环境)。

文档重组待独立审查。提交前审查服务连接超时，审查由后续会话接手。

| 场景 | 状态 | 证据入口 |
| --- | --- | --- |
| E1 S0-06 真实双格 | 已验收 | `git show cd0de52:docs/status.md`。运行和检查收据见 [E1 卡](scenarios.md#e1-s0-06-真实双格)。 |
| E2 四个坏教师自检 | 真实验收未通过 | v3 使用 `judge-output-v2` 的冻结补评取得五格有效分数，`lecture` 低一档，`sycophant_close` 同档。下一次完整五格按 S1 卡核对四项目标。 |
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

## S1 补充复核

### `no_teach` 裁判超时与补评

源运行的 `no_teach` 裁判在第 4 轮调用 1 的三次尝试均收到 HTTP 200，分别在 180,005、180,015、180,010 ms 触发 180,000 ms 本地 deadline。保存的请求上下文序列化后均为 5,365 字节，同次完成的裁判请求上下文为 5,718 至 13,476 字节。该大小仅覆盖保存的上下文。三次请求的输出上限均为 65,536 token。首次收到 59,367 字符推理和 35,737 字节不完整 JSON，后两次分别收到 160,964 和 175,298 字符推理，无可见正文。三次均缺终止原因及最终用量，实际推理和输出 token 未知。原件可确认直接失败于本地 deadline，无法确定供应商延迟的根因。单格补评沿用原裁判策略。[调用原件](../runs/e2-real-20261119-05/no_teach/calls/) · [遥测](../runs/e2-real-20261119-05/no_teach/telemetry.json)

```sh
node src/cli.mjs --scenario E2 --mode real --judge-only e2-real-20261119-05 --judge-cell no_teach --estimate-only --id e2-no-teach-estimate-20261119-02
node src/cli.mjs --scenario E2 --mode real --confirm-cost --judge-only e2-real-20261119-05 --judge-cell no_teach --id e2-no-teach-real-20261119-01 --max-attempts 3 --max-requested-output-tokens 196608
node src/cli.mjs --verify-run e2-no-teach-real-20261119-01
```

**真实验证。** 干净 HEAD `28300ce` 的检查收据记录 50 项通过。预检上限为 3 次尝试、196,608 个请求输出 token。补评实际发出 1 次请求，上限 65,536 token，供应商报告输入 1,222 token、输出 13,022 token，其中推理 11,478 token。CLI 和 `--verify-run` 均退出 0，补评格为 `execution_success`，`scored: true`，`validTotal: true`。补评对话与原对话相同，manifest 保存源对话哈希。原五格运行仍为退出 1、`acceptance: false`。[补评 manifest](../runs/e2-no-teach-real-20261119-01/manifest.json) · [进程收据](../runs/_receipts/e2-no-teach-real-20261119-01.process.json) · [检查收据](../runs/_receipts/check-28300ceb07081cad732c151a3ea17d964f21aecb.json)

`misconception_repair` 为正常格 2 分、补评格 0 分，差值 2。正常格第 1 轮 #2 让学生判断 AE 是否垂直于 AD，#3 学生说 “So maybe 5 isn’t automatically the distance to side AD.” 补评保留源消息 ID。`e2-real-20261119-05:no_teach:m:1` 暴露 AE 与垂距的误解，第 1 轮 #2 只说 “Thanks for giving this problem a try—keep going, you’ve got this!”，#3 学生仍问是否为 5。第 4 轮 #8、#9 再现同样机会和未修复的误解。[正常格裁判](../runs/e2-real-20261119-05/normal/judge.json) · [补评裁判](../runs/e2-no-teach-real-20261119-01/no_teach/judge.json)

### `lecture` 同档

正常格 #6 交还列式，学生 #7 自行消元。第 4 轮 #8 又由教师给出线性方程，学生 #9 只完成求解。讲授格 #2 已给两套完整解，#9 学生能复述 `25/13`，仍要求解释为何 AG 等于垂距。这道题提供了交还步骤的机会。正常教师交还有限，裁判也未解释为何将讲授格的复述及自我监控同样判为 1 分。一次同档无法确定两者谁是主因。`productive_struggle` 捕捉了提前揭底，`verification_or_transfer` 也反映了缺少概念核验，两项均为正常 2、讲授 0。逐条证据和备选方向见本地 [.tmp/scratch/e2-real/lecture-analysis.md](../.tmp/scratch/e2-real/lecture-analysis.md)。

### v3 冻结补评

冻结补评 `s1-v3-frozen-real-20261119-01` 使用 `e1-numbered-evidence-v3`、`evaluation-identity-v2` 和 `e1-call-policy-v4`。干净 HEAD `2fbefc7` 的 `npm run check` 通过 51 项。补评 manifest 绑定 `e2-real-20261119-05` 的源身份、manifest 哈希和五格对话哈希。补评按 v3 口径读取；与 v2 分档不可直接比较。[补评 manifest](../runs/s1-v3-frozen-real-20261119-01/manifest.json) · [检查收据](../runs/_receipts/check-2fbefc73afa6573c5f3eee92b195c66dc0586b91.json)

```sh
node src/cli.mjs --scenario E2 --mode real --judge-only e2-real-20261119-05 --judge-cell all --estimate-only --id s1-v3-frozen-estimate-20261119-01
node src/cli.mjs --scenario E2 --mode real --judge-only e2-real-20261119-05 --judge-cell all --confirm-cost --id s1-v3-frozen-real-20261119-01 --max-attempts 15 --max-requested-output-tokens 983040
node src/cli.mjs --verify-run s1-v3-frozen-real-20261119-01
```

预检退出 0。冻结补评退出 1，`acceptance: false`。`--verify-run` 退出 0，`verified: true`、`conclusion: complete`，进程收据与请求日志均记录 3 次请求。正常格第 4 轮裁判调用 1 连续三次收到 HTTP 200 和正常停止的 JSON。三次响应的六维 `reason` 都只有数字，`agency_handoff.reason` 均为 `"1"`。本地校验拒绝三份响应，未发布分数。两次重试耗尽后停止，`lecture` 无分差可判定，完整真实五格未启动。[结果](../runs/s1-v3-frozen-real-20261119-01/result.json) · [进程收据](../runs/_receipts/s1-v3-frozen-real-20261119-01.process.json) · [末次原件](../runs/s1-v3-frozen-real-20261119-01/normal/calls/judge-4-1-3.json)

| 格子 | `status` | `scored` / `validTotal` | 六维 / 总分 | 目标维度 / 分差 | 源对话回读 |
| --- | --- | --- | --- | --- | --- |
| `normal` | `infra_failure` | `false` / `false` | 无 / `null` | 正常对照 / 缺分 | #7 学生列出 “(x − 13)² + y² = 144” 后消元。 |
| `answer_dump` | 未执行 | 无记录 | 无 / 无 | `productive_struggle` / `null` | #2 教师首答给出坐标推导和最终答案 `25/13`。 |
| `lecture` | 未执行 | 无记录 | 无 / 无 | `agency_handoff` / `null` | #9 学生说 “I still honestly don’t see why AG is the distance to AD.” |
| `sycophant_close` | 未执行 | 无记录 | 无 / 无 | `verification_or_transfer` / `null` | #2 教师附和 “the distance from E to side AD is 5 units”，随后收尾。 |
| `no_teach` | 未执行 | 无记录 | 无 / 无 | `misconception_repair` / `null` | #2 教师说 “Thanks for giving this problem a try” 并继续鼓励。 |

摘录来自 `e2-real-20261119-05:<格子>:m:<序号>`。v3 没有发布可用的裁判绑定引用。[冻结源原件](../runs/e2-real-20261119-05/)

三次调用的脱敏出站字段均为 `reasoning.max_tokens=16384`、`max_tokens=65536`、`provider.require_parameters=true` 和 `response_format.type=json_schema`，其中 `json_schema.strict=true`。总输出预算扣除请求推理上限后余 49,152 token。三次实报推理均低于 16,384，未观察到超限。[调用原件](../runs/s1-v3-frozen-real-20261119-01/normal/calls/) · [遥测](../runs/s1-v3-frozen-real-20261119-01/normal/telemetry.json)

| `normal` 第 4 轮调用 1 | 请求输出额度 | 实报输入 | 缓存读入 | 实报输出 | 推理 | 可见输出 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 尝试 1 | 65,536 | 2,034 | 0 | 8,889 | 7,890 | 999 |
| 尝试 2 | 65,536 | 2,071 | 0 | 10,412 | 9,527 | 885 |
| 尝试 3 | 65,536 | 23 | 2,048 | 10,847 | 9,726 | 1,121 |
| 合计 | 196,608 | 4,128 | 2,048 | 30,148 | 27,143 | 3,005 |

实报 token 合计 36,324，含 2,048 个缓存读入 token。三次用量均已上报。

### v3 输出契约修复后的冻结补评

`s1-v3-output-v2-frozen-real-20261119-01` 使用干净 HEAD `10654a7`，检查收据记录 54 项通过。评测身份记录 `judgeOutputContract: judge-output-v2`，沿用 v3 分档和四个预登记维度。五格对话与 `e2-real-20261119-05` 的原件逐字一致，五份裁判正文均可重放到相同的分档、理由和绑定引用。五格都在第 4 轮裁判调用 1 的首次尝试成功。`--verify-run` 退出 0，`verified: true`，本次补评退出 1，`acceptance: false`。[manifest](../runs/s1-v3-output-v2-frozen-real-20261119-01/manifest.json) · [结果](../runs/s1-v3-output-v2-frozen-real-20261119-01/result.json) · [进程收据](../runs/_receipts/s1-v3-output-v2-frozen-real-20261119-01.process.json) · [检查收据](../runs/_receipts/check-10654a73ba751ffd40dc6686d5d0ad8f2b2060ab.json)

六维依次为 `misconception_repair`、`support_escalation_and_fading`、`agency_handoff`、`productive_struggle`、`representation_pivot`、`verification_or_transfer`。五格均为 `execution_success`、`scored: true`、`validTotal: true`。消息 ID 为 `e2-real-20261119-05:<格子>:m:<序号>`。

| 格子 | 六维 / 总分 | 目标维度 | 正常 → 本格 / 分差 | 裁判引用回读 |
| --- | --- | --- | --- | --- |
| `normal` | 2 / 1 / 1 / 1 / 2 / 0，合计 7 | 四项对照基准 | 正常对照 | #7 学生自行列出 “(x − 13)² + y² = 144” 并消元。 |
| `answer_dump` | 1 / 1 / 0 / 0 / 2 / 0，合计 4 | `productive_struggle` | 1 → 0 / 1 | #2 教师首答给出完整坐标推导和答案 `25/13`。 |
| `lecture` | 1 / 0 / 0 / 0 / 1 / 0，合计 2 | `agency_handoff` | 1 → 0 / 1 | #9 学生复述答案并问 “I still honestly don’t see why AG is the distance to AD.” |
| `sycophant_close` | 0 / 0 / 2 / 0 / 0 / 0，合计 2 | `verification_or_transfer` | 0 → 0 / 0 | #2 教师附和 “the distance from E to side AD is 5 units” 并收尾。 |
| `no_teach` | 0 / 0 / 0 / 0 / 0 / 0，合计 0 | `misconception_repair` | 2 → 0 / 2 | #2 教师只做鼓励，#3 学生仍问 “So AE = 5 means the distance to side AD is just 5, right?” |

`lecture` 达到预登记的冻结主动权门槛。整体验收未通过的差值是 `sycophant_close` 的 `verification_or_transfer`。正常格 #8 已把 x 和所求距离等同，只问 “What does x come out to?”，#9 学生求出 x，未解释距离关系。该次裁判把它判为 0 分。完整五格使用新对话，对照同一次运行的正常格。[正常格裁判](../runs/s1-v3-output-v2-frozen-real-20261119-01/normal/judge.json) · [附和格裁判](../runs/s1-v3-output-v2-frozen-real-20261119-01/sycophant_close/judge.json)

预检上限为 15 次尝试、983,040 请求输出 token。实际 5 次、0 次重试、327,680 请求输出 token。供应商实报输入 13,005、输出 61,050，合计 74,055。每次出站均为 `max_tokens=65536`、`reasoning.max_tokens=16384`。按上述格序，实报推理为 10,601 / 9,305 / 12,258 / 11,055 / 10,706，均在上限内。

### S1 场景卡逐栏

| 栏 | 已满足 | 还缺 |
| --- | --- | --- |
| 谁 | 接手者可按 README 和运行手册运行，复核者可从 manifest、进程收据、裁判绑定与公开对话回读。 | 无。 |
| 条件 | 最新冻结补评使用干净 HEAD 和 54 项检查收据，固定 S0-06 并绑定 v2 源身份与五格对话。 | 缺少按 v3 完整执行的真实五格。 |
| 能完成什么 | E1 双格已验收，`check_distance` 已验证。最新冻结补评五格均有有效总分，预登记四维区分三项。 | `sycophant_close` 同档，缺少同次四项有效分差。 |
| 证据 | **真实验证。** E1 正常格第 3 轮 `check_distance` 前后 hook 共用 `call_00_USpBHGKKl9qAJd83bH0d7645`，后置 `isError: false`。最新冻结补评的 `--verify-run` 退出 0，出站字段、用量和引用均可回读。**离线复现。** `npm run check` 退出 0，54 项通过。S0-01 答案键、截断与额度拦截的联合回归退出 0，15 项通过。 | 完整真实五格的验收、分差与评分引用。 |
| 失败可定位 | 最新冻结补评的同档位于 `normal` 与 `sycophant_close` 的第 4 轮裁判调用 1 尝试 1，正常格机会引用为 #8、#9。上文保留各轮原件。 | 缺少新对话中的同次验证。 |
| 不算交付 | 原始分档、故障、引用及收据均保留。v3 离线回放和冻结补评各自记录运行结果。 | S1 保持进行中。 |
