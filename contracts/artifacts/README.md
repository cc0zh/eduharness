# Artifacts

[产物 schema](schema.mjs) 定义 run ID、文件名和格子结果。分数有效性由[裁判契约](../judge/README.md)定义。产物路径见[运行手册](../../docs/runbook.md)。

## 运行收据

`src/run-receipts.mjs` 写入 CLI 启动记录、请求日志和进程收据。每次评测或估算启动在首次外部请求前原子写入 `<run-root>/_receipts/<id>.start.json`，并创建仅追加的 `<id>.requests.jsonl`。`fetch` 前记录 `request_start`，收到响应状态或传输失败后记录 `request_end`。两条记录用 `requestId` 配对，`callId` 指向格子、角色、轮次、调用及尝试。日志只保存标识、时间、状态码和故障分类。

退出时原子写入 `<id>.process.json`，保存启动记录哈希、退出码、HEAD、结束时间、请求计数和 `acceptance`。`acceptance: null` 表示没有评测结果。捕获 SIGINT 和 SIGTERM 时分别记录 130 和 143。Windows 的 `child.kill('SIGTERM')` 属于直接终止。强杀后收据缺失时，复核报告「未正常收尾」。`requestCount` 计入已记下发送边界的请求，包括传输失败。只有 `request_start` 时，无法确认该请求是否送达。已有评测收据 `<id>.json` 仍保存评测结果。

`node src/cli.mjs --verify-run <id>` 只读这三类进程原件，以及存在时的评测收据和关联产物。缺原件、字段不完整、请求起止不配对或收据字段矛盾时返回非零并列出缺失项。测试评测收据按有效总分格同时锚定对话与裁判 JSON 字节哈希。历史运行没有这些新原件时如实报告缺失，不回填。

## 评测身份

`manifest.json` 的 `identityId` 对 `{ mode, scenario, identity }` 求哈希。`identity` 包含数据修订、任务原件与部署策略哈希，尺子版本，调用策略及实际额度上限，运行器与 pi 版本，角色路由（离线为 `pi-ai-faux`），以及依赖锁、配置、编排、教师、裁判、离线提供商和各契约 schema 的源码哈希。E2 另记目标维度和其配置源码哈希。只裁判运行另记来源 run、格子及对话哈希。路由中的 `key` 是环境变量名。任务 `taskId`、run ID、写入进程和检查收据由 manifest 单列，复核时也需核对任务与产物归属。

未见题测试的 `identity.freeze` 保存冻结决定、尺子来源、训练参考收据、预登记和清单哈希。测试 `identityId` 不沿用训练身份。`result.json` 在每格结束后更新，最终由评测收据锚定。`sentinel` 记录 `no_teach` 首四格的进展及继续决定；`stop` 记录故障题或预算停止条件。测试 run 的 `acceptance` 只表示所有计划格都返回有效总分，通过线另见测试报告。

同一尺子的对照须锁定其余评测条件。改进对照预登记允许变动的 harness 源码和资产，逐字段核对两侧 manifest，只放行这些变化及其派生哈希。当前 `identityId` 包含教师源码哈希，变更 harness 后应保留两侧各自的身份。要纳入新提示文件或工具配置，应证明其内容已进入来源证据。历史 v6 的运行锁、学生变化排除快照及端点指纹不能从现行字段推定。

`S1-binary` 使用 `evaluation-identity-v3`，绑定候选尺子源码、预登记哈希、源 manifest 和五份对话哈希。格子坐标为 `<遍次>/<条件>`。格子的 `scoring` 记录逐维分数和适用集合、`points`、`possible` 与 `rate`。裁判故障格无 `scoring`。运行的 `acceptance` 表示拿齐计划内有效分率；`assessment.passed` 才是预登记方向判线，另存于评测收据的 `passed`。`--verify-run` 核对启动、进程、manifest 和遥测 PID，锚定并重放判决、调用和各格对话。[二元尺子契约](../judge/binary.md)
