# TeachArena 面试资料构建进度

目标：交付 `D:/Code/resume/research/teacharena/interview` 下的七份中文资料。主路径控制在三到四小时。引用须能直接定位到归档小节或仓库行号；第 3、4 步结果不补写。

范围：归档只读，索引 README 不追加。对 `D:/Code/eduharness` 只用文件读取工具，且只看题目指定的五份原件。不执行评测，不提交、不 push。不读取并行会话的 .tmp 或测试 runs。

断点恢复：从日志最后一条开始。先查看目标目录和该条标记的下一个文件；若已落盘但未记账，先核验，不覆盖。合格判据：七个文件；九站学习路线；题库四类 30–40 题；STAR 3–4 个；简历 3–5 条；三份资料各回原件核对五处。对第 2 步的统计结论、运行验收、冻结选择分别说清楚。

## 追加日志

```tsv
ts	phase	decision	why	evidence	result
2026-11-20T14:20:05.921Z	start	读完归档索引与五阶段目录；确认进度和交付目录均不存在	从空目录开始，不覆盖既有学习资料	research/teacharena/README.md；eval-knowledge/ 五阶段目录	以逐文件落盘、核验、记账的顺序推进
2026-11-20T14:20:05.921Z	baseline	对面试资料目录之外的归档文件做写前 SHA256 盘点，保留 README 原字节	交付后用同样的清单哈希验证原件未动	48 个文件；按路径排序，逐行用相对路径、TAB、小写文件 SHA256，再以 LF 连接后做 SHA256	b83597b4a5f7e7971da424f1a88b1f4328b119f5eaa6a6e1d5c407e5254a7a16
2026-11-20T14:20:05.921Z	sources	现状用 status.md，预登记用 scenarios.md，历史复评分项用 calibration-report.md	历史报告的 v4 冻结不是当前选择；仓库状态未更新并行测试进度	eduharness/docs/status.md:5-10,28-66；eduharness/docs/scenarios.md:63-85	第 2 步结项未过线；现冻结 v3；按任务说明记第 3 步在跑、未验收
2026-11-20T14:23:41.911Z	write	study-path.md 已落盘并检查	第一次阅读有固定入口、时限和自测	interview/study-path.md；42 个来源定位通过	9 站，210 分钟，每站 2–3 问；下一份 concepts.md
2026-11-20T14:25:46.516Z	write	concepts.md 已落盘并检查	让读者能以定义、项目例子和反例练习每个概念	interview/concepts.md；73 个来源定位通过	14 个概念，三字段齐；下一份 qa-bank.md
2026-11-20T14:26:19.989Z	cite	修正结构化输出锚点，扩大学习站的 E2 表引用范围	落回有文本的原始行，并覆盖完整四项对照	eduharness/docs/status.md:146,187-207	两份引用重新检查无错误；继续 qa-bank.md
2026-11-20T14:28:38.267Z	write-part	qa-bank.md 已写并核验 Q01–Q18	分批保存，避免中断重写	interview/qa-bank.md；61 个来源定位通过	基础与项目两类完成；从 Q19 继续
2026-11-20T14:30:46.949Z	write	qa-bank.md 已落盘并核查 Q01–Q36	四类覆盖方法、项目证据、边界追问和设计；不写背诵稿	interview/qa-bank.md；127 个来源定位通过	四类各 9 题，逐条要点有出处；下一份 stories.md
2026-11-20T14:34:00.704Z	write	stories.md 已落盘并检查	把四个关键转折分别说成可追问的项目故事	interview/stories.md；55 个来源定位通过	四个 STAR 及追问、诚实边界齐；下一份 resume-bullets.md
2026-11-20T14:34:52.147Z	write	resume-bullets.md 已落盘并检查	已证实项目产物与未开始或未验收的结果分开投递	interview/resume-bullets.md；18 个来源定位通过	3 条有证据、2 条待补；下一份 dont-say.md
2026-11-20T14:35:58.486Z	write	dont-say.md 已落盘并检查	对照容易夸大的说法和可追问的讲法	interview/dont-say.md；34 个来源定位通过	14 对慎言条目；下一份 one-pager.md
2026-11-20T14:37:02.375Z	write	one-pager.md 已落盘并检查	面试前能扫到例子、关键数与真实进度	interview/one-pager.md；23 个来源定位通过	四段三分钟提纲，两步结果占位；下一步回原件抽查
2026-11-20T14:42:29.971Z	review	独立审读学习路径、一页纸、慎言清单；补一句非独立校准	单独拿一页纸口播也不会被误听成独立盲标	DeepSeek V4.1 Flash 文档审读；interview/one-pager.md:11；eduharness/docs/status.md:14	未发现实质性口径问题；措辞已补强
2026-11-20T14:42:29.982Z	verify	交付结构、引用和原件抽查核验完毕	首次盘点过滤未识别 Windows 路径分隔符，纠正后与写前基线相同	372 个引用定位、25 个文档链接、下方 15 项语义抽查；archive_files=48 archive_manifest_sha256=b83597b4a5f7e7971da424f1a88b1f4328b119f5eaa6a6e1d5c407e5254a7a16	完整 7 份，0 个结构或定位错误，48 个归档文件字节不变；第 3、4 步只留结果占位，交付完成
2026-11-20T17:08:10.865Z	start	接续先前面试资料；上一段截至 2026-11-20T14:42:29.982Z	任务变更为填入第 3、4 步实测结果	research/teacharena/interview/；本次任务交接；指定五份原件	原件只读，更新点名六份，概念速查与全部归档保留
2026-11-20T17:08:10.865Z	sources	独立区分取齐分数、统计过线、是否采用和行为审读身份	总分方向与话术负对照不替代目标维或因果和真人效果	eduharness/docs/status.md:85-99；test-report.md:13-30；ab-report.md:3-58；behavior-audit.md:3-17；preregistration.md:29-35	交接关键数字一致；lecture 组标待定但整轮未过；回读是侧别可见的执行者 AI
2026-11-20T17:08:10.865Z	baseline	盘点点名文件和其它原件，检查旧 status 行号	新报告插入后，旧 E1/S1 事实位置要重绑，不能继续沿用旧行号	8 处占位；49 个未编辑范围文件清单摘要 c3637a1bf6687877b38a555a579fe4790e1534ad30d92ca63cd52e34978472e4	按六份逐批修改；回读核验五处，不运行仓库命令
2026-11-20T17:11:31.845Z	write	qa-bank.md 替换占位并同步更新	用预登记、运行结果和证据回读解释未过线与不采用	interview/qa-bank.md；138 处引用定位	文件结构和旧状态检查通过
2026-11-20T17:11:31.845Z	write	study-path.md 替换占位并同步更新	用预登记、运行结果和证据回读解释未过线与不采用	interview/study-path.md；49 处引用定位	文件结构和旧状态检查通过
2026-11-20T17:11:31.845Z	write	dont-say.md 替换占位并同步更新	用预登记、运行结果和证据回读解释未过线与不采用	interview/dont-say.md；45 处引用定位	文件结构和旧状态检查通过
2026-11-20T17:14:11.423Z	write	stories.md 完成更新	保留实测负面结果、采用理由与推断边界	interview/stories.md；74 处引用定位	STAR／简历条目／口播结构核对通过
2026-11-20T17:14:11.423Z	write	resume-bullets.md 完成更新	保留实测负面结果、采用理由与推断边界	interview/resume-bullets.md；23 处引用定位	STAR／简历条目／口播结构核对通过
2026-11-20T17:14:11.423Z	write	one-pager.md 完成更新	保留实测负面结果、采用理由与推断边界	interview/one-pager.md；23 处引用定位	STAR／简历条目／口播结构核对通过
2026-11-20T17:54:09.609Z	start	从 2026-11-20T17:14:11.423Z 后的中断点续作	六份均已写入，只复核落盘和收尾，不重写	interview/；本日志已有逐文件记录及五处抽查	接续最终核验
2026-11-20T17:54:09.609Z	readback	stories.md 中断前最后修订已落盘	注明按计划分母的命中，并区分裁判封顶与教学满分	interview/stories.md:41-49	新 STAR、推断和诚实边界齐
2026-11-20T17:54:09.609Z	readback	one-pager.md 中断前最后修订已落盘	口播交代有效对照和两项负面决定	interview/one-pager.md:9-18	段落反映实际结果
2026-11-20T17:54:09.609Z	readback	dont-say.md 中断前最后修订已落盘	区分总分方向、验收、采用和话术判据	interview/dont-say.md:17-22	慎言条目已补齐
2026-11-20T17:54:09.609Z	readback	study-path.md 中断前最后修订已落盘	用第 8 站的原件区分方法和当前结论	interview/study-path.md:55-60	阅读与自测指向真实结果
2026-11-20T17:54:09.609Z	verify	回读五处新增出处并复核最终文件	最终文件与引文逐项相符，保留归档只读	本日志第 3、4 步抽查及下附校验表	5/5 相符；0 处占位；六份已更新，49 个范围外文件哈希未变
2026-11-21T05:56:22.749Z	start	承接上一轮至 2026-11-20T17:54:09.609Z 的文档；本轮改为三道门禁、通用题、中英简历和下一代方案	只改 interview/ 文档；资料与用户 notes 原件不改；先证据后表述	本轮用户补充验收；初始 7 份文档；归档 49 文件 SHA256 清单摘要 83d8211821a7a69ff2dc652942a71e49492f24fc204802566ab76343ea26e306	按文件记账；读者审查与事实核对独立，读者最多两轮
2026-11-21T05:56:22.755Z	sources	读完用户笔记、首轮 11 条踩坑及 Anthropic 原文相应段落	分清运行检出、失败登记、修复和不同验收；区分三档失配现象与因果；新方案状态不写成完成	eduharness/docs/status.md:3-22,181-251；docs/learnings/2026-11/；两份 calibration-report.md；Anthropic Capability vs. regression evals / Step 7	严格格式开关与本地发布不同；3/6 数值、有效 2/6、回读命中 0/6；按 A/B 双门槛保留基线；原子方案进行中按用户交接
2026-11-21T05:57:30.826Z	write	one-pager.md 讲稿重写	前五句以动作开场；可信度边界集中到 32 秒；下一代说方案和阶段	interview/one-pager.md；结构化裁判、留出题、A/B 原件	落盘回读一致；29 行
2026-11-21T05:58:44.200Z	write	stories.md 主线改成三道门禁	STAR 的 S/T 先说可复核的动作；区分旧输出故障、冻结修复和完整五格	interview/stories.md；3125adb 失败登记、10654a7 修复、20c7056 完整五格；720a875 和 32ed5be	落盘回读一致；45 行
2026-11-21T05:59:19.468Z	write	resume-bullets.md 生成中英文可贴简历的五条	第一分句直接讲工程动作和数量；审计条件另放备注	interview/resume-bullets.md；固定场景、冻结补评、收据、留出题、采用报告	落盘回读一致；27 行
2026-11-21T06:00:35.466Z	write	next-gen.md 建立问题→架构→状态对照	把评分封顶、相邻档失配、逐题真值和学生保真变成可验收的设计	interview/next-gen.md；两版校准矩阵；Anthropic Capability vs. regression evals / Step 7；用户交接	落盘回读一致；34 行
2026-11-21T06:01:00.145Z	boundary	将持续变化的 notes 单列为只读引用快照	笔记用于概念和设计，不用作项目数字来源；文件不改不移动不新建	notes/02-评测框架与原子二元拆解.md；用户笔记，读取时版本；SHA256 30ed76ff641982ffc0ab1e2526305a9a4c1707c026479576020b3224fb5a213e	读前读后哈希相同；与首读正文一致；交付时 notes 不纳入我方不变性断言
2026-11-21T06:01:14.416Z	write	one-pager.md 标注笔记快照并限定发布分档	笔记变化不影响项目事实来源	interview/one-pager.md；用户笔记读取时 SHA256 30ed76ff641982ffc0ab1e2526305a9a4c1707c026479576020b3224fb5a213e	讲稿事实仍取仓库原件
2026-11-21T06:01:28.127Z	write	next-gen.md 给所有用户笔记引用加读取快照	方案和项目事实的来源分别登记	interview/next-gen.md；笔记读取时 SHA256 30ed76ff641982ffc0ab1e2526305a9a4c1707c026479576020b3224fb5a213e	4 处笔记引用均注明版本，实测数字引用仓库
2026-11-21T06:03:03.118Z	write-part	general-qa.md 已落盘 G01–G12	按入门、数据飞轮、非确定性分批写，下一批从 G13 开始	interview/general-qa.md；用户笔记版本和 Anthropic 原文已登记	落盘回读一致；83 行
2026-11-21T06:07:20.938Z	write	general-qa.md 完成 G01–G24	每题给两个答题要点及一个具体项目落点或未涉及说明	interview/general-qa.md，24 个项目落点	24 题连续；题型覆盖从零、飞轮、样本、波动、裁判、预算与线上对照
2026-11-21T06:09:05.919Z	write	qa-bank.md 同步门禁说法与史料行号	先讲工程判断，再把证据和局限放在追问	interview/qa-bank.md Q10、Q18、Q23、Q31	题号保留；首轮状态插入后引用已重定位
2026-11-21T06:10:54.040Z	write	concepts.md 更新过期 A/B 描述并补入通用概念	概念速查与新版题库使用同一事实和状态	interview/concepts.md；用户笔记读取时 SHA256 30ed76ff641982ffc0ab1e2526305a9a4c1707c026479576020b3224fb5a213e	补能力/回归、pass 度量、原子合成
2026-11-21T06:11:18.182Z	write	dont-say.md 增加正向开场对照	把三个门禁和收据做法放在开场，原来慎言项保留	interview/dont-say.md §叙事从攻、事实从严	新增四组开场对照
2026-11-21T06:11:18.192Z	write	study-path.md 增加通用评测题站点	先练三道门，再把方法迁移到客服、Coding、RAG	interview/study-path.md 第 8–10 站	10 站，共 235 分钟
2026-11-21T06:15:24.114Z	review	面试官初审后改写讲稿的验收段和两条简历备注	用拦截决定和已完成的复评、来源锁定说明结果，保留原数字与边界	interview/one-pager.md:18；interview/resume-bullets.md:23,26	复审只读两份成稿，识别三个门禁，第 3 问无命中
2026-11-21T06:15:24.127Z	review	独立事实审查后补明三种基线口径	按原件把历史全量、历史同题子集和本轮基线分开	interview/next-gen.md；eduharness/docs/learnings/2026-11/20261121-ab-baseline-headroom.md:3-11	七处通过，一处口径细化；学生结构契约由主线程再核
2026-11-21T06:21:16.072Z	start	从两份审查完成的断点续作（上一段截至 2026-11-21T06:15:24.127Z）	两轮面试官试读和一次独立事实核对均已回写；已完成的内容不重做	interview/one-pager.md、resume-bullets.md、next-gen.md、general-qa.md；本日志上两条 review	复审第 3 问无命中；事实意见的三种基线口径已落盘；对照表 5 项、通用题 24 题已落盘；仅剩最终核验
2026-11-21T06:23:34.152Z	spot-check	复核最终稿八处出处，前三处为三道门禁	只回读落盘稿和引用原件，不重跑审查或评测	本日志「三道门禁改版：最终八处抽查」	8/8 符合；事实审查所提的三种基线口径已核对
2026-11-21T06:25:11.703Z	verify	九份成稿的断点续作最终校验	检查已落盘原件，不重写已完成文档或重派审查	本日志八处抽查与新九份文件清单；用户笔记 SHA256 30ed76ff641982ffc0ab1e2526305a9a4c1707c026479576020b3224fb5a213e	8/8 出处相符；518 处引用可定位；0 处占位；讲稿可信度段安排 32/180 秒；notes/ 外 47 个归档原件哈希一致
```

