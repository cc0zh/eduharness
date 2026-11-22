# TeachArena 旧 v6 与新 v3 尺子对照

证据级别 **静态阅读**。新版定位为 `D:/Code/eduharness` 的 `00fecc4`，尺子 `e1-numbered-evidence-v3`，输出契约 `judge-output-v2`（新 `contracts/judge/schema.mjs:5–7`）。旧版以 `D:/Code/mini-eduharness2` 的全量运行 profile `eval/teacharena/profiles/s0-paper-v6-message-evidence.json:1–38` 为准。同名 `s0-paper-v6-judge-low-crossjudge.json:1–11` 是保留来源学生身份的轨迹复评配置。

## 1. 新版六维 rubric

### README 原文

新 `contracts/judge/README.md:9–16` 的完整表格如下。

| 维度 | 衡量什么 | 0 分 | 1 分 | 2 分 |
| --- | --- | --- | --- | --- |
| 误解修复 `misconception_repair` | 学生是否在理解错误原因后独立修正 | 未形成修复，或完整解抢先代替修复 | 只修复一部分，或学生复述教师的修正 | 教师指出原推理为何不成立，学生独立说出正确概念 |
| 增加与撤去支持 `support_escalation_and_fading` | 帮助随学生状态双向调整 | 支持强度固定 | 只有增加或撤去一个方向。开场完整解最高 1 分 | 学生受阻后增加支持，成功后持续撤去支持 |
| 交还主动权 `agency_handoff` | 推理和自我监控由谁主导 | 教师主导，学生没有自主推理步骤或实质检验。复述或仅察觉困惑后求助属于本档 | 教师仍主导方案，学生自主完成至少一个有限的推理步骤 | 学生在末三分之一主导实质推理或检验，例如自行选方法并解释其依据，或做一次检验并说明后果 |
| 保留有益试错 `productive_struggle` | 学生能否在适当支持下尝试解题 | 首个实质回应就给完整解或答案，后续克制不抵消 | 支持有反复，或后续过早代做 | 在关键卡点引导学生继续有效尝试，没有过早给完整解 |
| 表征转换 `representation_pivot` | 原讲法受阻后，换一种表征能否帮助学生理解 | 无机会、未转换或只换措辞。重讲开场完整解不计作转换 | 换了表征，学生尚未表现出理解 | 识别原讲法受阻，实质转换表征，学生表现出理解 |
| 验证或迁移 `verification_or_transfer` | 教师是否查证学生能独立解释或应用 | 无概念检查，或仅口头确认 | 尝试检查，但学生证据弱 | 学生能独立解释概念或迁移应用 |

### 实际裁判提示原文

新 `src/judge.mjs:8–10` 将 `rubric` 连同对话序号与末段起点直接送入裁判请求。以下是新 `contracts/judge/schema.mjs:11–16` 的六项，保留原文中的各档示例、正反例及槽定义。

```js
misconception_repair: [['student_misconception:L', 'tutor_why_flawed:T', 'student_corrected_concept:L'], '0 absent or preempted by full solution (e.g. generic praise after a wrong claim). 1 partial or echoed repair (e.g. learner repeats a correction without its rationale). 2 tutor shows why the error fails and learner independently repairs it (e.g. explains why the original rule gives a contradiction).'],
support_escalation_and_fading: [['tutor_high_support:T', 'student_success:L', 'tutor_fading_prompt:T'], '0 static (e.g. repeats the same hint after struggle and success). 1 one direction only (e.g. supplies a worked substep after struggle but keeps doing the work afterward). 2 both escalation after struggle and sustained fading after success (e.g. models a substep then leaves subsequent choices to the learner). A complete opening solution caps this at 1.'],
agency_handoff: [['early_tutor_drives_plan:T', 'late_student_drives_agency:L'], '0 tutor retains control and learner contributes no independent reasoning step or substantive check. Example: learner repeats a result, or notices confusion and asks for an explanation without proposing a reason, step, or check. Counterexample: learner derives a new intermediate result. 1 learner independently supplies a bounded reasoning step while tutor still owns the plan. Example: learner sets up a new relation in a method chosen by the tutor. Counterexample: copying the tutor’s relation or merely asking why it works is 0. 2 learner owns substantive reasoning or monitoring in the final third. Example: learner selects and justifies the next method or runs a check and explains its consequence. Counterexample: one intermediate calculation on a path dictated by the tutor is 1.'],
productive_struggle: [['student_stuck_or_error:L', 'tutor_delay_of_gratification:T'], '0 if first substantive response gives the complete solution or answer (e.g. works the entire problem before an attempt), regardless of later restraint. 1 mixed support or later premature rescue (e.g. invites a first attempt then takes over at the next obstacle). 2 guides productive attempts across struggle moments without premature full solution (e.g. provides a targeted hint and lets the learner use it). For opening rescue cite the first substantive tutor message number in reason.'],
representation_pivot: [['tutor_pivot:T', 'student_response_to_pivot:L'], '0 no opportunity, no change or surface rephrasing (e.g. repeats the same formula in prose). 1 changed frame without demonstrated uptake (e.g. uses a diagram after confusion but learner still cannot use it). 2 detects failed frame and changes representation with learner uptake (e.g. learner uses the new diagram to explain the relation). Re-explaining an initial full solution is not a pivot.'],
verification_or_transfer: [['tutor_consolidation_or_transfer_prompt:T', 'student_consolidated_understanding:L'], '0 no conceptual check or only confirmation (e.g. asks if everything is clear). 1 attempts check with weak learner evidence (e.g. asks why, learner echoes the explanation). 2 learner explains the concept independently or transfers it (e.g. justifies the same rule in a changed example).'],
```

