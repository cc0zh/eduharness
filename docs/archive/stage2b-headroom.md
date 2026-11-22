# 阶段 2b 开发集余量检查

`stage2b-headroom-real-01` 收齐 48/48 格，验真通过。旧线性 `normal` 分别和默认学生、顽固误解型、伸手要答案型在 8 题上从头对话两遍。每格 4 轮、9 条公开消息。两个高压画像沿用阶段 2a 甲组，不含假装懂了型。评分使用[带边界采用的 v3](stage1-closeout.md#评分入口与身份)，运行的 `acceptance: true` 只表示收齐判决，不是采用线。

## 输入与收据

原运行只加载了与 manifest 匹配的 8 道 dev 题，4 个家族各两题，均经 `readTask` 校验。manifest SHA256 为 `b6650ca5b87e84740a2e2f17340bbc472f697cbd2bb75e407d57e6d539ffe677`。原运行未用备份，未打开、列举或哈希任何 `sealed` 文件，未读训练标签。现行默认位置为 `D:\Archive\teacharena\stage2-holdout\dev`。

原方法登记（`runs/stage2b-headroom-real-01/preregistration.md`） SHA256 `b820f7360bf23399e5c9aadf102d0b8359f690247c88bec75892f02211f7d8c9`。路径附录（`runs/stage2b-headroom-real-01/preregistration-addendum-path.md`） SHA256 `18e764fd389caed3f7b3d00223866b01a16520f41f7c40ec52b7e4967031f194`，先锁后预检，只补路径、manifest SHA 和 dev 清单。口径和额度不变。

干净 `75af195bb684a91bb7b112130f5486b022a00bb7` 的 check 收据（`runs/_receipts/check-75af195bb684a91bb7b112130f5486b022a00bb7.json`） 为 350 项通过。`stage2b-headroom-estimate-01` 预检（`runs/stage2b-headroom-estimate-01/estimate.json`） 退出 0、0 请求，与正式运行身份一致。正式运行的 `identityId` 为 `296fdded7ce13f1f658c8c2c1bd0fbe2937dbb7e755711dcaad36fddc73d8626`，`judgeFingerprint` 为 `4a558e6086f8ce2a4250ee63c6133a76978d329dbceacfdc3f1679731eae0849`。

正式验真（`runs/stage2b-headroom-real-01/verify-run.json`） `verified: true`、退出 0。单进程 PID `42464`，已退出；启动、结束、manifest、674 份调用原件和遥测的 PID 一致。并发峰值 4，无降档、无停线。实发 **674 / 2,592** 次，预留及实发请求输出额度均为 **2,992,304 / 11,999,232** token。提供方实报总量 **1,022,836** token，无总用量缺报；128 条关闭推理的学生请求未报推理用量，不补零。PID 与逐角色用量（`runs/stage2b-headroom-real-01/pid-usage-check.json`）

674 次由 672 次常规请求、一次教师工具续调用及一次支持维重试组成。`r2:TA2B-F12-B:answer-seeker:judge:4:2:1` 的 S0 引用 #9，已无后续教师消息；本地拒收后，`:2` 改引 #3，成功结算。没有失败格或缺判。

## 六维余量

| 维度 | 适用 / 观测 | 适用均分 | 实得 / 满分 | 失分合计 | r1 / r2 失分 | 含 N/A 两遍同档 | 历史同输入分档翻转 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 误解修复 | 48/48 | 1.333 | 64/96 | 32 | 14/18 | 16/24 | 0/99 |
| 增加与撤去支持 | 39/48 | 0.487 | 19/78 | 59 | 31/28 | 10/24 | 22/89 |
| 交还主动权 | 48/48 | 1.021 | 49/96 | 47 | 23/24 | 23/24 | 0/99 |
| 保留有益试错 | 48/48 | 2.000 | 96/96 | 0 | 0/0 | 24/24 | 0/99 |
| 表征转换 | 8/48 | 1.500 | 12/16 | 4 | 4/0 | 18/24 | 15/99 |
| 验证或迁移 | 48/48 | 1.875 | 90/96 | 6 | 2/4 | 21/24 | 0/99 |

按画像的适用率、均分、失分空间、两遍一致率和逐格分档见完整统计（`runs/stage2b-headroom-real-01/headroom-report.md`）。逐题 JSON（`runs/stage2b-headroom-real-01/headroom.json`） 记录每题布尔、引用消息 ID 及 `callId`。失分只在适用格计算；`N/A` 不是 0。24 对的公开角色和正文哈希全都不同。两遍分差混合生成与判定波动，不是同输入裁判误差。

支持维和表征维历史已见分档翻转，差异可能含裁判噪声；表征维仅 1 对双侧适用，`1/1` 同档不能证明稳定。误解修复的 M2 历史翻转 12/99，未改变那批分档。本轮三组画像间误解修复的最大均分差为 0.625，低于两遍平均绝对分差 0.667，不声称该维区分画像。

## 阶段 3 候选，不作选择

| 候选 | 适用覆盖 | 两遍失分 | 两遍同档 | 历史分档翻转 | 原件依据 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| **交还主动权，重点看 A2** | 48/48 | r1 失 23，r2 失 24 | 23/24 | 0/99 | A1 48/48 Yes，A2 仅 1/48 Yes。`r1/TA2B-F18-A/default` #7/#9 由学生提出并实际检验偶数项列表；`r2` #8 指定替换操作，#9 按指定方法做。回读两遍 `TA2B-F18-A:default:judge:4:3:1`。 |
| **误解修复，保留为备选** | 48/48 | r1 失 14，r2 失 18 | 16/24 | 0/99 | 16 个零分均由 M1=No 触发，M2 在 48 格均为 Yes。`TA2B-F09-A/answer-seeker` 两遍均为零分。#2 先提示数交换，#3 学生推出 24 g 对应三组；明确辨析在 #4。回读两遍 `TA2B-F09-A:answer-seeker:judge:4:1:1`。有空间，但不能把所有零分解释为未修复。 |

支持维失分最多，但两遍同档仅 10/24，历史分档翻转为 22/89，先作诊断。保留有益试错在本批封顶。表征转换适用少，验证或迁移余量小，均不列主目标候选。

**A1 跟算边界。** `r2/TA2B-F01-B/stubborn` 的 #4 已给两种周长及双计依据，#5 先做 `48−36` 再套到原题，却仍被判 A1=Yes #5。不能把稳定的 A1 直接解释为自主推理；候选依据聚焦 A2 是否由学生发起并完成。不重标。A1 原件（`runs/stage2b-headroom-real-01/r2/TA2B-F01-B/stubborn/calls/judge-4-3-1.json`）

**V1 事后话术边界。** 三个零分格均为 V1=No，分别是 `r1/TA2B-F01-B/default`（`runs/stage2b-headroom-real-01/r1/TA2B-F01-B/default/judge.json`）、`r2/TA2B-F09-A/answer-seeker`（`runs/stage2b-headroom-real-01/r2/TA2B-F09-A/answer-seeker/judge.json`） 和 `r2/TA2B-F18-A/answer-seeker`（`runs/stage2b-headroom-real-01/r2/TA2B-F18-A/answer-seeker/judge.json`）。本轮没有做话术扰动，不能从这些格反推话术导致漏判。`TA2B-F09-A/answer-seeker` 的 r1 #4 换了称量数值，#5 独立给出 6 g；r2 #4 要学生复算原题，且已给 `3(X−Y)`。这个差异有公开行为依据。历史话术漏判仍保留，不用本批均分宣布修复。r1 原件（`runs/stage2b-headroom-real-01/r1/TA2B-F09-A/answer-seeker/calls/judge-4-6-1.json`） · r2 原件（`runs/stage2b-headroom-real-01/r2/TA2B-F09-A/answer-seeker/calls/judge-4-6-1.json`）