## 原件抽查

每份抽五处。重新读取交付文本和允许读取的原件，核对句子含义、计数单位、结论边界。`eduharness/` 路径从 `D:/Code/` 起算，其余来源从 `D:/Code/resume/research/teacharena/` 起算。这里的「符合」指交付措辞有原件支持，不是评测验收。

| 交付位置 | 返回的原件 | 对照结果 |
| --- | --- | --- |
| `qa-bank.md:25`（Q04） | `eval-knowledge/4-meta-eval/human-agreement.md` §「Cohen’s κ 衡量校正边际后的同档程度」 | 符合。95 条在 0 档、5 条在 1 档是教学假例；裁判全给 0 时同档率 95%、κ 为 0。没有当作项目数据。 |
| `qa-bank.md:76-77`（Q14） | `eduharness/docs/status.md:189,199-207` | 符合。S0-06 同次同画像；四项各按自己的目标维报 2→0、1→0、1→0、2→0。不是四道独立题。 |
| `qa-bank.md:91-92`（Q17） | `eduharness/docs/status.md:30-45` | 符合。19/30 对 17/30 按两维同档数择版，差在主动权；均值 κ 只用于平手，没有用于这次择版。 |
| `qa-bank.md:108`（Q20） | `eduharness/docs/status.md:41-47` | 符合。v3/v4 验证或迁移 κ 分别为 0.478、0.444、同档各 7/15；第 4 步读行为，分数仅参考。 |
| `qa-bank.md:143`（Q27） | `tutorbench/pipeline.md` §「3. 对话：输入可含多条消息，评的是一条回复」、§「5. 评分：逐项判定，在题内加权，再平均各题」；`eduharness/docs/status.md:272-277` | 符合。带历史也只评一条回复，逐题二元加权，不等同于整段六维三档，不能横比。 |
| `stories.md:7`（故事 1，情境） | `eduharness/docs/status.md:146,158` | 符合。三份响应均 HTTP 200 且 JSON 正常结束，但理由为数字；strict 已启用，实际未发布分数。 |
| `stories.md:10`（故事 1，结果） | `eduharness/docs/status.md:169-183` | 符合。新契约下五格首次拿到有效分且可重放；验证维 0→0，整次行为验收仍不通过。 |
| `stories.md:19`（故事 2，结果） | `eduharness/docs/status.md:7,199-207,284-295` | 符合。四项分差和 `no_teach` 的第 7、8 条消息一致，`0302396` 是签收记录，不代表稳定性过线。 |
| `stories.md:28`（故事 3，结果） | `eduharness/runs/ruler-train-rescore-v4-20261120-01/calibration-report.md:3-11` | 符合。复核改动 0/90、CSV 字节相等，拿到 15 条有效评分，但不是人工独立校准，也未达一致性线。 |
| `stories.md:37`（故事 4，结果） | `eduharness/docs/status.md:41-51,66`；`eduharness/runs/ruler-train-rescore-v4-20261120-01/calibration-report.md` §「冻结记录」 | 符合。历史记录曾冻 v4，当前锁 v3，`e34d8c7` 为冻结决定；核验维低 κ，依原文。 |
| `resume-bullets.md:7`（定向行为） | `eduharness/docs/status.md:187-207,284-295` | 符合。完整五格四项均命中，签收有记录；没有写三次重复通过或跨题结果。 |
| `resume-bullets.md:9`（证据溯源） | `eval-knowledge/3-instrument/evidence-binding.md` §「1. 宿主用短序号定位，保留原始消息身份」；`eduharness/docs/status.md:169-173` | 符合。短编号由宿主映射原 ID；冻结补评有五格有效分档，重放指解析回读，不是重新采样。 |
| `resume-bullets.md:11`（择版） | `eduharness/docs/status.md:30-51` | 符合。复用的单位是 15 条训练对话，以两个目标维的 19/30 对 17/30 择 v3，并保留一致性未过线。 |
| `resume-bullets.md:16`（待补第 3 步） | `eduharness/docs/scenarios.md:63-72` | 符合。25 道锁定测试题、目标维方向和缺分是验收设计，没有命中数或通过结论。 |
| `resume-bullets.md:17`（待补第 4 步） | `eduharness/docs/status.md:10`；`eduharness/docs/scenarios.md:74-85` | 符合。两类手写候选分别对同一基线，独立运行根，先核人判。未开始，无 A/B / 采用结果。 |

