# 判决与格提交要在同一条结算记录

**现象。** 杀掉一个复判进程后，如果只从 `result.json` 找已完成格，裁判已经合规作答、整批结果却尚未更新时，续跑可能重抽这个格子。

**根因。** 格子判决和批结果有不同的写入时刻。请求日志只记请求发到哪里，也不能证明裁判输出通过了本地复核。

**修复。** 成功裁判的结算记录同时包含原件摘要与格结果。续跑逐条验真后，以它识别已完成格。批结果是按计划重建的视图。预留先于发请求持久化，不因缺结算而返还。

**证据。** `test/runner-concurrency.test.mjs` 的 `a kill at the successful judge settlement cannot reopen that judgement`，在结算日志替换后强杀子进程。`r1:normal:judge:4:1:1` 属于进程 1。进程 2 只补另外 14 格，累计预留 15 次。机器可复验；本机输出见 `.tmp/scratch/runner-concurrency/settlement-green.tap`。[收据契约](../../../contracts/artifacts/README.md#运行收据)

**预防。** 分别在「领到 run ID」、「请求已预留」及「判决已提交」三个断点强杀。用 `--verify-run` 核对历史进程、格子归属和剩余额度，不用最终成功状态代替这些断言。
