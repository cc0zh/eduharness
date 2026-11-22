# 题集覆盖、难度与画像

## 题库规模和真实覆盖分别报

**出处**　新库 `data/README.md:3`、`data/s0-v1.json:5`、`data/s0-v1.json:10`、`config/e1.mjs:1`、`docs/scenarios.md:46`、`docs/status.md:116`。上游修订 https://huggingface.co/datasets/CinderD/TeachArena/tree/d9a673dc7c32d45df6c08a05e70d276da9e8a164

**具体内容**　上游 S0、S1、S2 任务文件分别有 100、117、137 个顶层任务 ID。项目 E1/E2 只用 S0-06。E2 的五格共用同一题、同一个学生画像和四轮。历史 S0 划分记录列出 93 道合格题、65 道开发题、28 道保留题和 7 道排除题。S0-01 在本库场景卡里是识别 57、核对 43 的答案键回归。

**对 TeachArena 的意义**　先回审已有 65 道开发题的可用性。为每题记录 `task_id`、题族、技能、难度档、题面来源、标准解、初始误解、可用画像、分区和审核状态。同题变式共享题族。保留 S0-06 作为工程回归，跨题声明需要独立题目。

## MathDial 适合找应用题与错解样本

**出处**　Macina 等，*MathDial*，2023，采集方法、表 1、附录 B。https://arxiv.org/html/2305.14536

**具体内容**　有 2,861 段一对一辅导对话，教师为人，学生由 LLM 扮演，题目来自 GSM8K。作者选至多四个解题步骤的题，滤掉距正确值 0.1 以内的错答，并用计算器排查中间等式里的计算错误。生成的错解和教师对模拟行为的评价随数据发布。

**对 TeachArena 的意义**　借鉴「题目 + 错误推理链 + 人审标签」的题卡。优先用作开发集的错误候选和教师追问参考。GSM8K 来源需记录其公开暴露情况，半合成对话用来补开发材料，真人验证另取有授权的样本。

## Eedi 提供错因设计，ASSISTments 提供练习行为

**出处**　Wang 等，*Diagnostic Questions: The NeurIPS 2020 Education Challenge*，2020。https://arxiv.org/html/2007.12061 。Eedi 发布页 https://www.eedischool.com/projects/neurips-education-challenge 。ASSISTments 官方 2015 Skill Builder 数据页 https://sites.google.com/site/assistmentsdata/datasets/2015-assistments-skill-builder-data

**具体内容**　Eedi 诊断题为一项正确、三项对应常见误解的干扰项。挑战任务 1/2 发布 27,613 题、118,971 名学生和 15,867,850 条作答。Eedi 发布页注明 CC BY-NC-ND 4.0，以及题图只供模型训练的额外用途限制。ASSISTments 2015 页面说明仅收录回应量最大的 100 个 Skill Builders 中的学生回应。

**对 TeachArena 的意义**　借 Eedi 方法原创干扰项和等价错因描述。导入数据前逐份检查许可，不能按通用开放题库处理 Eedi 题图。ASSISTments 更适合核对技能分层和跨次尝试。Top-100 的取样限制及答题记录形式都要写入来源字段，真人自由对话需要另找。

## 用题卡验收难度和画像组合

**出处**　MathDial 附录 B 的「最多四步」。https://arxiv.org/html/2305.14536 。Eedi 的四选一诊断题定义。https://arxiv.org/html/2007.12061 。本库画像字段见 `contracts/dataset/schema.mjs:4`、`src/run.mjs:141`。

**具体内容**　MathDial 以解题步骤数限制题目。Eedi 的干扰项把同一道题的错误拆成不同成因。现有 TeachArena 每任务读一个 `user_scenario`，学生生成时使用该记录的 `known_info`、`unknown_info`、`student_model`。

**对 TeachArena 的意义**　试点按几何、代数、比例应用三类，各设基础档和多步档。基础档暂定 1 至 2 个必要推理步，多步档暂定 3 至 4 步或需转换表征，人工核对四轮能否走到目标卡点。每题用两种相容知识画像，例如「有明确误解」和「掌握先修但卡在应用」。受阻程度或语气单独记录，避免把措辞差异当成新知识状态。为每个组合写可推进一步的参考教师提示及一个应保持误解的对照前缀。