本次逐项对读：题库 5/5、故事 5/5、简历 5/5，15/15 符合。第 3 步正在跑仅由任务交接提供，不据此声称见到测试产物。第 4 步没有结果。抽查未运行任何评测，也没有访问其它运行产物。

## 第 3、4 步结果更新：五处新增出处抽查

上节是首次交付的历史快照，不再代表项目现状。以下按本轮原件与交付文本重新对读。

| 交付位置 | 回读原件 | 对照结果 |
| --- | --- | --- |
| `qa-bank.md:96`（Q18 留出题） | `eduharness/runs/ruler-test-v3-real-01/test-report.md:13-28`；`eduharness/docs/status.md:85-89` | 符合。四组同题总分方向 7/7、6/6、6/6、6/6，合计 25/25；`lecture` 原始 3/6，回读后 2/6 有效、0/6 命中；组标待定，整轮未过。 |
| `stories.md:44`（采用规则） | `eduharness/.tmp/scratch/harness-ab/preregistration.md:29-34` | 符合。两目标各大于 0、其余四维各不低于 −0.3；行为至少 4/5 且多至少 2 题。区间不是通过线；话术另判。 |
| `stories.md:46`（配对统计） | `eduharness/runs/harness-ab-v1/ab-report.md:9-19` | 符合。三侧各 10/10 有效；改进减同题基线分别为主动权 0.00 [−0.273, 0.300]、表征 −0.50 [−0.917, −0.108]、总分 −0.70 [−1.636, 0.222]。 |
| `resume-bullets.md:16-17`（行为和不采用） | `eduharness/runs/harness-ab-v1/behavior-audit.md:3-17`；`eduharness/runs/harness-ab-v1/ab-report.md:56-58`；`eduharness/docs/status.md:99` | 符合。侧别可见的执行者 AI 在读分前回读；基线 4/5、候选 5/5，只多 1 题，未到相对门槛。候选不采用，normal 继续用原基线。 |
| `dont-say.md:20`（话术边界） | `eduharness/runs/harness-ab-v1/ab-report.md:3-9,52-54` | 符合。十题每侧一次，唯一改动是教师 #8 后缀；两个目标及总分配对均值没涨，但个别题有涨跌，未估跨次噪声。 |

