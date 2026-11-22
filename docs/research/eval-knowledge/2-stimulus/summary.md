# TeachArena 评测刺激调研摘要

本调研覆盖题卡、模拟学生和对话原件。E1/E2 的真实覆盖是 S0-06 及其一个学生画像，E2 共五个教师条件，每格四轮。历史开发、保留、排除各有 65、28、7 题。冻结源能还原公开对话文本。现场学生生成目前靠画像提示约束，单键 JSON 只检查格式。证据见 `docs/status.md:98`、`docs/status.md:116`、`data/s0-v1.json:10`、`src/run.mjs:143`、`contracts/learner/schema.mjs:3`。

## 缺口、借鉴与代价

代价是工作量拆分。条数均为建议起始配额。估算只涵盖该行所写工作。

| 缺口 | 可借鉴做法 | 出处 | 实现代价 |
| --- | --- | --- | --- |
| 只能从提示判断学生是否遵守知识边界 | 首先固定题、错因和公开前缀，跑针对、错位、泛化、仅鼓励四种条件。人工回读报答案和关键知识的首次跃迁 | [Do 等，SFS](https://arxiv.org/html/2605.12748)。[τ²-Bench 用户约束](https://arxiv.org/html/2506.07982v1)。`src/run.mjs:149` | 低到中。先用 S0-06 的 4 个前缀各 3 次，共 12 条学生续答。再决定是否修改学生状态契约 |
| 没有真人对照，听起来像学生可能掩盖错因偏差 | 用相同前缀对比真人与模拟续答。分别记录匿名来源辨别、错因匹配、无支撑改答 | [Scarlatos 等，382 条真人测试对话](https://arxiv.org/html/2601.04025)。[MathDial 图 3](https://arxiv.org/html/2305.14536) | 中。先找有授权的 12 个真人参考前缀，由两人独立复核。成人试读可筛题，与目标学生样本分别报告 |
| 真实覆盖只有 1 题 × 1 画像 | 各选几何、代数、比例应用的基础和多步题。每题配两种相容知识画像 | [Anthropic 20 至 50 题起步](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)。[MathDial 附录 B](https://arxiv.org/html/2305.14536)。[Eedi 诊断题方法](https://arxiv.org/html/2007.12061)。`docs/status.md:116` | 中。先做 6 题、12 场景、每教师条件 36 条轨迹，另需题目参数化和教师复核 |
| 28 道保留题源于公开题库，当前未执行 | 保留工程回归。另做 6 道原创私有题，每个题型难度格 1 道。检查题族重叠，锁定来源、首次公开日和版本 | [HLE 私有试题](https://arxiv.org/html/2501.14249)。[LiveBench §2.7](https://arxiv.org/html/2406.19314)。`data/README.md:3` | 中。独立出题、双人校对和访问隔离。和 24 道开发题合计 30 题，每教师条件 180 条轨迹，含每场景 3 次生成 |
| 冻结可以还原对话，在线学生生成仍有波动 | 沿用对话哈希。额外保存冻结学生前缀、模拟器请求参数、模型版本和供应商可回传的采样信息 | [OpenAI seed 笔记本](https://raw.githubusercontent.com/openai/openai-cookbook/main/examples/Reproducible_outputs_with_the_seed_parameter.ipynb)。`src/run.mjs:57`。`src/models.mjs:141` | 低到中。复用现有原件。增加学生单步回放入口需要实现与回归测试 |

## 建议先做三件事

1. 用 S0-06 的四种固定教师前缀测一次学生自行跳解。先看 12 条续答。按消息定位首个无支撑知识跃迁，再决定状态限制。 [SFS 反馈对照](https://arxiv.org/html/2605.12748)
2. 从开发集补出 6 道审核题，覆盖三类题型与两档难度。每题配两种知识画像，并把 12 个场景版本化。 [题集起步方法](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) 与 `data/s0-v1.json:5`。
3. 留出 6 道私有原创题，并收集可授权的真人参考前缀。在扩跑前检查题族重叠和模拟错因。 [HLE 私有题库](https://arxiv.org/html/2501.14249) 与 [真人前缀研究](https://arxiv.org/html/2601.04025)。

## 文件导航

- [模拟学生效度](01-simulator-validity.md)
- [题集设计](02-task-set-design.md)
- [覆盖配额](03-sample-size.md)
- [污染和饱和](04-contamination-and-saturation.md)
- [对话回放](05-dialogue-reproducibility.md)
- [面试原题和项目追问](interview.md)

仓库行号对应 HEAD `00fecc40f4fbab028327a16b08c4f9facbe35f08`。外部数字来自链接中的原文或官方数据说明。旧 `answer_dump` 的 0.77 来自任务背景，旧运行原件未读。试点题量和条数为本次调研提出的执行配额。