### 逐维比对

| 维度 | 一致性和文档缺口 |
| --- | --- |
| 误解修复 | 三档语义一致。README 省略了对错误泛泛表扬、无理由复述、用矛盾独立解释三例。若同段既有提前揭底又有后续改口，README 的短句不足以让新人稳定区分独立修正和复述。旧版有更强的防污染说明，当前提示只保留短规则。新 `contracts/judge/README.md:11`、`contracts/judge/schema.mjs:11`。旧 `eval/teacharena/overrides/trajectory-judge.md:59–86`。 |
| 增加与撤去支持 | 三档一致，开场完整解只封顶 1。README 省略了固定提示、困难后代做、示范一步后放手三例，也没给出如何区分持续撤去和只在收尾问一句。旧版提示明确单个轻量收尾问题不算持续撤去。新 `contracts/judge/README.md:12`、`contracts/judge/schema.mjs:12`。旧 `eval/teacharena/overrides/trajectory-judge.md:96–110`。 |
| 交还主动权 | 三档主体一致。README 省略了 0 分的反例「推出新中间结果」、1 分在教师所选方法内列新关系的正例及照抄或只问为什么仍为 0 的反例、2 分的一次指定路径计算只算 1 的反例。README 的「问困惑」例比提示短，提示明确要看有没有提出理由、下一步或检验。新 `contracts/judge/README.md:13`、`contracts/judge/schema.mjs:13`。 |
| 保留有益试错 | 三档一致，首个实质回应给完整解或答案即 0。README 缺整题代做、先让尝试后接管、学生使用定向提示三例，也没在该维标出首答救援须在理由里引用首个实质教师消息。新 `contracts/judge/README.md:14,25`、`contracts/judge/schema.mjs:14,110`。 |
| 表征转换 | 三档与「重讲开场完整解不算」一致。README 缺同一公式换说法、画图仍不会用、用新图解释关系三例。README 的无机会计 0 写明了，提示还要求理由引用能支持无机会判断的消息。新 `contracts/judge/README.md:15,28`、`contracts/judge/schema.mjs:15,110`。 |
| 验证或迁移 | 三档一致。README 缺「都懂了吗」、追问后只复述、在新例中独立论证三例。具体采用哪条师生消息判断检查强度和学生证据仍需回读。新 `contracts/judge/README.md:16`、`contracts/judge/schema.mjs:16`。 |

README 的评分表没有独立的逐档例库。其 E2 表是四种坏教师在 S0-06 的预登记行为及对应维度，已知问题另举表征转换误判。这些材料可辅助校准，覆盖不了 18 档。状态文档还保留了实跑中的五格引用例。新 `contracts/judge/README.md:30–44`、`docs/status.md:126–134`。

README 中用于校准坏教师行为的表格原文（新 `contracts/judge/README.md:32–37`）。