五处均与原件相符。交接提示中的数字和采用结论没有差异；原件另将 `lecture` 组记为待定，与整体未过线区分，并说明 A/B 行为回读尚无人工复核。

## 断点续作后的最终校验

按最终落盘版本统计。占位 0 处；五处新增出处再次回读均与原件相符。六份已更新，归档与概念速查哈希不变。

| 文件 | 行数 | SHA256 | 状态 |
| --- | ---: | --- | --- |
| `interview/dont-say.md` | 24 | `deda83b4c87c7327e2a11a31e3e686ea6fe7daeee90451a242046cb85d4bc9da` | 更新 |
| `interview/one-pager.md` | 26 | `2b0937eaa74f1d83aa66f9fb548b4888cf1eef831a86d5b4c4de2238ec064a3c` | 更新 |
| `interview/qa-bank.md` | 194 | `52fc74783d28f1685a7f96165771956fa218c7a264d80aeacfad01f918dbcd91` | 更新 |
| `interview/resume-bullets.md` | 17 | `36adb7c8ff4c50fa1fa36a31ad411e2d5315db0d9a6b6834a07b432a7275c368` | 更新 |
| `interview/stories.md` | 49 | `fc34c431c70226b2b5263e3c015c4c27938fc6f0fe33a1f44502daed6e8352f3` | 更新 |
| `interview/study-path.md` | 70 | `a23ac0be51fd6172e8b70530a4309a4f8cec0a5342e67cb5692e5172789acc83` | 更新 |
| `interview/concepts.md` | 87 | `80214109c1533144594cbdea8c42f6b7f7ed3073d0c6d03857e6ccc52010dfb1` | 未改 |

