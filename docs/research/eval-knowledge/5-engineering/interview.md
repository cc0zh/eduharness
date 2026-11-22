# 面试题原文与 TeachArena 答题锚点

题目来自已读的公开题库。优先收录题库标为 `AI Engineer 75` 或 `Most asked` 的工程问题，再补超时、身份和幂等。题库排序用于复习优先级，具体公司是否提问和实际频率未核实。章节后的 `文件:行号` 对应 `D:/Code/eduharness` 的 HEAD `d88471d2e2ee34bf9fba8bf5a08dd14bbba4d414`。[AI Engineer 75](https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/AI-ENGINEER-75.md) · [ByteCamel SRE 题库](https://www.bytecamel.com/interview-questions/site-reliability-engineering)

## 1. LLM 调用日志与证据链

**出处** · ombharatiya，《AI Engineer Interview Questions》，`07-evaluation-and-observability/questions.md` 第 8 题。[题库原文](https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/07-evaluation-and-observability/questions.md#8-what-should-you-log-for-every-llm-call-in-production-and-what-are-the-pitfalls)

**具体内容** · 原题 “What should you log for every LLM call in production, and what are the pitfalls?”

**对 TeachArena 的意义** · 我会画 `runId → callId → requestId`，讲角色、轮次、调用与 attempt，发送前记录 `request_start`，收到响应头或传输失败后记 `request_end`，并关联脱敏调用原件、用量和退出收据。`r2` 的运行退出 1，`--verify-run` 退出 0，说明收据和请求日志一致。三次 200 后超时可在调用原件或遥测中核对。缺口是缺少独立的流终态时间和可对账 generation ID 的证据。`src/run-receipts.mjs:117-131,134-230`，`src/models.mjs:102-214`，`docs/status.md:155-161`。

## 2. 评测版本的最小集合

**出处** · ombharatiya，同上第 12 题。[题库原文](https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/07-evaluation-and-observability/questions.md#12-why-do-you-version-an-eval-dataset-and-what-exactly-belongs-in-the-version)

**具体内容** · 原题 “Why do you version an eval dataset, and what exactly belongs in the version?”

**对 TeachArena 的意义** · 我会先给 task 原件修订和哈希，再给评测身份中的部署策略、尺子、pi/运行器、路由、预算与源码哈希。身份含 `{mode, scenario, identity}` 的哈希，run ID 标记一次执行。冻结重评另绑定源 manifest 与每段公开对话哈希。若候选改动了预登记的 harness，检查实际变化字段。实际供应商模型快照是否能锁定是缺口，需记录 provider/endpoint 及可获得的服务版本。`contracts/artifacts/README.md:13-17`，`src/run.mjs:57-116`，`docs/scenarios.md:83-87`。

## 3. 500 条失败 trace 如何决定先改什么

**出处** · ombharatiya，同上第 27 题，列入 `AI Engineer 75`。[题库原文](https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/07-evaluation-and-observability/questions.md#27-you-have-500-production-transcripts-flagged-as-failures-walk-me-through-your-error-analysis-process)

**具体内容** · 原题 “You have 500 production transcripts flagged as failures. Walk me through your error-analysis process.”

**对 TeachArena 的意义** · 我会按角色、格子、失败阶段抽取 trace，先写首个问题的自由文本，再归类，最后按受影响格数与尝试数排序。`r2/no_teach` 是三个失败尝试、一个无有效分数的格子。从 `requestId` 回到该次 `callId` 及对话，分别记录交付故障和教学结果。缺口是没有 500 条生产数据或已交付故障分类账本。可补可复查的小型工程分类表，保留案号、首次故障、证据和复核人。`docs/runbook.md:23-36`，`docs/status.md:151-161`。

## 4. 安全重试如何避免级联和重复费用

**出处** · ByteCamel《Site Reliability Engineering interview questions》，标 `Most asked`。[题库原文](https://www.bytecamel.com/interview-questions/site-reliability-engineering/3235-how-should-clients-retry-failed-requests-safely)

**具体内容** · 原题 “How should clients retry failed requests safely?”

**对 TeachArena 的意义** · 我会讲关闭 SDK 重试，wrapper 至多再试 2 次。所有尝试发送前预留完整输出额度。区分暂时性失败和裁判语义纠错。HTTP 200 后的 abort 仍可能计费。改进方案是单层分类重试、`Retry-After` 加 jitter，受剩余 deadline 和预算约束。缺口是没有端到端供应商幂等或未知账单去重的证据，需验证路由是否提供幂等语义并保存 provider generation ID。`config/e1.mjs:3-12`，`src/models.mjs:11-18,102-214`，`docs/status.md:136-149,155-161`。

## 5. 如何选超时并传递 deadline

**出处** · ByteCamel 同题库第 28 题。[题库原文](https://www.bytecamel.com/interview-questions/site-reliability-engineering/3236-how-do-you-choose-timeouts-and-what-is-deadline-propagation)

**具体内容** · 原题 “How do you choose timeouts, and what is deadline propagation?”

**对 TeachArena 的意义** · 现有普通 120 秒、裁判 180 秒的 attempt 时限。用三次 200 后 180 秒解释响应头和总尝试时限的区别。我会记录首有效事件与流进展，按路由和推理量看端到端耗时及截尾样本，再从误超时目标决定时限和下游可用剩余时间。缺口是未取得有效的尾延迟样本或 run 级 deadline；需先用长流和心跳构造离线故障注入，再在批准额度内采集分阶段延迟。`config/e1.mjs:3-12`，`src/models.mjs:102-214`，`src/run-receipts.mjs:117-131`，`docs/status.md:161`。

## 6. 前缀缓存怎样降成本

**出处** · ombharatiya，《AI Engineer Interview Questions》，`08-inference-and-production/questions.md` 第 9 题，列入 `AI Engineer 75`。[题库原文](https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/08-inference-and-production/questions.md#9-what-is-prompt-prefix-caching-and-why-is-it-one-of-the-biggest-cost-levers-available)

**具体内容** · 原题 “What is prompt (prefix) caching, and why is it one of the biggest cost levers available?”

**对 TeachArena 的意义** · 我会讲缓存相同 token 前缀的供应商计算，仍重新采样回复。`06` 已报缓存读入 38,016 token，另有 1 次用量未知。应用内完整响应缓存若混入新抽样，会复用旧裁判输出，故 S2 两侧私有缓存且新抽样注明模式。缺口是没有供应商账单对照或缓存节约金额证据。需采集端点、generation ID、缓存读写和总费用。`docs/status.md:136-149`，`docs/scenarios.md:57-61`，`src/run.mjs:57-99`。

## 7. A/B 平台如何证明两侧可比

**出处** · ombharatiya，《FAANG / MAANG+ Most Recently Asked Coding Interview Questions》，公开汇编表中的条目。SysDesignPrep 同类公开模拟题规模为同时运行 500 个实验，覆盖 300 M 用户，页面更新 2026-10-26。[题库原文](https://github.com/ombharatiya/FAANG-Coding-Interview-Questions/blob/main/FAANG-Recent-Questions.md) · [模拟题](https://sysdesignprep.com/q/ab-testing)

**具体内容** · 原题 “Design a real-time A/B testing platform”。公开模拟题要求稳定分流、记录实际曝光、用包括控制组在内的曝光数据计算指标。

**对 TeachArena 的意义** · 我会先解释离线 S3 的成对执行。用 `{roundId, taskId, replicate, side}` 绑定两侧执行，冻结任务和评测身份，明确唯一变更，记录真实路径、交叉探针、首请求、退出码与消息证据。两侧身份或证据不满足条件时结论为不可判定。缺口是 S2/S3 尚待验收，也没有题目规模下的线上流量分流、曝光流或指标服务。先补 S2 探针和至少两轮 E5；若继续设计线上版本，再说明 assignment 和 exposure 事件。`docs/status.md:7-12`，`docs/scenarios.md:50-87`。