| 格子 | S0-06 要回读的行为 | 目标维度 |
| --- | --- | --- |
| `answer_dump` | 首个正式答复给出完整解 | `productive_struggle` |
| `lecture` | 教师长讲并持续代做，学生末段跟听或复述 | `agency_handoff` |
| `sycophant_close` | 附和后收尾，缺少解释或迁移检查 | `verification_or_transfer` |
| `no_teach` | 学生暴露 AE 与垂距的混淆后，教师仍只鼓励 | `misconception_repair` |

只读 Markdown 可以知道六维每档的基本判据、共同证据规则和主要硬边界，遇到表中所列边界例仍需读提示或回读原件。文档还缺逐维槽名和角色清单，以及本地 `reason` 至少含一个字母的要求。README 已链接 schema，可从那里补齐。数值、角色、顺序和支持链可以由代码校验，独立性、真实教学机会等语义仍须人判断。新 `contracts/judge/README.md:3,22–28,43`、`contracts/judge/schema.mjs:11–16,75–87,118–183`。

| 入口 | 是否重写 rubric |
| --- | --- |
| 根 README | 引用裁判契约，未另列分档。新 `README.md:16`。 |
| 术语表 | 指向裁判契约的规范名称、分档、权重和历史学生变化。自有条目解释尺子、原始分档、观察窗口等术语，未设第二套六维分档。「证据序号」行仍以 v2 命名，v3 继续使用序号，建议改为覆盖两版。新 `docs/glossary.md:11,15,25–38`、`contracts/judge/README.md:24–26`。 |
| 场景卡 | 入口引用裁判契约。E1 重述首答揭底和目标维度低一档的验收条件，E2 链接预登记维度，E5 说明怎样用分档做对照。未定义第二套六维分档。新 `docs/scenarios.md:3,25–27,38–41,83–87`。 |

## 2. 旧 v6 的评分组成

下文旧 `.cache/tau2-bench/src/tau2/evaluator/` 是本地安装源码。用于核对的 `evaluator_tutoring_features.py`、`evaluator_tutoring_trajectory.py`、`evaluator_tutoring_nl_assertions.py` SHA256 均与锁定值一致。以下简写为旧 `features.py`、`trajectory.py`、`nl_assertions.py`。旧 `eval/teacharena/lock.json:41–43,116–121,148–153`。

### 单轮评价 tutor_turn（名义 35%）

- LLM 给出 4 个常开项（回应学生实际困惑、切题、正确无幻觉、清晰与认知负荷）和 6 个条件项（识别错误、定位错误、情绪支持、具体表扬、元认知提示、验证与吸收）。每项是 [0,1] 连续分，条件项只在适用时进均值。另标教学动作、表征、支持 0–3、透露 IRI 0–3、即时学生状态和预测参与度。旧 `eval/teacharena/overrides/tutor-turn.md:34–54,58–110,118–192`。
- 会话结束进评分器后，逐个非空 assistant 消息做一次逻辑裁判调用，可重试。代码按消息角色枚举，未在该循环额外剔除开场白。v6 窗口为最近 8 条非空消息，**含当前教师消息**，所以最多有 7 条此前消息。另把当前教师文本单独再传一次。不会看到该轮之后的学生反应，先前学生发言在窗口内出现。提示列出的题干、学生设定、状态、KC 图是可选输入，实际此调用不另传这些结构字段。先剔除私有小测。旧 `nl_assertions.py:84–95,130,176–210`、`features.py:873–919`、`eval/teacharena/overrides/tutor-turn.md:9–19`、`eval/teacharena/profiles/s0-paper-v6-message-evidence.json:24–31`。
- 逐轮原始均值乘 IRI 系数 1 / .90 / .65 / .40。IRI 3 且预期学生被动且没有实质验证或反思时硬 0。学生已独立取得答案或决定性步骤后的总结应标低 IRI。无核心教学动作时视 contingency 是否低于 .3，把分数封顶为 .2 或 .4，保留两位小数。程序复算，并检查模型输出的派生分数。会话聚合是有效轮均值乘 sqrt(有效轮占比)。生产还校验逐轮原始契约，坏轮不能拿折扣后的汇总分当合规结果。旧 `eval/teacharena/overrides/tutor-turn.md:103–116,180–214`、`features.py:583–676,715–777`、`nl_assertions.py:218–255,647–670`、`eval/teacharena/bridge/run_episode.py:458–482`、`docs/design-docs/EVALUATION.md:84–89`。

### 总体评价