## 三道门禁改版：最终八处抽查

以上是上一轮快照。下表对应本轮修改后落盘的文档，前三项分别核对发布门、目标维验收门和采用门。

| # | 交付定位 | 原件定位 | 回读结果 |
| --- | --- | --- | --- |
| 1 | `stories.md:9-11`；`one-pager.md:17` | `eduharness/runs/_receipts/s1-v3-frozen-real-20261119-01.process.json:2-9`；`eduharness/docs/status.md:183-203,214-234`；`eduharness/docs/learnings/2026-11/20261119-structured-judge-reasons.md:3-11` | HTTP 200、strict 请求和 JSON 解析不等于本地校验；2fbefc7 是失败执行，3125adb 记失败，10654a7 修复并冻结补评，20c7056 是后续完整五格。 |
| 2 | `stories.md:15-18`；`one-pager.md:18` | `eduharness/docs/status.md:11,114-118`；`eduharness/runs/ruler-test-v3-real-01/test-report.md:13-28` | 同题总分 25/25；lecture 数值 3/6、有证据配对 2/6、命中 0/6，整轮未过；720a875 记结论。 |
| 3 | `stories.md:23-27`；`one-pager.md:19` | `eduharness/runs/harness-ab-v1/ab-report.md:9-19,52-58`；`eduharness/.tmp/scratch/harness-ab/preregistration.md:29-34`；`eduharness/runs/harness-ab-v1/behavior-audit.md:3-17`；`eduharness/docs/status.md:12` | 行为命中只多一题；表征转换差 −0.50，基线 2.00；两道采用条件未满足，32ed5be 记录保留基线。 |
| 4 | `resume-bullets.md:7,25` | `eduharness/runs/harness-ab-v1/ab-report.md:60-73`；`eduharness/contracts/artifacts/README.md:5-17` | 195 是三侧合计已记录请求，包括重试；核对的是收据、PID 和评测身份，不是重采样同结果。 |
| 5 | `next-gen.md:21-28` | `eduharness/runs/ruler-train-score-v1/calibration-report.md:39-53`；`eduharness/runs/ruler-train-rescore-v4-20261120-01/calibration-report.md:40-52,150-163` | 两版各 8 个错档均为相邻档，其中 7 个是 1→0；v3 初评没有 1 档，v4 有两个。 |
| 6 | `next-gen.md:11-12,17` | `eduharness/docs/learnings/2026-11/20261121-ab-baseline-headroom.md:3-11`；`Anthropic《Demystifying evals for AI agents》：“Capability vs. regression evals”、Step 7` | 历史全量 1.760、历史同题 1.60、本轮 2.00；原文支持能力题毕业，不规定 TeachArena 的同批筛题门。 |
| 7 | `general-qa.md:73-75`；`next-gen.md:11,36` | `eduharness/docs/learnings/2026-11/20261120-holdout-exposure.md:3-11` | A/B 复用了 10 道已揭分测试题；须另锁新留出，不能复用来证明新版泛化。 |
| 8 | `next-gen.md:15` | `eduharness/contracts/learner/schema.mjs:3-7`；`eduharness/contracts/learner/README.md:3`；`eduharness/runs/harness-ab-v1/ab-report.md:75-77` | 现行学生解析验单个 JSON 与非空 text；保真反馈对照是设计，不是已实现或已有实测。 |

