# 模型目录能解析不等于审核路由可访问

**现象。** 阶段 2a 预检解析了 `openrouter/openai/gpt-4.1-mini`，并核对所需环境变量存在。正式运行四次学生生成均成功。第一组 AI 审核连续三次 HTTP 403，停止时四条已有学生回复均无合规审核。

**根因与边界。** 事故点是实际审核请求收到拒绝。目录、配置、密钥存在和零请求预检都不是服务端准入证据。现存原件不足以判定 403 来自账号、路由、地区还是代理，不把它归为学生画像或审核 JSON 故障。

**证据。** `runs/_receipts/stage2a-hard-learners-estimate-02.process.json` 为零请求。`runs/_receipts/stage2a-hard-learners-01.requests.jsonl` 的末三对事件均为 403。`runs/stage2a-hard-learners-01/r1/S0-01/stubborn/telemetry.json` 的 `fidelity_audit` 三次尝试没有用量或正文。[阶段 2a 状态](../../archive/status-log-2026-11.md#stage2a-hard-learners)

**现状。** 达到同类故障停线。保留正式 run，不换路由续跑，不让无审核的草稿通过画像判线。

**预防。** 对新审核运行，先将同路由的一条无敏感信息的合规输出冒烟单列预算并授权。把冒烟放在付费生成之前。冒烟只证明当次路由返回了合规正文，不参与保真判线。报告区分目录解析、真实权限、输出校验和行为结论。

**后续。** 用户另行授权新 run。当前凭据的 `/key` 与账户过滤 `/models/user` 均 200，旧模型空输入探测在参数校验阶段返回 400。不能据此反推旧 403。`stage2a-hard-learners-02` 用 Qwen 235B 2507 的 Parasail FP8 端点完成 12 次合规审核，中间两次 429 后恢复。该结果证明新路由当次能用，不定位旧路由拒绝源。重跑报告（`runs/stage2a-hard-learners-02/hard-learner-fidelity-report.md`）