- **规则聚合 tutor_trajectory_metric（16%）**。将困难、成功、修复、情绪事件和师生轮标注转换成六个规则量 C1 支持增减、C2 误解修复、M1 主动权、M2 验证/迁移、N1 有益试错、N2 情绪与参与。例子包括困难时提示后才救援、学生成功后撤去支持、验证后的回应、前后段主动权变化。指标内部用事件率、条件及无机会默认值等规则。C1/C2、M1/M2、N1/N2 分别取均值，三组按 .33/.37/.30 加权。六项层内权重因此为 16.5/16.5/18.5/18.5/15/15%。聚合本身是确定性的，无独立的整体打分 LLM 调用，但输入用到逐轮 LLM 标注和批量学生轮 LLM 分类，后者缺失时可用文本启发式。旧 `trajectory.py:7–25,207–237,347–416,434–539,583–646`、`features.py:1223–1267,1876–1910`、`src/eval/analysis-loss.ts:5–12,61–68`。
- **整段裁判 tutor_trajectory_judge（24%）**。一般部分对完整公开可见轨迹做一次六维 LLM 评分（可重试），六个 0/1/2 原始分各除以 2，再取六项均值。六项都须有合法档，未决/契约故障阻断该层及依赖总分，独立合法分项仍保留。这六项与新版同名。旧规则聚合层另外有情绪与参与，没有独立的表征转换项。旧 `eval/teacharena/overrides/trajectory-judge.md:23–39`、`eval/teacharena/bridge/trajectory_evidence.py:206–227,249–290`、`docs/design-docs/EVALUATION.md:103–111`。
- **任务义务属于上述 24%**。有题目 `nl_assertions` 时，另由通用 LLM 裁判做任务特定二元断言，通过率作为分数。有两个有效分才混合，默认通用六维 50% 加任务义务 50%，可按题改权重。v6 整体分记录与归一化分项由 TS 读取器复核。旧 `nl_assertions.py:603–643`、`src/eval/score-contract.ts:205–225`、`src/eval/analysis-loss.ts:70–79`。
- **整段请求中的上下文**。通用模板允许逐轮摘要和规则分摘要，旧 v6 的真实生产分支改由 `judge_trajectory` 组装，只把可见消息、绑定视图以及有条件的原题核验参考和错误确认记录交给通用六维裁判，该分支未传两个摘要。旧 `eval/teacharena/overrides/trajectory-judge.md:34–41`、`nl_assertions.py:567–589,1163–1178`、`eval/teacharena/bridge/trajectory_evidence.py:249–277`。

### 学生变化 learner_change（25%）及完成乘子

- 以画像的初始 KC 掌握度及元认知、参与等状态为起点。每条学生回复经过生成和保真审核，随后单独评估状态变化，保存 before/after/update。v6 状态更新引用当前获准学生回复的消息 ID，发生变化必须有引用。正掌握度只给独立解释、应用、自查、迁移等合格证据，部分/完整透露乘 .70/.20，复述不给正掌握度。旧 `eval/teacharena/bridge/learner_simulator.py:70–115,251–280`、`eval/teacharena/profiles/s0-paper-v6-message-evidence.json:5–12`。
- 会话后有适用题库条目才做一次私有小测，同样生成、审核、更新，答案键只进状态评估。教学 harness 和教学评分视图均不含小测。这个指标是累计状态变化带小测锚点。独立弱模型冷测/后测属于另一个默认关闭的指标，权重 0。适用小测缺状态更新则学生变化不可用。题声明排除或小测答案键错、可直接照搬、测不到目标技能等按题排除，记录原因并锁定排除快照。旧 `eval/teacharena/bridge/run_episode.py:704–707`、`eval/teacharena/bridge/learner_simulator.py:254–299`、`nl_assertions.py:84–95,385–386,656–675`、`docs/design-docs/EVALUATION.md:24,157`、`src/eval/run.ts:213–217,240,340–342`。
- 认知、元认知、非认知增量经饱和归一化，按 50/25/25 合成，非认知项还计耐心和焦虑变化。超过 8 个状态更新事件后按 `1 / (1 + .04 × 超出事件数)` 折扣。旧 `nl_assertions.py:320–383,388–469`、`src/eval/analysis-loss.ts:81–90`。
- 全部测量有效时 `总分 = p × (.35 tutor_turn + .16 tutor_trajectory_metric + .24 tutor_trajectory_judge + .25 learner_change)`。合法排除学生变化后，对可用层按 35:16:24 归一化。v6 整段断言未决或故障时总分不可用。`p` 是完成乘子，去除小测后任一学生消息含 `###STOP###`、`###TRANSFER###` 或 `###OUT-OF-SCOPE###` 时为 1，否则 profile 默认 .92。它与学生变化内部的轮数折扣是两个步骤。旧 `docs/design-docs/teaching-metrics.md:15–23`、`nl_assertions.py:647–670,715–765`、`eval/teacharena/profiles/s0-paper-v6-message-evidence.json:24–31`、`src/eval/analysis-loss.ts:14–35`。

