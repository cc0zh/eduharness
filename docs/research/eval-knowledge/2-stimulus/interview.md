# 面试追问：题目、模拟学生与对话从哪里来

题号引用可公开核对的题库原文。研究问题和 TeachArena 项目追问另行标记。公开备考题库能核对措辞，实际出题频率未核实。下文的仓库行号以 `00fecc40f4fbab028327a16b08c4f9facbe35f08` 为准。

## 1. 你怎么建立并维护一套评测题？

**出处**　AI Engineer Interview Questions，Cheat sheet #15。https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/CHEATSHEET.md

**具体内容**　原题：“How do you build and maintain an eval set for an LLM feature?” 项目追问：“只有一道题，怎么说明问题？”

**对 TeachArena 的意义**　可答：“我先用一个可回读的已知故障场景做验收。E2 的五个教师条件共用 S0-06、同一画像和四轮，能核查这一个输入场景。上游原件锁定版本，另有 65 道开发题和 28 道保留题的划分记录。S0-01 现有证据是答案键回归。” **缺口**　扩充真实覆盖。先按题型和难度各挑一道组成 6 题试点，再扩到 24 道开发题及 6 道原创私有题。这是建议设计。

仓库：`docs/status.md:116`、`data/README.md:3`、`data/s0-v1.json:10`、`docs/scenarios.md:46`。

## 2. 模拟用户的行为像真人吗？

**出处**　*Mind the Sim2Real Gap in User Simulation for Agentic Tasks*，2026，RQ1 原文，属于论文问题。https://arxiv.org/html/2603.11245

**具体内容**　“Do simulated users behave (i.e., produce utterances, interact) like real people?” 论文收集 451 名真人、跨 165 个任务的 τ-bench 数据，并比较 31 个模拟器。行为层观察到模拟器过于配合、较早给全信息、缺少真实犹豫，在客服犯错后较少提出异议。

**对 TeachArena 的意义**　可答：“我能解释 simulator 看到了哪些信息、怎么限制其行为。实际运行里，S0-06 学生在教师问 AE 是否垂直后开始怀疑 5，在只获鼓励的一格仍问是否为 5。这是同一题上的行为证据。” **缺口**　用有授权的同题或同知识点真人片段做参考。两人独立做匿名来源辨别，并对同一前缀核对具体错因、无提示就纠正和对错误教师反馈的反应。

仓库：`src/run.mjs:141`、`src/run.mjs:149`、`docs/status.md:57`。

## 3. 模拟学生自己会解题，怎么控制？

**出处**　Do 等，*Simulating Students or Sycophantic Problem Solving?*，2026，§2、式 (2)、表 3。以下是项目追问。https://arxiv.org/html/2605.12748

**具体内容**　同一错因下对比针对性、错位、泛化反馈。七种模型普遍在三种条件下都高频改对，SFS 接近零。对于 S0-06，还可以加入仅鼓励的条件观察自行跳解。

**对 TeachArena 的意义**　可答：“当前学生拿到私有画像和公开前缀，提示要求只从已知起步并小步推进，解析器只查单键非空文本。旧版 0.77 是历史背景，旧原件未读。” **缺口**　开展固定前缀实验。为每种反馈保存学生答复和首个关键跃迁的位置。统计无有效线索报答案的次数，检查学生纠错理由是否对应教师提示。再决定何处需要显式知识状态约束。

仓库：`src/run.mjs:143`、`src/run.mjs:149`、`contracts/learner/schema.mjs:3`。

## 4. 和业务专家怎么建题？多大才合适？

**出处**　Awesome Generative AI Guide，Forward Deployed Engineer #56。https://github.com/aishwaryanr/awesome-generative-ai-guide/blob/main/interview_prep/roles/forward-deployed-engineer/questions.md 。Anthropic 的起步配额。https://www.anthropic.com/research/demystifying-evals-for-ai-agents

**具体内容**　原题：“How do you build an evaluation dataset with a customer's domain experts, and how big should it be?” Anthropic 建议从真实失败选 20 至 50 个任务起步。

**对 TeachArena 的意义**　可答：“我会请教师按知识点写题卡，审核标准解、真实错因和四轮能看到的卡点。把题目数、每题画像数、重复次数分别报。目前只有 1×1。试点做 6 题 × 2 画像，每个条件 12 个场景。每场景生成 3 次则有 36 条轨迹。” **缺口**　题卡双人审核、题族和难度清单、真人参考及多题实跑。题量是覆盖设计，需要随目标范围扩大。

仓库：`contracts/dataset/schema.mjs:4`、`config/e1.mjs:1`、`docs/scenarios.md:38`、`docs/status.md:116`。

## 5. 如何保持题集新鲜，并发现可能的泄漏？

**出处**　AI Engineer Interview Questions，Evals & Observability #28。https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/07-evaluation-and-observability/questions.md 。Landed，#50 追问。https://github.com/landedjobs/ai-interview-questions/blob/main/banks/coding-and-system-design.md

**具体内容**　原题：“How do you keep an eval set fresh over time, and how do you avoid overfitting to it?” 追问：“How do you detect data leakage between training and eval?” LiveBench §2.7 记录按月更新及一次 132 题替换。https://arxiv.org/html/2406.19314

**对 TeachArena 的意义**　可答：“题库来源公开，仓库锁定修订。既有 28 道保留题是项目内留出，而且当前流程未用。它能约束本项目调参范围，模型此前接触情况未知。” **缺口**　另建私有原创题，做题面和解法的近重复检查，登记首次见题日期、题族、批次和版本。重点对照同技能的公开和私有题上是否都发生无支撑跳解，观察结果作为风险线索。

仓库：`data/README.md:3`、`data/s0-v1.json:5`、`src/run.mjs:109`。

## 6. 对话变化时，你怎么复现一次观察？

**出处**　OpenAI Cookbook，*How to make your completions outputs reproducible with the new seed parameter*。以下是项目追问。https://raw.githubusercontent.com/openai/openai-cookbook/main/examples/Reproducible_outputs_with_the_seed_parameter.ipynb

**具体内容**　seed 是尽力复现。官方示例用 seed 123 和温度 0，并对照后端指纹。TeachArena 冻结源验证包含 9 条消息的结构与校验哈希，一次真实五格复评和源文本逐字一致。

**对 TeachArena 的意义**　可答：“离线夹具复现编排，judge-only 固定公开对话，在线调用生成新的互动。固定输入看历史行为时，源 run、格子、消息 ID、对话哈希和原始请求都可核对。模型调用温度是 0，没配采样 seed。” **缺口**　先保存当前模拟器的请求指纹与可回读的生成前缀。若服务支持采样 seed 与后端指纹，再保留这些字段并补同一场景的重复生成。

仓库：`src/models.mjs:141`、`src/run.mjs:57`、`src/run.mjs:81`、`src/run.mjs:137`、`docs/status.md:98`。
