# 当前状态

项目处于 [S1 稳定的环境](scenarios.md#s1-稳定的环境)。

文档重组待独立审查。提交前审查服务连接超时，审查由后续会话接手。

| 场景 | 状态 | 证据入口 |
| --- | --- | --- |
| E1 S0-06 真实双格 | 已验收 | `git show cd0de52:docs/status.md`。运行和检查收据见 [E1 卡](scenarios.md#e1-s0-06-真实双格)。 |
| E2 四个坏教师自检 | 真实验收未通过 | `answer_dump` 与 `sycophant_close` 在五格运行中区分成功。`no_teach` 冻结对话补评为 0 分，正常格为 2 分。`lecture` 仍同档。 |
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

### S1 场景卡逐栏

| 栏 | 已满足 | 还缺 |
| --- | --- | --- |
| 谁 | 接手者可按 README 和运行手册运行，复核者可从 manifest、进程收据、裁判绑定与公开对话回读。 | 无。 |
| 条件 | E2 五格固定 S0-06、学生画像、尺子及评测身份。补评使用原格冻结对话，并绑定源裁判视图。 | 原五格中的 `no_teach` 没有有效分档。补评分档来自单列运行。 |
| 能完成什么 | E1 双格已验收，`check_distance` 已验证。E2 同次区分 `answer_dump` 和 `sycophant_close`，补评得到 `no_teach` 的目标维度差值。 | `lecture` 的 `agency_handoff` 仍为 1 对 1。E2 缺少满足全部条件的同次五格结果。 |
| 证据 | **真实验证。** E1 正常格第 3 轮 `check_distance` 前后 hook 的 `toolCallId` 均为 `call_00_USpBHGKKl9qAJd83bH0d7645`，后置 `isError: false`。E2 和补评的 `--verify-run` 均退出 0。**离线复现。** S0-01 答案键、截断与额度拦截的联合回归退出 0，15 项通过。`npm run check` 退出 0，50 项通过。 | 同次五格的真实验收证据及 `lecture` 目标分差。 |
| 失败可定位 | 原 `no_teach` 超时已定位到第 4 轮裁判调用 1 的三次尝试。`lecture` 同档已定位到正常 #2、#4、#6、#7、#9 和讲授 #2、#9。 | 供应商延迟根因和讲授同档的主因仍待确定。 |
| 不算交付 | 保留各轮原始分档、故障、引用及收据。旁证使用原始维度和消息。 | 按场景卡仍需同次四项目标对照成立，S1 保持进行中。 |
