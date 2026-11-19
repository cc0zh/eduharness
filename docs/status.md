# 当前状态

**第 2 步：人工校准，等待用户盲标。**

| 步骤 | 状态 | 证据入口 |
| --- | --- | --- |
| 第 1 步 区分坏教师 | 已完成 | `0302396` 记录用户签收 S1。`e2-real-20261119-06` 同次五格区分了四种坏教师，但原预登记的三次完整稳定性重复未达成。[签收与回读证据](#s1-场景卡逐栏) |
| 第 2 步 人工校准 | 进行中 | `fae5f1b` 记录 15 条训练对话的生成、初评与盲标交接。还没有逐维加权 κ 和一致率。[训练记录](#补尺子训练初评完成待人工盲标) |
| 第 3 步 未见题验证 | 未开始 | 尺子尚未冻结。冻结后对 25 道测试题沿用人工校准的盲标和一致性协议。 |
| 第 4 步 手写变体 A/B | 未开始 | [第 4 步场景卡](scenarios.md#第-4-步-手写-harness-变体-ab)。 |

## 补尺子：训练初评完成，待人工盲标

`6fd2875` 锁定 15/25 划分，`60a93cc` 固定候选题并校验训练引用，`5e56667` 提供训练生成、初评及复核入口。

只纳入原件初筛通过的 40 道题，锁定 15 道训练和 25 道测试。20 道待校正、5 道暂缓、28 道旧封存均保持原状。名单、种子、复算规则和 SHA256 见[数据契约](../contracts/dataset/README.md#补尺子划分)。本轮未生成或评测试题。尺子仍是 `e1-numbered-evidence-v3 / judge-output-v2 / evaluation-identity-v2`，尚未完成校准和冻结。

干净 HEAD `5e56667` 的 [检查收据](../runs/_receipts/check-5e5666738fd1d096e3caabde4b20b567ea5ffb77.json)记录 68 项通过。真实生成和初评串行执行。15 道训练题均 `execution_success`，初评全部 `scored: true`、`validTotal: true`。两个 run 的进程及 `--verify-run` 均退出 0；[生成复核](../.tmp/scratch/ruler-expand/ruler-train-gen-v1.verify.json)和[初评复核](../.tmp/scratch/ruler-expand/ruler-train-score-v1.verify.json)均为 `verified: true`、`acceptance: true`。全部遥测 PID 与对应启动收据一致，生成 `61792`、初评 `18516`。

| 阶段 | 收据 | 请求数 / 上限 | 请求输出 token / 上限 | 实报输入 / 缓存读 / 输出 / 合计 |
| --- | --- | ---: | ---: | ---: |
| 生成 | [start](../runs/_receipts/ruler-train-gen-v1.start.json)、[requests](../runs/_receipts/ruler-train-gen-v1.requests.jsonl)、[process](../runs/_receipts/ruler-train-gen-v1.process.json) | 120 / 396 | 563,520 / 1,881,216 | 84,689 / 129,280 / 61,894 / 275,863 |
| 初评 | [start](../runs/_receipts/ruler-train-score-v1.start.json)、[requests](../runs/_receipts/ruler-train-score-v1.requests.jsonl)、[process](../runs/_receipts/ruler-train-score-v1.process.json) | 15 / 45 | 983,040 / 2,949,120 | 48,063 / 1,024 / 185,526 / 234,613 |

重试和用量缺报均为 0。两阶段合计实报 510,476 token。原 20 条最省档估算来自本机 `%TEMP%/teacharena/ruler-expand/plan.md` 第 6 节（SHA256 `59a501ce1df6c0e731c4c22c3c0e847438b83dac9c3b126b7efb2ce6a9ea0c22`），生成 295,800、初评 379,000，合计约 674,800 token。按 15 条线性折算，生成约 221,850 token，实报高 24.3%；初评约 284,250 token，实报低 17.5%。实际请求输出额度均低于预检上限。15 次裁判请求未观察到推理 token 超出请求推理上限。

盲标在本机 `%TEMP%/teacharena/ruler-expand/labeling/ruler-train-score-v1/`。交接时，`blind.md` 含 15 条完整编号对话，`labels.csv` 提供 90 个评分项，`README.md` 为填写说明。机器分数和匿名映射在初评 run 下，标注时不打开。五份文件摘要见本机 `.tmp/scratch/ruler-expand/verify-delivery.log`。标完后交回填写的 CSV，后续在生成 run 下保存 `labels-locked.csv` 并锁定 SHA256，再揭分。[人工盲标协议](scenarios.md#人工盲标协议)引用预登记通过线，说明逐维统计的分母和证据要求。第 3 步尚未开始，保留 `no_teach` 首 4 题至少 3 题评分有效的继续条件。

## E1 S0-06 真实双格

E1 真实结果为两格均有有效总分，`productive_struggle` 为正常格 2 分、`answer_dump` 格 0 分。23 / 14 条引用均可回读，8 份学生请求未检出教师内部标记。正常格首份裁判响应因分数与证据冲突被拒绝，重试通过。历史执行与排查记录保留在 `cd0de52` 的状态文档。运行和检查收据见 [E1 卡](scenarios.md#e1-s0-06-真实双格)。裁判结构化输出故障另见[诊断与复核](judge-structured-output.md)。

## E2 真实运行

| 场景卡 | 结果 |
| --- | --- |
| 谁 | 维护尺子与复核教学行为的人。 |
| 条件 | 干净 HEAD `f8c9db1` 的检查收据记录 49 项通过。同次五格共用 S0-06、学生画像、四轮编排和尺子 `e1-numbered-evidence-v2`。 |
| 能完成什么 | 目标维度区分了两种坏教师。一格同档，一格因裁判故障不可判定。本次 `acceptance: false`，当时 S1 尚未签收。 |
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

### v3 完整真实五格

`e2-real-20261119-06` 在干净 HEAD `20c7056` 执行，检查收据记录 54 项通过。五格同用 S0-06、学生画像、四轮编排、`e1-numbered-evidence-v3`、`judge-output-v2`、`evaluation-identity-v2` 和 `e1-call-policy-v4`。[manifest](../runs/e2-real-20261119-06/manifest.json) · [检查收据](../runs/_receipts/check-20c70569330406372024ef9e57a735e351195475.json)

```sh
node src/cli.mjs --scenario E2 --mode real --estimate-only --id s1-v3-output-v2-full-estimate-20261119-01
node src/cli.mjs --scenario E2 --mode real --confirm-cost --id e2-real-20261119-06 --max-attempts 147 --max-requested-output-tokens 1610112
node src/cli.mjs --verify-run e2-real-20261119-06
```

预检、完整运行和复核均退出 0，`verified: true`、`acceptance: true`。全部 46 条遥测与启动、进程收据和 manifest 一致，PID 为 `74648`。五份发布的裁判正文重放一致，四项目标分档均有可回读引用。[启动收据](../runs/_receipts/e2-real-20261119-06.start.json) · [进程收据](../runs/_receipts/e2-real-20261119-06.process.json) · [评测收据](../runs/_receipts/e2-real-20261119-06.json) · [结果](../runs/e2-real-20261119-06/result.json) · [人工回读](../runs/e2-real-20261119-06/review.md)

五格均为 `execution_success`、`scored: true`、`validTotal: true`。六维顺序与冻结表相同。下表的消息号对应 `e2-real-20261119-06:<格子>:m:<序号>`。

| 格子 | 六维 / 总分 | 目标维度 | 正常 → 本格 / 分差 | 裁判引用回读 |
| --- | --- | --- | --- | --- |
| `normal` | 2 / 2 / 1 / 2 / 2 / 1，合计 10 | 四项对照基准 | 正常对照 | #7 学生列出 BE 方程并问 “Can we just subtract them to get x quickly?” |
| `answer_dump` | 1 / 1 / 0 / 0 / 1 / 0，合计 3 | `productive_struggle` | 2 → 0 / 2 | #2 教师首答推到 `25/13`。正常 #2 先追问垂线的方向和落点。 |
| `lecture` | 1 / 1 / 0 / 0 / 0 / 0，合计 2 | `agency_handoff` | 1 → 0 / 1 | #9 学生复述 #8 的公式和答案，说 “I’m still not totally seeing why it works”。 |
| `sycophant_close` | 0 / 0 / 0 / 0 / 0 / 0，合计 0 | `verification_or_transfer` | 1 → 0 / 1 | #8 教师说 “You’ve completed it”。正常 #4 问哪个坐标表示垂距及其原因，#5 学生给出 x 但仍不确定。 |
| `no_teach` | 0 / 0 / 1 / 0 / 0 / 0，合计 1 | `misconception_repair` | 2 → 0 / 2 | #7 学生仍问 AE 与垂距的区别，#8 教师只说 “Keep going—you can do this!”。正常 #2、#6 解释区别，#9 学生用求出的 x 检验原猜测。 |

预检上限为 147 次尝试和 1,610,112 请求输出 token。实际 46 次请求，含 1 次重试，请求输出额度 581,056。已报输入 29,843、缓存读入 38,016、输出 100,846，合计 168,705 token。另有一次用量未知。[请求日志](../runs/_receipts/e2-real-20261119-06.requests.jsonl)

六次裁判请求的脱敏出站均确认 `reasoning.max_tokens=16384`、`max_tokens=65536`、`provider.require_parameters=true`、`response_format.json_schema.strict=true`。**路由未执行上限**。三次实报推理超过 16,384。

| 格子 | 裁判第 4 轮调用 1 尝试 | 请求总输出 | 实报推理 | 与上限对照 |
| --- | ---: | ---: | ---: | --- |
| `normal` | 1 | 65,536 | 8,532 | 上限内 |
| `answer_dump` | 1 | 65,536 | 未知 | HTTP 200 后流失败，用量未上报 |
| `answer_dump` | 2 | 65,536 | 21,258 | 超 4,874 |
| `lecture` | 1 | 65,536 | 18,386 | 超 2,002 |
| `sycophant_close` | 1 | 65,536 | 7,770 | 上限内 |
| `no_teach` | 1 | 65,536 | 17,717 | 超 1,333 |

尝试 1 的故障为 `provider_failure`，其后一次重试成功。[失败调用原件](../runs/e2-real-20261119-06/answer_dump/calls/judge-4-1-1.json) · [裁判重试原件](../runs/e2-real-20261119-06/answer_dump/calls/judge-4-1-2.json)

### 裁判稳定性验证

在 `00fecc4` 的干净独立检出上，用 `e1-numbered-evidence-v3`、`judge-output-v2` 和 `evaluation-identity-v2` 对 `e2-real-20261119-06` 五格冻结对话重复评分。离线先核对源身份、对话和绑定，外部请求为 0。真实预检每次允许 15 次尝试、983,040 请求输出 token。预登记标准要求三次重复都取得五格有效分数，四项目标方向分别达到 3/3，计入原始 `06` 后达到 4/4。调用级两次重试均失败时停止。

| 重复 | 进程退出 / `--verify-run` 退出 | 有效格 | 请求 / 重试 | 请求输出额度 | 实报输入 / 缓存读入 / 输出 / 合计 | 用量未知 |
| --- | --- | --- | --- | ---: | --- | ---: |
| [r1](../runs/s1-stability-r1-20261119/result.json) | 0 / 0，`acceptance: true` | 5/5 | 9 / 4 | 589,824 | 7,467 / 6,656 / 59,478 / 73,601 | 4 |
| [r2](../runs/s1-stability-r2-20261119/result.json) | 1 / 0，`acceptance: false` | 4/5 | 8 / 3 | 524,288 | 10,814 / 1,536 / 48,260 / 60,610 | 4 |
| r3 | 未启动 | 无 | 0 | 0 | 无 | 0 |

14:04:16 应用重启使任务注册和父进程丢失。`r2` 的 Node 进程 PID `37488` 继续执行并写出完整进程收据，`--verify-run` 退出 0。`r2/no_teach` 第 4 轮裁判调用 1 的三次尝试均收到 HTTP 200，随后触发本地 180 秒超时（180,011、180,015、180,016 ms）。该格为 `infra_failure`、`scored: false`、`validTotal: false`。两次重试耗尽后结束，`r2` 计入结果。`r2b` 和 `r3` 均无启动记录。[r1 进程收据](../runs/_receipts/s1-stability-r1-20261119.process.json) · [r1 复核](../runs/s1-stability-r1-20261119/verify-run.json) · [r2 进程收据](../runs/_receipts/s1-stability-r2-20261119.process.json) · [r2 复核](../runs/s1-stability-r2-20261119/verify-run.json) · [r2 超时原件](../runs/s1-stability-r2-20261119/no_teach/calls/judge-4-1-3.json)

下表中的有分数格均为 `execution_success`、`scored: true`、`validTotal: true`。六维顺序同上。引用来自 `e2-real-20261119-06:<格子>:m:<序号>`，每个有分数格的裁判绑定均可回读。`r2/no_teach` 使用源对话摘录定位，未发布裁判引用。

| 重复 | 格子 | 六维 / 总分 | 正常 → 本格 / 分差 | 原文回读 |
| --- | --- | --- | --- | --- |
| r1 | `normal` | 2/2/1/2/2/1，合计 10 | 基准 | #7 “Can we just subtract them to get x quickly?” |
| r1 | `answer_dump` | 1/1/1/0/1/0，合计 4 | 2 → 0 / 2 | #2 首答给出 `25/13`。 |
| r1 | `lecture` | 1/1/0/0/1/0，合计 3 | 1 → 0 / 1 | #9 “I’m still not totally seeing why it works”。 |
| r1 | `sycophant_close` | 0/0/0/0/0/0，合计 0 | 1 → 0 / 1 | #4 “Yes—just put 5 and you’re done.” |
| r1 | `no_teach` | 1/0/1/0/0/0，合计 2 | 2 → 1 / 1 | #8 “Keep going—you can do this!” |
| r2 | `normal` | 1/2/1/2/2/1，合计 9 | 基准 | #7 “Can we just subtract them to get x quickly?” |
| r2 | `answer_dump` | 1/1/0/0/1/1，合计 4 | 2 → 0 / 2 | #2 首答给出 `25/13`。 |
| r2 | `lecture` | 1/1/0/0/1/0，合计 3 | 1 → 0 / 1 | #9 “I’m still not totally seeing why it works”。 |
| r2 | `sycophant_close` | 0/0/0/0/0/0，合计 0 | 1 → 0 / 1 | #4 “Yes—just put 5 and you’re done.” |
| r2 | `no_teach` | 无 / `null` | 1 → 缺分 / `null` | 源 #8 “Keep going—you can do this!” |
| r3 | 五格 | 未运行 | 未运行 | 同一冻结源，暂无本次裁判绑定。 |

下表的逐格一致率以 `06` 同格同维为基准，重复中实际可比较 9 格，原始 `06` 的 5 格计入后分母为 14。预登记的 15 个重复格仍缺 6 个。目标方向以全部预登记次数为分母，`?` 表示未验证。已得出分差的对照中没有同档或反向。

| 维度 | 重复逐格一致 | 含 `06` 自对照 | 分档波动 | 目标方向 `06 / r1 / r2 / r3` | 重复 / 含 `06` 已证实 |
| --- | --- | --- | --- | --- | --- |
| `misconception_repair` | 7/9 | 12/14 | r1 `no_teach` 0→1，r2 `normal` 2→1 | + / + / ? / ? | 1/3 / 2/4 |
| `support_escalation_and_fading` | 9/9 | 14/14 | 无 | 无预登记对照 | 无 |
| `agency_handoff` | 8/9 | 13/14 | r1 `answer_dump` 0→1 | + / + / + / ? | 2/3 / 3/4 |
| `productive_struggle` | 9/9 | 14/14 | 无 | + / + / + / ? | 2/3 / 3/4 |
| `representation_pivot` | 7/9 | 12/14 | r1、r2 `lecture` 0→1 | 无预登记对照 | 无 |
| `verification_or_transfer` | 8/9 | 13/14 | r2 `answer_dump` 0→1 | + / + / + / ? | 2/3 / 3/4 |

两次重复均发送 `reasoning.max_tokens=16384` 和 `max_tokens=65536`，9 次有报告的推理用量均低于上限。每格的记录按尝试顺序排列，`?` 表示未上报。

r1 未上报用量的四次调用均收到 HTTP 200 后触发本地 180 秒超时，分别为 `lecture` 尝试 1、`sycophant_close` 尝试 1、`no_teach` 尝试 1 和 2。它们都在调用级重试中恢复。r2 另有 `sycophant_close` 尝试 1 的服务流故障，用量未知，尝试 2 成功。以上均为第 4 轮裁判调用 1。

| 重复 | `normal` | `answer_dump` | `lecture` | `sycophant_close` | `no_teach` |
| --- | ---: | ---: | --- | --- | --- |
| r1 | 8,048 | 10,289 | ? / 10,352 | ? / 11,755 | ? / ? / 12,142 |
| r2 | 8,474 | 14,703 | 12,554 | ? / 7,420 | ? / ? / ? |

### 尺子范围和已知问题

当前尺子只覆盖整段公开对话的六维评分，六项等权，合计 0–12。旧 v6 的单轮评价（35%）、规则轨迹指标（16%）、学生变化（25%）和完成乘子 `p` 均未接入。旧版整段裁判层（24%）内的任务义务同样未接入。依据为本机 `%TEMP%\teacharena\ruler-old-vs-new.md` 的静态对照，现行契约见裁判 README。旧 v6 与当前分数采用各自口径回读。[裁判契约](../contracts/judge/README.md)

- **S1。** 整段六维验证固定场景中的四项方向和证据回读。单轮质量、规则轨迹、学习增量和完成状态在当前验收范围之外。
- **第 4 步的反馈边界。** 对 harness 的反馈限于同一尺子和预登记目标的整段分档。轮级退化、规则轨迹、学习增量和完成状态需要各自的诊断证据，才可归因到具体改动。
- **一档余量。** 原始 `06` 中，`lecture` 的 `agency_handoff` 与 `sycophant_close` 的 `verification_or_transfer` 都是 1→0，正常格在这两维为 1。两次重复已有的相应分差均为 1。
- **分档一致率。** `misconception_repair` 和 `representation_pivot` 的逐格一致率最低，计入 `06` 自对照后均为 12/14。
- **路由推理上限。** 完整 `06` 已观察到三次实报超限。两次重复的已知用量均在上限内，另有八次用量未知。
- **`no_teach` 裁判超时。** `05`、`06`、`r1`、`r2` 合计发生 10 次本地 180 秒超时，分别为 3、0、4、3 次，其中 8 次出在 `no_teach`。`06` 的 `answer_dump` 首次裁判尝试在 47,413 ms 因流故障结束。`no_teach` 两次成功调用的实报推理量中位数约为 14,930 token，其他四格合计约为 10,321。按 14 次成功调用的中位换算系数 4.1412 字符/token 估算，8 次 `no_teach` 超时中，4 次在截止前已收到约 34,831–42,330 推理 token，未收到正文。另 4 次已收到约 11,289–17,901 推理 token 和不完整正文。用户提出的假设是 `no_teach` 让裁判推理变多，从而导致超时。因果关系未证实。诊断留待后续查阅。[本地诊断材料](../.tmp/scratch/s1-ruler-v2/judge-timeout-diagnosis.md)
- **分档示例。** 根 README 链接裁判契约。裁判 README 的评分表仍缺系统的逐档示例，目前通用示例和主动权正反例在 `contracts/judge/schema.mjs`。

### S1 场景卡逐栏

**状态：已签收。** 用户在稳定性证据不完整的情况下决定签收。`e2-real-20261119-06` 的四组坏教师在各自预登记维度上均低于 `normal`。`r1` 五格有效，四组方向全部复现。`r2` 四格有效，复现三组方向，`no_teach` 缺分。原先预登记的「三次完整重复」未达成，缺 `r2/no_teach` 和 `r3` 的评分证据。

| 栏 | 已满足 | 还缺 |
| --- | --- | --- |
| 谁 | 接手者按 README 和运行手册执行。复核者可从 manifest、收据、裁判绑定与公开对话回读。 | 无。 |
| 条件 | 完整五格使用干净 HEAD `20c7056`。两次稳定性评分使用 `00fecc4` 的干净独立检出、相同尺子版本和 `06` 的冻结对话。 | 无。 |
| 能完成什么 | E1 真实双格已验收。完整 E2 五格的四项分差为 2 / 1 / 1 / 2。稳定性 r1 复现四项目标方向，r2 复现三项目标方向。 | r2 的 `no_teach` 缺分，r3 未启动，未得到四项方向的 4/4 证据。 |
| 证据 | **真实验证。** E1 `check_distance` 前后 hook 共用 `call_00_USpBHGKKl9qAJd83bH0d7645`，`isError: false`。`06`、r1、r2 的 `--verify-run` 均退出 0，保留原件与回读。**离线复现。** `00fecc4` 的 54 项检查通过，历史两项联合回归通过 15 项。 | 三次完整重复的评分及引用。 |
| 失败可定位 | r2 `no_teach` 的 `misconception_repair` 缺分，定位到第 4 轮裁判调用 1 的尝试 1 至 3，均超时。保留回读、启动与进程收据。 | 超时调用的实报用量未知。 |
| 不算交付 | 签收以完整五格和现有真实复评为依据。保留冻结同档、旧版本和离线原件。 | 三次完整重复仍缺证据，预登记标准保留。 |