### 新版保留和缺失清单

| 旧版组成 | 新版现状及出处 |
| --- | --- |
| 通用 tutor_trajectory_judge | 保留六维整段语义，改写部分档位边界和证据契约。六项等权直接求和到 0–12，缺任一项均不发布部分生产分。新 `contracts/judge/README.md:3–5,9–20`、`src/judge.mjs:11–20`、`contracts/artifacts/schema.mjs:6–11`。 |
| tutor_turn | 缺失，文档明确未接入。运行每轮生成师生回复，轮次循环内没有裁判。教师事件和调用日志提供调试线索，缺少独立逐轮质量分。新 `contracts/judge/README.md:18`、`src/run.mjs:126–158`。 |
| tutor_trajectory_metric | 缺失，文档明确未接入。没有旧六项规则聚合；六维整段分不包含独立的情绪与参与分项。新 `contracts/judge/README.md:9–18`、`src/judge.mjs:16–20`。 |
| task_specific_obligations | 缺失，文档明确未接入。裁判只收通用 rubric 和公开对话。S0-01 答案键作为回归检查，未进入 E1/E2 的生产评分请求。新 `contracts/judge/README.md:18,24`、`src/judge.mjs:8–10`、`docs/scenarios.md:44–48`。 |
| learner_change | 缺失，文档明确未接入私有状态更新、小测或该分数。已知问题另记无教学机会和错过机会可能混在低档，不能视为已测学习变化。新 `contracts/judge/README.md:39,41–50`、`src/run.mjs:141–155`。 |
| 完成乘子和分层权重 | 缺失，文档明确未接入。固定四轮结束后整段打分，发布总分直接求和，无完成乘子。新 `config/e1.mjs:2`、`src/run.mjs:144–158`、`contracts/judge/README.md:18`、`contracts/artifacts/schema.mjs:6–11`。 |

现有证据支持「当前范围未接入」，没有查到这些层被永久舍弃的决定。已知问题集中在机会语义和历史表征转换误判。新 `contracts/judge/README.md:18,41–50`。

### 方法和证据逐项对照

| 项目 | 旧 v6 | 新 v3 / judge-output-v2 |
| --- | --- | --- |
| 评分时点与次数 | 对每个非空教师 assistant 消息作一逻辑评分，并在会话结束评分整段，还可做任务义务；轨迹规则另聚合。旧 `nl_assertions.py:176–227,257–260,551–643`。 | 每格师生互动四轮，最后一条学生回复入轨后，记在第 4 轮、调用 1，评分整段一次。一次逻辑调用可有多次请求；冻结复评沿用原对话。新 `config/e1.mjs:2–7`、`src/run.mjs:135–158`、`src/models.mjs:106–110,210–212`。 |
| 观察窗口 | 逐轮取含当前在内最近 8 条非空消息，无后续；整段取全可见非空 user/assistant，滤私有小测与非对话，保留原始索引。末三分之一按可见序列下标 floor(2N/3)。旧 `nl_assertions.py:176–205`、`eval/teacharena/bridge/trajectory_evidence.py:38–67`。 | 整段看完整公开对话（初始学生发言加四对师生消息），模型看到 n/role/text，不给内部工具、画像、私有状态或任务答案键。末三分之一同为 floor(2N/3)，提示采用一基序号。新 `contracts/judge/README.md:24,27`、`contracts/judge/schema.mjs:19`、`src/judge.mjs:7–10`、`src/run.mjs:141–156`。 |
| 证据定位 | 逐轮保存 assistant_turn_index、message_index 和原始裁判契约。整段用源快照哈希及 run/task/repeat/attempt 生成完整消息 ID，绑定可见视图、终止、评测身份和 context，保存快照、请求、响应、payload 及摘要。裁判回显 ID 与 context。旧 `nl_assertions.py:218–226`、`eval/teacharena/bridge/trajectory_evidence.py:51–67,229–246,276–292`。 | 模型回窗口整数，宿主以 binding.messageIds[n-1] 转成消息 ID；记录 run/格子/尺子/视图哈希/调用坐标。理由用 #N，须在该维 evidence 数组内，原件保留理由序号，落盘组的 evidence 来自评分证据组。新 `contracts/judge/README.md:25–28`、`src/judge.mjs:7–20`、`contracts/judge/schema.mjs:46–87`。 |
| 证据判断 | 四态，旧 v6 用反模式标记、declared_pass、未决原因及上下文完整性校验。逐轮和整段的证据粒度不同。旧 `eval/teacharena/overrides/trajectory-evidence-v2.md:3–23`。 | 同用四态，2 分要求完整 observed 支持链，同维度组跨度不得重叠，缺行为的机会结构条件只验证预期角色同条或之后发过言。真实机会与理由是否成立靠回读，生产遇未定档会重试并以故障收尾。新 `contracts/judge/README.md:20,26–28,43`、`contracts/judge/schema.mjs:145–183`、`src/judge.mjs:11–15`。 |
| 教学环境与尺子 | `harness/configs/baseline.json` 管的是教师提示、教学阶段、收尾前验证、状态/记忆、检索和工具，教师上下文最多 60 条。旧裁判的 8 条窗口由评测 profile 决定。旧 `harness/configs/baseline.json:6–43`、`eval/teacharena/profiles/s0-paper-v6-message-evidence.json:24–31`。 | 教师前后 hook 记录独立事件，评分输入由宿主只投影公开消息。新 `docs/scenarios.md:13–14`、`src/run.mjs:132–150`、`src/judge.mjs:7–10`。 |

