# Artifacts

[产物 schema](schema.mjs) 定义 run ID、文件名和格子结果。分数有效性由[裁判契约](../judge/README.md)定义。产物路径见[运行手册](../../docs/runbook.md)。

## 评测身份

`manifest.json` 的 `identityId` 对 `{ mode, scenario, identity }` 求哈希。`identity` 包含数据修订、任务原件与部署策略哈希，尺子版本，调用策略及实际额度上限，运行器与 pi 版本，角色路由（离线为 `pi-ai-faux`），以及依赖锁、配置、编排、教师、裁判、离线提供商和各契约 schema 的源码哈希。E2 另记目标维度和其配置源码哈希。只裁判运行另记来源 run、格子及对话哈希。路由中的 `key` 是环境变量名。任务 `taskId`、run ID、写入进程和检查收据由 manifest 单列，复核时也需核对任务与产物归属。

同一尺子的对照须锁定其余评测条件。改进对照预登记允许变动的 harness 源码和资产，逐字段核对两侧 manifest，只放行这些变化及其派生哈希。当前 `identityId` 包含教师源码哈希，变更 harness 后应保留两侧各自的身份。要纳入新提示文件或工具配置，应证明其内容已进入来源证据。历史 v6 的运行锁、学生变化排除快照及端点指纹不能从现行字段推定。