八处均相符。没有执行 eduharness 命令或跑评测。

## 三道门禁改版：交付校验

- 面试官试读（DeepSeek V4.1 Flash）：第一轮命中讲稿验收段与两条简历追问备注；逐句改后第二轮只读讲稿与简历，明确回答第 3 问无命中，能复述所搭三道门。
- 原件核对（GPT-6.2-sol）：独立检查八处，先通过七处，第六处要求把历史全量 1.760、历史同题 1.60、本轮均值 2.00 分开；已修，第八处学生结构契约由主线程读原件补核。
- 最终文件：讲稿头五句、五个 STAR 的 S/T、中英文各五条条目以动作开头。可信度段按讲稿时间安排为 32/180 秒；10 站共 235 分钟；通用题 24 道、都有项目落点；旧结果占位 0 处。
- 笔记仅记录读取时 SHA256，未写、未移动或新增；notes/ 外 47 个归档文件的哈希与起点核对一致。

| 文件 | 行数 | SHA256 |
| --- | ---: | --- |
| `interview/concepts.md` | 109 | `2c515e13b13b9d7a1f962f41c5071e63d5afd6a825a2d48d856f24efeb90c1bc` |
| `interview/dont-say.md` | 35 | `4294a1ea7cd40554660d711cabc56cc053c4ee79b84138d36cff4cd63830d404` |
| `interview/general-qa.md` | 157 | `743f0b16f37e106cda636962b8266a40b5e219b84e84002289adb3da2e44f5bf` |
| `interview/next-gen.md` | 36 | `69fa3a94d548b68b1c29a9cfc19319ce4c03a51b4f881ae133ef2d386647ad7b` |
| `interview/one-pager.md` | 31 | `2ee5095d50af8767402558de0fa48789589e3b727ee36d012fdb169a30a61ba4` |
| `interview/qa-bank.md` | 194 | `16e339c17156ee0d03513657445436dea1f6bd4c619e7775cd5460dd0b84e9ee` |
| `interview/resume-bullets.md` | 27 | `a47e206422fb08e61ae078fd24494839a63fdd932cf4f061b2d5f31f9998970a` |
| `interview/stories.md` | 45 | `91ded1ece018c81a102a455c5b0cbc78c18dae43db8f4f0ddcf0ea7f5fa01f33` |
| `interview/study-path.md` | 78 | `344b86e5aaf958d04cb26f69ffe4d67071f25ff8d06ca2e27f0c64086b55a79e` |