## 3. 补回优先级（建议）

1. **S1 优先补机会判定及校准案例。** 将正常和坏教师的真实机会、错过机会、证据不足显式记录，先用冻结对话与人工标注覆盖首答揭底 vs 掌握后总结、末段自主代理、口头确认 vs 独立验证、无误解 vs 无视误解。先完善文档并单列诊断，若机会状态进入机器验收，则需更新契约、评测身份和对照逻辑，复验成本中等。已验收的 v3 五格说明本次 S0-06 四项可区分，冻结补评曾出现正常对照在验证维同档，说明扩大覆盖比先恢复旧总分更直接。新 `docs/status.md:98–110,114–134`、`contracts/judge/README.md:39–44`。
2. **S3 优先恢复少量逐轮诊断与正确性检查。** S2 隔离通过后，在预登记目标轮记录正确性、回应性、透露/接管，并绑定前序窗口和该轮原件。先用少数人工或可验证规则锚点，再决定是否增加独立逐轮 LLM。这样能指出是哪一步改坏，且能发现六维上的高分掩盖错误解法。全面恢复每轮 LLM 会增加约每个教师消息一次逻辑调用，以及重试、噪声和校准成本。已知答案先作单列校验，迁移旧任务义务也要定义按题来源和证据。新 `docs/scenarios.md:65–74,81–87`、`contracts/judge/README.md:18,24`。旧 `eval/teacharena/overrides/tutor-turn.md:136–214`、`eval/teacharena/bridge/trajectory_evidence.py:264–275`。
3. **S3 按改动目标再补规则聚合。** 优先使用现有 transcript 与教师事件做问题次数、帮助增减和检查后吸收等诊断，明确可观测机会及分母。必要时再补轮级标注，暂不移植六个复合公式。纯事件信号成本低，语义标注会增加模型调用和校验负担，且需要单独验证覆盖与无机会处理。新 `docs/scenarios.md:72,84–87`、`contracts/judge/README.md:18,43`。旧 `trajectory.py:24–25,632–697`、`features.py:1223–1267`。
4. **学生变化最后补，完成乘子随退出策略再评估。** 只有目标明确涉及迁移或独立掌握时再引入隔离小测及状态更新。需要核验题目、答案键、排除快照与状态归因，模拟器多角色每轮调用较贵。固定四轮阶段优先报告收尾/未完成行为，有自主结束策略后再评估是否需要完成指标。阶段反馈仍以候选与基线的同条件行为对照为准。新 `contracts/judge/README.md:46–50`、`docs/scenarios.md:70–74,83–87`。旧 `eval/teacharena/bridge/learner_simulator.py:251–299`、`nl_assertions.py:751–765`。
