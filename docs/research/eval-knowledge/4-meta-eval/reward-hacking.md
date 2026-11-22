# Goodhart 与 reward hacking

## 常量输出能拿到高自动评测分

**出处** Xiaosen Zheng、Tianyu Pang、Chao Du 等，*Cheating Automatic LLM Benchmarks: Null Models Achieve High Win Rates*，2024 预印本，2025 修订，摘要及 §4、§6。[原文](https://arxiv.org/html/2410.07137)

**具体内容** 研究者用与题目无关的固定响应做压力测试。针对各自动评测构造的 null model 分别达到 AlpacaEval 2.0 长度控制胜率 86.5%、Arena-Hard-Auto 83.0、MT-Bench 9.55。该结果来自刻意构造的攻击实验。它展示了高评分可能和题目适配、回答正确性脱钩。

**对 TeachArena 的意义** 把固定鼓励扩成不同题目与学生状态共用的零能力对照。再给同一低质量教学段加纯风格强化或自评话术，由人确认教学证据没变。每对保存人工是否认同和裁判升档数。要求能引用真实课堂行为链，人工复核做语义核验。已有 `no_teach` 是很好的起始样例，单题四个坏教师命中只能覆盖现有四个退化。见 `contracts/judge/README.md:25–28,30–43`。

## 风格替代教学质量是可测试的代理偏差

**出处** Yann Dubois、Balázs Galambosi、Percy Liang、Tatsunori B. Hashimoto，*Length-Controlled AlpacaEval: A Simple Way to Debias Automatic Evaluators*，COLM 2024，§3–4、图 3。[原文](https://arxiv.org/html/2404.04475)

**具体内容** 改 GPT‑4 Turbo 的答复详略指令，原始胜率在 22.9% 到 64.3% 间变动。作者用逻辑回归估计两份答复长度差为零时的胜率。长度控制后分数仍有变动，但该模型跨三种详略指令的胜率归一化标准差从 25% 降到 10%。

**对 TeachArena 的意义** 先做语义保持的长度配对和编辑前后人工确认。冗长本身有时会改变教学，只有机会、提示、独立推理与核验均保留的对子才做 INV。将差异记成 `法定档变动 / 人工档变动` 两列，另列证据是否支持。若裁判只随措辞升分，优先审这组边界，不把其他场景的回归校正公式直接接进计分。

## 优化强度增加时追踪人评与代理分的分叉

**出处** Leo Gao、John Schulman、Jacob Hilton，*Scaling Laws for Reward Model Overoptimization*，ICML 2023，§2–3、图 1 的合成设定。[原文](https://arxiv.org/html/2210.10760)

**具体内容** 作者以大型 gold reward model 生成标签训练较小的 proxy reward model。图 1 固定 policy 为 1.2B，改变奖励模型大小，再逐步加大 RL 或 best-of-n 的优化强度。强优化下 proxy 可以继续升高而 gold reward 下降。Gold 在该实验里是模拟奖励，应用到人评需要独立测量。

**对 TeachArena 的意义** 每次用裁判选择教学改动后，留一批独立冻结的人评对照。按版本画同一批样例上的裁判平均差与人工平均差，逐维列「裁判升、人工平或降」比例。对照超过一档的直接冲突优先做证据审读。优化可见集与最终人评集隔离，所有对照都保存共同身份和原文绑定。见 `docs/scenarios.md:83–87`。
