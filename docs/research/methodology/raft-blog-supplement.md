# Raft 博客对 M1–M7 的补充建议

## 结论与范围

纳入中文博客列表的 11 篇文章，跳过 1 篇。按工程做法去重后有 12 条：新增 3、印证 4、修正 4、冲突 1。建议只合入 M2 R02、M3 R05、M4 R06、M5 R08、M7 R11，不另起 M8。引文单独收入未来的 `references/raft-evidence.md`，不写入技能正文。全文按建议而不是 Raft 的产品做法落地。

原始方法论基线是经 SHA-256 校验的 `general-methodology.md`（`6C6EAA2C1281B01B09FE9D7482EDD67E719638A6B29B60C2E40AB5988E2326EB`）。列表为 [Raft 中文博客](https://raft.build/zh-cn/resources/blog/)，读取日期为 2026-11-18。正文是 Raft 的描述、经验或观点，不等于独立效果验证。未运行产品、未做付费评测，初次调研未访问安装目录；追加术语要求时只读了已安装的技能正文，供更新补丁基线。

## 对照表

每行只计一次。多篇文章支持同一做法时合并，不因额外引文增加统计。「做法」是对原稿的建议，不是引文内容。英文保留原文。来源列表的反向索引说明每篇作了哪些贡献。

| 编号 | 分类 | 对照 | 一句话观点 | 解决什么问题 | 通用做法与判断 | 原文摘录 |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | 印证 | M1 | 在实现前筛选值得解决的问题，提交意图和限制比提交一份看似完整的补丁更有用。 | 生成实现便宜，理解和评审却仍昂贵。 | 用场景卡先核对真实问题、取舍和验收证据，再决定是否实现。原稿已要求先倒推结果；不引入新的提案制度。 | [S03](https://raft.build/zh-cn/resources/blog/raft-build-is-now-source-available/)：「更重要的是，筛选应该发生在实现之前。」 |
| R02 | 修正 | M2 | 共享完成任务所需的事实和证据，不等于合并各参与者的工作记忆或开放同一权限。 | 重复维护中央知识库、给跨边界协作过大的访问权限。 | 让责任方维护权威记录；共享最小证据或指针，通过目标侧权限访问。私有笔记可并存，不能成为另一份公共事实。原稿已定事实归属，此处补足共享与授权的区别。 | [S04](https://raft.build/zh-cn/resources/blog/dont-talk-to-me-talk-to-my-agents/)：「共享对话不等于共享访问权限。」<br>[S06](https://raft.build/zh-cn/resources/blog/you-dont-need-a-company-brain/)：「每个 Agent 保有自己的记忆，在它们之间流动的是消息。」 |
| R03 | 新增 | M6 | 需要持续接力时，为下一责任人留稳定标识，并把交接和反馈系到具体工作项及证据。 | 匿名执行池让旧反馈找不到接收者，名字又可能被误当作能力或授权。 | 只在跨会话接手或持续反馈有实际需求时记录接收者，不强制给一次性执行者建身份。用当前证据校准信任；身份不是授权。可放 M6「当前状态、下一步」后，本轮不收进正文，避免和已有归属、交接检查重复。 | [S10](https://raft.build/zh-cn/resources/blog/agents-need-names/)：「@Noel 不是贴标签，是路由：把请求投递到一个已知专长、已知记忆、已知期望的特定接收者。」<br>[S01](https://raft.build/zh-cn/resources/blog/hello-stamp/)：「每个 PR 都知道自己的作者是哪个 Agent。」 |
| R04 | 印证 | M2 | 分开事实、易变状态和可重建读取视图，别因状态变化重建事实。 | 把不同变化频率的对象在读模型里固化，局部改动迫使全局重算。 | 先标注权威写入路径；只有这些状态变化暴露了重建成本，才评估读时过滤等策略。不把读时过滤设为标准方案。读视图单向依赖归属方，和已确认的单向依赖示例相容；文章没有规定通用的契约拆分方式。 | [S05](https://raft.build/resources/blog/how-a-feature-ships-for-raft-on-raft/)：「Facts live apart from whims; the serving layer is a rebuildable cache, never the source of truth.」 |
| R05 | 修正 | M3 | 索引或预览给出足够判断相关性的局部上下文，标明省略之处，并指向可执行的回读动作。 | 裸 ID 导致多轮查询，全部灌入浪费注意力，片段引用容易遗漏后续更正。 | 在摘要、证据索引和通知中保留短预览及原件入口；按需拉取背景。做结论前回读原件和后续更正。原稿的「短入口」因而有可检查的输出形态。 | [S09](https://raft.build/zh-cn/resources/blog/a-comfortable-ax-for-agent-search/)：「返回 ID、匹配关键词周围文本的预览并高亮命中位置，以及**一个明确的下一个动作**：读取周围上下文查看完整线程。」<br>[S11](https://raft.build/zh-cn/resources/blog/is-having-agents-in-the-room-meant-to-be-chaotic/)：「它不拉的信号不会进入工作上下文；它们保持可查询，以备后续需要。」 |
| R06 | 新增 | M4 | 跨会话恢复时，从当前任务和权威原件构造最小输入，不把整段会话或旧待办继承为指令。 | 冷启动要补上下文，但把历史整段搬回会放大过时信息，使 Agent 偏离当前请求。 | 原样保留当前请求；带入有效约束和仍相关的证据。历史只作带来源的指针，过时的下一步不当作待办，敏感内容不带入。原稿已有隔离与回读，没有描述恢复时如何选择输入。 | [S02](https://raft.build/zh-cn/resources/blog/constructed-initial-context/)：「更早的只列文件名」<br>[S02](https://raft.build/zh-cn/resources/blog/constructed-initial-context/)：「原本的唤醒消息，原样保留。」 |
| R07 | 修正 | M5 | 现有防线已绿时，可以在隔离环境故意破坏关键行为，验证防线确实会拦截。 | 旧测试、监控或检查都显示绿，但没有证据表明目标失效能触发它们。 | 选一个代表性失效注入，记录检查触发与恢复后通过。新增测试仍照原稿先红后绿；区别是此处可反证已有防线，不要求全量变异测试。 | [S07](https://raft.build/zh-cn/resources/blog/trust-doesnt-live-in-the-code-review/)：「一个存活的 mutant 是你的套件仍然祝福的错误版程序」<br>[S01](https://raft.build/zh-cn/resources/blog/hello-stamp/)：「先临时把修复去掉、让代码重新出错，确认新加的测试会失败；再把修复放回去，看测试通过。」 |
| R08 | 新增 | M5 | 改进 Agent 的指令、工具或上下文时，用同一失败案例对照旧版和单项改动，并保留正常对照。 | 到处改提示词、环境和工具后，无法判断改善来自哪里，或是否破坏原来正常的任务。 | 固定可固定的输入、权限、版本与验收判据，留存两组运行原件和差异；同时复跑正常案例。难以复现时说明条件与波动，不把离线对照声称为真实部署验证。原稿没有要求以旧版为对照隔离单项改动。 | [S05](https://raft.build/resources/blog/how-a-feature-ships-for-raft-on-raft/)：「changes one sentence in its world, and runs both worlds side by side, letting the count decide.」<br>[S02](https://raft.build/zh-cn/resources/blog/constructed-initial-context/)：「每一种都能用同样的评审、对照同样的参照组量过之后再上线。」 |
| R09 | 冲突 | M5 | Raft 的功能交付案例把作者与验证者强制分离，原稿只对关键契约建议分开。 | 自证可能沿用作者的错误假设，但把独立验证设为所有任务的硬门槛会增加协作成本。 | Raft 把独立验证用作其交付门槛，并按验证者专长分证据；原稿 M5 明写「关键契约可由不同人写测试和实现，但不强制依赖多 Agent 或特定工具」。判断：只把冲突归于门槛范围，不把 Raft 的团队实践推广成通用规则。高风险或不可逆动作优先争取独立验证，授权审批另算；不改正文。 | [S05](https://raft.build/resources/blog/how-a-feature-ships-for-raft-on-raft/)：「the one who builds is never the one who verifies.」 |
| R10 | 印证 | M6 | 保留能解释取舍的决策理由和失败尝试，不靠提交列表重建项目意图。 | 提交可以用于定位改动，未必解释为什么选了这条路径。 | 在当前契约更新后，归档问题、取舍和证据链接。原稿已有历史边界和教训筛选；不要求保存整段对话，也不主张隐藏提交历史。 | [S03](https://raft.build/zh-cn/resources/blog/raft-build-is-now-source-available/)：「还应该有 decision history、intent history，以及 conversation history。」 |
| R11 | 修正 | M7 | 证据和批准必须对应正在生效的版本；共享状态变化会影响结论时，在提交边界重新核对。 | 审过 A 却提交 B，把旧状态下生成的动作提交到新状态，或把跳过的检查误报为绿。 | 记录被检对象的版本或状态；它变化且影响结论时，机械阻止旧证据或把它标为过期，要求重验。明确未执行与通过是不同状态；不以规则代替授权或人的判断。 | [S01](https://raft.build/zh-cn/resources/blog/hello-stamp/)：「每一次批准，不论来自 Agent 还是人，都只对当时那一版提交有效」<br>[S11](https://raft.build/zh-cn/resources/blog/is-having-agents-in-the-room-meant-to-be-chaotic/)：「每次发送携带一个标记，指示草稿是基于房间的哪个版本写的。」 |
| R12 | 印证 | M5 | 活动计数可以描述参与形态，不能证明完成质量或成功交接。 | 消息量和参与者数量容易成为好看的交付替代品。 | 明确统计对象、分母和时间窗口。要证明交接，抽查接收者是否按证据完成下一步。原稿已要求按声明选证据，故不新增 DAA 指标。 | [S08](https://raft.build/zh-cn/resources/blog/dau-was-never-counting-half-your-team/)：「它计数 Agent 的存在，而不是 Agent 之间的协作。」 |

### 覆盖与取舍

| 原稿章节 | 相关观点 | 落入补丁 |
| --- | --- | --- |
| M1 | R01 | 不改 |
| M2 | R02、R04 | R02 |
| M3 | R05 | R05 |
| M4 | R06 | R06 |
| M5 | R07、R08、R09、R12 | R08 |
| M6 | R03、R10 | 不改 |
| M7 | R11 | R11 |

R03 需要持续接手的场景才有价值，且已有 M2 归属和 M6 交接位置，不另加身份流程。R07 值得在旧防线可疑时使用，但原稿已要求观察失败和回归，暂不把变异手段写入默认正文。R09 是交付门槛的范围冲突，不代表 Raft 取消了高风险的人类授权，也不代表代码阅读没有价值。印证项不重复入正文。M2 已确认的「契约按归属边界拆分、依赖单向」示例不改。

## 合入建议

下面的 diff 以只读核验的已安装 `SKILL.md` 为基线，合并原先的五条 Raft 建议和本次术语同一性要求。基线 93 行，建议稿 115 行，含 frontmatter 和空行，低于 250 行。正文不新增出处或项目专用内容；摘录留在 `references/raft-evidence.md` 草稿。

```diff
diff --git a/SKILL.md b/SKILL.md
--- a/SKILL.md
+++ b/SKILL.md
@@ -47,2 +47,10 @@
 **做法。** 列出行为、数据、配置和依赖的归属。区分原始记录、可重建视图及允许写入的入口。先查现有代码和上游公开接口；能复用就复用，仅在边界集中必要的校验、策略或适配。没有实际调用者或故障约束时，不实现通用框架。锁定关键依赖版本；不得不碰私有接口时记录理由、可观察回归和升级复检点。形似而语义不同的逻辑可以分开，单一归属不等于把所有逻辑塞进一个类。
+
+跨团队或跨权限域协作时，只共享完成任务所需的记录或原件入口。能看到共享结果，不等于能访问来源或行使写入权；在授权边界分别校验。各方可以保留私有笔记，但不得用它覆盖公共事实。
+
+**术语同一性。** 每个概念只用一个规范术语，每个术语只表达一个意思。项目只维护一份权威术语表，中英文名称成对固定。每个词条写五项：定义、最容易混淆但不等同的概念、判定依据（字段、枚举值或检查方式）、所属契约、启用版本。
+
+「完成」「有效」「通过」「失败」等状态或结论必须有可判定的定义。文档与代码统一用词；文档用语与代码字段名或枚举值不同时，在术语表中写明对应关系。
+
+把改名当作契约变更。在同一次变更中全仓替换旧名，把旧名收入禁用表。确需兼容时，仅在明确的兼容范围内保留别名，并登记到期时间；到期后禁用。
 
@@ -57,2 +65,8 @@
 **做法。** README 回答「这是什么、怎么跑第一条场景」。Agent 入口只留高频约束与按任务查阅的路线。指南写「怎么做」，参考写「当前如何工作」，计划写「接下来做什么」，历史写「当时为什么以及当时证明了什么」。可变状态尽量指向代码、版本化配置或可校验的证据索引。当前源码与规范冲突时，分别确认实际行为和承诺，按授权修正规范或实现，不把当前实现自动当成正确契约。共享的调试步骤只有一个维护点。按真实阅读需求拆文件，不要求每种知识先建一个目录。
+
+为索引、搜索命中或通知提供足够判断相关性的短预览，标明省略处，并给出回读原件的路径或动作。需要下结论时再取完整上下文和后续更正。
+
+场景卡、计划和汇报只用术语表已登记的项目术语。新术语先登记，再首次使用；中英文按术语表引用，不自行翻译，也不在各处另写定义。
+
+**示例。** 「已记录」不等于「执行成功」，「已打分」不等于「分数有效」，「会话说完成了」不等于「验收通过」。
 
@@ -65,2 +79,4 @@
 **做法。** 文档说明冷启动命令、依赖版本、配置优先级、输出格式、退出码和副作用。临时验证用独立目录和干净环境。让每次运行有稳定标识，在一个运行根下区分输入版本、原件、派生结果和诊断；生成器负责路径，调用者只给根目录或 ID。保存必要的摘要索引和证据链接，不提交凭据、未经脱敏的敏感内容或临时日志；定义保留与清理。机器读取结构化结果，人工诊断走单独通道。离线模式与真实模式复用业务主路径，在外部边界换输入；把模式写进产物，避免把模拟误当实证。
+
+跨会话接手时，原样保留当前请求，只带入有效约束和仍相关的原件。旧记录保留可按需回读的指针，不把旧待办或旧失败自动当作当前指令。
 
@@ -73,2 +89,4 @@
 **做法。** 对可单测契约先跑测试，看它按预期断言失败，再最小实现、重跑同一命令并回归。覆盖坏输入、截断、超时和边界条件，按真实风险选择，不断言内部调用代替输出。用临时目录和固定数据做日常验证。涉及真实外部依赖或交付物时，用代表性条件单独跑真实场景，读取原件，确认退出状态、证据和故障定位；未授权或未跑就标待验证。每条声明写明覆盖范围。正式、昂贵或跨供应商检查独立开关，不默认进入日常测试；关键契约可由不同人写测试和实现，但不强制依赖多 Agent 或特定工具。
+
+改进 Agent 的指令、工具或上下文时，在等价的隔离环境中用同一失败案例对照旧版和单项改动，并保留正常案例防回退。固定可固定的输入、权限和判定条件，分别保留运行原件；条件不一致时不要声称改动导致差异。
 
@@ -89,2 +107,6 @@
 **做法。** 对公开接口变更说明应同步的契约、测试和文档。命令选项、默认和 schema 能从实现提取就生成或对比，不造第二份手填表。从坏链接、错误产物路径、失配字段和缺必要证据开始；确定性错误阻断，篇幅等维护信号只提示。让本地和 PR CI 用同一离线检查入口，发布或授权的真实验证另有任务；明写触发条件、范围和没查什么。每次高代价问题先补根因层回归，有普遍判定规则才升级到 CI；不为单次笔误做治理平台。
+
+把检查和批准绑定到它们覆盖的版本或状态。提交前核对；变化会影响结论时，旧结果标为过期并重验。未执行、被跳过和通过分别记录。
+
+在本地和 CI 的同一入口加入两项检查。第一项检查受管文档和代码中的禁用词、旧名及过期别名，按登记的兼容范围判定。第二项提示「未登记的新术语」。能确定违规的命中直接阻断，无法可靠判定的只提示；不把普通词汇、原文引语或标记为历史的记录误当作现行术语。
 
```

## 术语同一性的位置与出处

**位置：分别补 M2、M3、M7，不另设 M8。** M2 定义由谁维护术语、怎样判定、改名怎样生效。M3 规定写场景卡、计划和汇报时怎样引用。M7 检查何时阻断、何时提示。三处沿用现有的归属、使用和检查职责，只维护一份术语定义；另设 M8 会让术语归属和检查规则有第二个入口。

| 来源 | 查到什么 | 原文摘录 |
| --- | --- | --- |
| EnsoCode `0a54bc0` | 有局部术语表。它出现在归档 PRD，不能当作现行全项目术语表。 | [归档 PRD 的术语表](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/project-history/archive/2026-08/08-28-model-center-default-agent/prd.md#L101-L104) 的列名是「术语」「含义」；定义分别写「一条 `ModelProvider`：订阅账号或一份 API-key 配置，可启用 / 禁用」和「分组用的 vendor（如 Anthropic、xAI）或用户自填的自定义端点；不是条目本身」。 |
| EnsoCode `0a54bc0` | 有现行做法。运行文档把状态和退出码、代码信号对齐。全项目统一术语表：无（在固定快照的目录和文档检查范围内未发现）。 | [运行文档的退出码表](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/enso-server-run.md#L83-L91) 把 `0` 定义为「会话正常结束。goal 模式里这表示 `goal_complete`」，把 `3` 定义为「goal 被 `goal_blocked` 或 `goal_wait` 停住」。 |
| Raft 博客 | 全项目统一术语表：无（已调查的博客范围内未见）。有固定中英文名称和可判定的度量定义。 | [S02](https://raft.build/zh-cn/resources/blog/constructed-initial-context/)：「这第一条输入，我们叫它构造式初始上下文（constructed initial context）。」[S08](https://raft.build/zh-cn/resources/blog/dau-was-never-counting-half-your-team/)：「一个 Daily Active Agent 是在该 UTC 日至少发送了一条可见消息的 Agent，与 DAU 计数人类的方式一致。」 |

一份权威术语表、五项词条字段、全仓改名、别名到期和两项 CI 检查是用户新增要求。上述出处只印证局部消歧、状态映射、中英文配对与可判定定义，不能证明任一来源采用了全套规则。这一补充不计入前文的 12 条 Raft 观点统计。

## 单独回答：把时间用回主线

**少在基础设施上耗时间：有。** [功能交付案例](https://raft.build/resources/blog/how-a-feature-ships-for-raft-on-raft/) 的变更是一个静音开关。它先定位一次发送为何带来长期订阅成本，才改投递和读取边界。R04 保留的做法是先查谁拥有事实、谁在读，再只动产生额外工作的部分。[构造式初始上下文](https://raft.build/zh-cn/resources/blog/constructed-initial-context/) 也明说只改自己能决定的两个点，何时开会话和第一条输入，而不是重写运行时。可执行做法是先给当前主线场景一个可重复的失败或耗时证据，再列出最小解除阻塞的动作和停止条件。例如现有入口能跑通代表性验收且保留证据，就先回主线；只有入口反复造成可复现的阻塞，才为它建独立切片。不要把读时过滤、重开会话和建设共享平台当作前置项目。这里的停止条件是对原稿执行顺序的应用，不是 Raft 的原话。

**给改进 Agent 准备独立、干净的环境：有，但三种隔离要区分。** [Stamp](https://raft.build/zh-cn/resources/blog/hello-stamp/) 说多个 Agent 可以共用仓库、各用 git worktree，可借用来隔离文件改动，不需要复制一整套基础设施。R06 支持从新会话用最小有效上下文起跑；R08 支持在等价的环境对照旧版和一项改动。建议先固定基线版本、任务输入、工具与授权，选一个确实失败的样例和一个正常样例。为两组分别用独立运行目录，不共用可写状态或结果目录；改代码时才需要各自干净副本或 worktree。给独立验证者同一验收契约和原件入口，但不继承作者的会话结论。读回输出与失败定位后，条件足够就结束实验并回主线。worktree 本身不隔离权限、依赖缓存、网络或外部副作用；行为复现和安全隔离要分别声明。文章没有提供一套跨宿主的干净环境规范，上述组合是本报告的推导。

## 篇目与抓取记录

| 来源 | 篇目 | 处理与理由 | 观点 |
| --- | --- | --- | --- |
| S01 | [Stamp：让 Agent 用自己的名字提交代码](https://raft.build/zh-cn/resources/blog/hello-stamp/) | 发布文；保留身份、测试与合入机制，排除宣传指标。 | R03、R07、R11 |
| S02 | [构造式初始上下文](https://raft.build/zh-cn/resources/blog/constructed-initial-context/) | 长期任务的上下文恢复与评测。 | R06、R08 |
| S03 | [Raft.build 现已开放源代码](https://raft.build/zh-cn/resources/blog/raft-build-is-now-source-available/) | 发布文；保留贡献筛选与决策历史，排除授权模式建议。 | R01、R10 |
| S04 | [别找我，找我的 Agent](https://raft.build/zh-cn/resources/blog/dont-talk-to-me-talk-to-my-agents/) | 产品案例；保留跨组织共享和授权边界。 | R02 |
| S05 | [How a Feature Ships, for Raft, on Raft](https://raft.build/resources/blog/how-a-feature-ships-for-raft-on-raft/) | 英文原版；中文页 HTTP 200 但只有译文待写提示和英文入口。 | R04、R08、R09 |
| S06 | [你不需要一个公司大脑](https://raft.build/zh-cn/resources/blog/you-dont-need-a-company-brain/) | 领域所有权、局部记忆和共享发现。 | R02 |
| S07 | [信任不在 Code Review 里](https://raft.build/zh-cn/resources/blog/trust-doesnt-live-in-the-code-review/) | 主抓取报 fetch failed；curl 可取 HTML，备用 Invoke-WebRequest HTTP 200 并提取文章正文。 | R07 |
| S08 | [DAU 从未算上你团队的另一半：介绍 DAA](https://raft.build/zh-cn/resources/blog/dau-was-never-counting-half-your-team/) | 工程度量边界与接力信号；不采用站内活跃指标。 | R12 |
| S09 | [为 Agent 搜索设计舒适的 AX](https://raft.build/zh-cn/resources/blog/a-comfortable-ax-for-agent-search/) | 按需读取、截断标记与下一步动作。 | R05 |
| S10 | [Agent 需要名字](https://raft.build/zh-cn/resources/blog/agents-need-names/) | 协作寻址与历史的归属。 | R03 |
| S11 | [房间里有了 Agent，就一定会混乱吗？](https://raft.build/zh-cn/resources/blog/is-having-agents-in-the-room-meant-to-be-chaotic/) | 消息拉取、并发状态与提交前检查。 | R05、R11 |
| S12 | [介绍 Raft：人类与 AI Agent 一起创造的地方](https://raft.build/zh-cn/resources/blog/introducing-raft-where-humans-and-agents-build-together/) | 跳过。产品总览，持续身份、任务与协作的主要论点已有更具体的机制文章；不单独计证据。 | 不计 |

英文原版入口来自[中文占位页](https://raft.build/zh-cn/resources/blog/how-a-feature-ships-for-raft-on-raft/)，不另计文章。《信任不在 Code Review 里》的主抓取失败发生在上述 S07 URL，报 `fetch failed`；HTTP 备用读取已补齐。没有最终不可读的篇目。仅跳过 S12，不从营销概要外推机制或效果。
