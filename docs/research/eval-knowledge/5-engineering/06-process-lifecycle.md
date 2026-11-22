# 进程生命周期、收据和孤儿进程

## 1. 用 OS 持有整棵进程树的生命周期

**出处** · Microsoft Learn《Job Objects》的 `Managing Processes in Jobs` 与 `Managing Job Objects`，以及 `AssignProcessToJobObject` 和 `Process Creation Flags`。项目事故记录在 `docs/status.md:155-161`。[Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) · [AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject) · [Process Creation Flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)

**具体内容** · 默认情况下，被纳入 Job Object 的进程通过 `CreateProcess` 创建的子进程也加入 job。设置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 后，最后一个句柄关闭时系统终止 job 内进程。被继承或复制的打开句柄会延迟该动作。`CREATE_SUSPENDED` 可在运行应用代码前完成 job 绑定。需要核对已处于宿主 job 的进程能否加入嵌套 job，并检查 breakaway flags 和非标准创建路径。历史上应用重启后丢失任务注册，`r2` 的 Node PID `37488` 继续执行并写出进程收据。

**对 TeachArena 的意义** · 建议由可信启动器选择明确的策略。短任务随所有者消失而结束，由独占 job 句柄落实。长任务如果设计为跨 UI 重启存活，由独立监督进程接管并给重连的 UI 查询 run 状态。先做短任务方案的离线试验，启动父、子、孙三层进程并记录 PID 与创建时间，强杀监督所有者，验证三个身份均不再运行。另测正常退出、分配 job 失败、显式取消和无法写最终收据。启动登记包含 `{runId, runRoot, pid, processCreatedAt, owner, deadline}`。重连时用 PID 与启动时间联合识别，避免 PID 重用时清错进程。当前收据及测试见 `src/run-receipts.mjs:74-115,218-229`、`test/run-receipts.test.mjs:147-169`。

## 2. 复核时同时报告进程证据和评测结论

**出处** · `contracts/artifacts/README.md:5-17`、`src/cli.mjs:22-32`、`src/run-receipts.mjs:134-230`、`docs/status.md:155-161`、`%TEMP%/teacharena/s2-isolation-design.md:3,40-42`。

**具体内容** · 启动收据保存调用身份与进程信息，请求日志用 `requestId` 配对发送边界和响应头。退出收据保存启动记录哈希、PID、HEAD、退出码、请求数和 `acceptance`。进程强杀后若缺收尾收据，核验报 `unfinished`。历史 `r2` 的运行退出 1、复核退出 0，`acceptance: false`。S2 草案把退出码和 `--verify-run` 列作待补，现在已有实现。草案第 3 行的 E2 状态也早于完整五格验收，当前仍待签收的是 S1。

**对 TeachArena 的意义** · 每侧先用 `--verify-run <id> --run-root <该侧根>` 复核启动、请求和进程收据及存在的评测收据，再单独核对 manifest、评价和输入输出。监督器和权限探针提供隔离证据。即使失败运行的写入探针满足预期，正式 S2 仍须符合场景卡要求的双侧运行退出 0。恢复后若只有启动收据，先查任务仍在运行、已被硬杀、还是无法确认。重跑用新 ID 引用前次 ID 和已发生的费用，保留原日志。`docs/scenarios.md:57-61,83-87`，`docs/runbook.md:7-21`。

## 3. 对照的可复现性按三种运行方式讲清楚

**出处** · `docs/runbook.md:7-21`、`src/real-preflight.mjs:9-49`、`src/run.mjs:57-116,119-174`、`contracts/artifacts/README.md:13-17`。

**具体内容** · 离线 provider 与真实模式走同一编排。真实运行要求干净 HEAD 对应的检查收据。manifest 身份哈希包含任务、尺子、配置预算、包版本、源文件和路由等，run ID 与进程另记。`--judge-only` 校验源并读取冻结公开对话，保存源身份、manifest 和对话哈希，随后新建 run 调用裁判。历史裁判正文兼容解析另走回读路径。冻结输入可以重评，服务端实时采样仍可能变动。

**对 TeachArena 的意义** · 面试时分别举三个可验证动作。离线回归锁住编排。`--judge-only` 固定输入、重新采样裁判。旧运行只读复核用于证明证据链。解释 S3 双侧冷启动时，带着源哈希、预检收据、首请求和各侧 `--verify-run` 回读，最后保存成对证据供人工核对。两侧只允许预登记的 harness 资产差异。`docs/scenarios.md:57-61,70-87`。
