# Raft 博客证据索引（草稿）

用于 `evidence-first-project-workflow/references/raft-evidence.md`。供需要说明来源和适用条件时查阅，不是额外执行流程。Raft 证据取自 [Raft 中文博客](https://raft.build/zh-cn/resources/blog/) 的文章清单，读取日期 2026-11-18；S05 是作者指向的英文原版。以下是 Raft 自述或观点，未对产品和效果数据做独立验证。引文中的产品实现不是技能要求。 末尾另列本次术语同一性补充的 EnsoCode 与 Raft 出处。

| 观点 | 对照 | 归类 | 合入正文 |
| --- | --- | --- | --- |
| R01 | M1 | 印证 | 否 |
| R02 | M2 | 修正 | 是 |
| R03 | M6 | 新增 | 否 |
| R04 | M2 | 印证 | 否 |
| R05 | M3 | 修正 | 是 |
| R06 | M4 | 新增 | 是 |
| R07 | M5 | 修正 | 否 |
| R08 | M5 | 新增 | 是 |
| R09 | M5 | 冲突 | 否 |
| R10 | M6 | 印证 | 否 |
| R11 | M7 | 修正 | 是 |
| R12 | M5 | 印证 | 否 |

## 逐篇证据

### S01 · Stamp：让 Agent 用自己的名字提交代码

[Stamp：让 Agent 用自己的名字提交代码](https://raft.build/zh-cn/resources/blog/hello-stamp/)。发布文；保留身份、测试与合入机制，排除宣传指标。

- **R03 M6。** 「每个 PR 都知道自己的作者是哪个 Agent。」
- **R07 M5。** 「先临时把修复去掉、让代码重新出错，确认新加的测试会失败；再把修复放回去，看测试通过。」
- **R11 M7。** 「每一次批准，不论来自 Agent 还是人，都只对当时那一版提交有效」

### S02 · 构造式初始上下文

[构造式初始上下文](https://raft.build/zh-cn/resources/blog/constructed-initial-context/)。长期任务的上下文恢复与评测。

- **R06 M4。** 「更早的只列文件名」
- **R06 M4。** 「原本的唤醒消息，原样保留。」
- **R08 M5。** 「每一种都能用同样的评审、对照同样的参照组量过之后再上线。」

### S03 · Raft.build 现已开放源代码

[Raft.build 现已开放源代码](https://raft.build/zh-cn/resources/blog/raft-build-is-now-source-available/)。发布文；保留贡献筛选与决策历史，排除授权模式建议。

- **R01 M1。** 「更重要的是，筛选应该发生在实现之前。」
- **R10 M6。** 「还应该有 decision history、intent history，以及 conversation history。」

### S04 · 别找我，找我的 Agent

[别找我，找我的 Agent](https://raft.build/zh-cn/resources/blog/dont-talk-to-me-talk-to-my-agents/)。产品案例；保留跨组织共享和授权边界。

- **R02 M2。** 「共享对话不等于共享访问权限。」

### S05 · How a Feature Ships, for Raft, on Raft

[How a Feature Ships, for Raft, on Raft](https://raft.build/resources/blog/how-a-feature-ships-for-raft-on-raft/)。英文原版；中文页 HTTP 200 但只有译文待写提示和英文入口。

- **R04 M2。** 「Facts live apart from whims; the serving layer is a rebuildable cache, never the source of truth.」
- **R08 M5。** 「changes one sentence in its world, and runs both worlds side by side, letting the count decide.」
- **R09 M5。** 「the one who builds is never the one who verifies.」

### S06 · 你不需要一个公司大脑

[你不需要一个公司大脑](https://raft.build/zh-cn/resources/blog/you-dont-need-a-company-brain/)。领域所有权、局部记忆和共享发现。

- **R02 M2。** 「每个 Agent 保有自己的记忆，在它们之间流动的是消息。」

### S07 · 信任不在 Code Review 里

[信任不在 Code Review 里](https://raft.build/zh-cn/resources/blog/trust-doesnt-live-in-the-code-review/)。主抓取报 fetch failed；curl 可取 HTML，备用 Invoke-WebRequest HTTP 200 并提取文章正文。

- **R07 M5。** 「一个存活的 mutant 是你的套件仍然祝福的错误版程序」

### S08 · DAU 从未算上你团队的另一半：介绍 DAA

[DAU 从未算上你团队的另一半：介绍 DAA](https://raft.build/zh-cn/resources/blog/dau-was-never-counting-half-your-team/)。工程度量边界与接力信号；不采用站内活跃指标。

- **R12 M5。** 「它计数 Agent 的存在，而不是 Agent 之间的协作。」

### S09 · 为 Agent 搜索设计舒适的 AX

[为 Agent 搜索设计舒适的 AX](https://raft.build/zh-cn/resources/blog/a-comfortable-ax-for-agent-search/)。按需读取、截断标记与下一步动作。

- **R05 M3。** 「返回 ID、匹配关键词周围文本的预览并高亮命中位置，以及**一个明确的下一个动作**：读取周围上下文查看完整线程。」

### S10 · Agent 需要名字

[Agent 需要名字](https://raft.build/zh-cn/resources/blog/agents-need-names/)。协作寻址与历史的归属。

- **R03 M6。** 「@Noel 不是贴标签，是路由：把请求投递到一个已知专长、已知记忆、已知期望的特定接收者。」

### S11 · 房间里有了 Agent，就一定会混乱吗？

[房间里有了 Agent，就一定会混乱吗？](https://raft.build/zh-cn/resources/blog/is-having-agents-in-the-room-meant-to-be-chaotic/)。消息拉取、并发状态与提交前检查。

- **R05 M3。** 「它不拉的信号不会进入工作上下文；它们保持可查询，以备后续需要。」
- **R11 M7。** 「每次发送携带一个标记，指示草稿是基于房间的哪个版本写的。」

## 使用边界

- R02 的分隔是所有权和授权约束，不自动证明某项实现满足安全要求。
- R04 的读时过滤只适合该案例的变化频率和读写成本。保留权威归属比采用某种缓存策略重要。
- R05 与 R06 的摘要用于寻址。当前结论必须回读权威原件；不采用文章的时间、token 或消息条数阈值。
- R07、R08 的反证和对照只支持其样例和环境。不能把厂商评审或旧新比较等同于真实交付验证。
- R09 按 Raft 报告的交付现场理解。原稿 M5 不强制多 Agent，保持按风险选验证者，同时保留已有的授权责任。
- R11 只在版本或状态差异能改变结论时重验。通过、跳过和过期是不同状态，不把产品的合入规则移植为通用权限。
- R12 的可见消息口径描述活动，不代表行为质量或团队生产率。

排除：[介绍 Raft：人类与 AI Agent 一起创造的地方](https://raft.build/zh-cn/resources/blog/introducing-raft-where-humans-and-agents-build-together/)。产品总览，没有额外的工程证据需要纳入。

## 术语同一性的位置与出处

**位置：分别补 M2、M3、M7，不另设 M8。** M2 定义由谁维护术语、怎样判定、改名怎样生效。M3 规定写场景卡、计划和汇报时怎样引用。M7 检查何时阻断、何时提示。三处沿用现有的归属、使用和检查职责，只维护一份术语定义；另设 M8 会让术语归属和检查规则有第二个入口。

| 来源 | 查到什么 | 原文摘录 |
| --- | --- | --- |
| EnsoCode `0a54bc0` | 有局部术语表。它出现在归档 PRD，不能当作现行全项目术语表。 | [归档 PRD 的术语表](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/project-history/archive/2026-08/08-28-model-center-default-agent/prd.md#L101-L104) 的列名是「术语」「含义」；定义分别写「一条 `ModelProvider`：订阅账号或一份 API-key 配置，可启用 / 禁用」和「分组用的 vendor（如 Anthropic、xAI）或用户自填的自定义端点；不是条目本身」。 |
| EnsoCode `0a54bc0` | 有现行做法。运行文档把状态和退出码、代码信号对齐。全项目统一术语表：无（在固定快照的目录和文档检查范围内未发现）。 | [运行文档的退出码表](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/enso-server-run.md#L83-L91) 把 `0` 定义为「会话正常结束。goal 模式里这表示 `goal_complete`」，把 `3` 定义为「goal 被 `goal_blocked` 或 `goal_wait` 停住」。 |
| Raft 博客 | 全项目统一术语表：无（已调查的博客范围内未见）。有固定中英文名称和可判定的度量定义。 | [S02](https://raft.build/zh-cn/resources/blog/constructed-initial-context/)：「这第一条输入，我们叫它构造式初始上下文（constructed initial context）。」[S08](https://raft.build/zh-cn/resources/blog/dau-was-never-counting-half-your-team/)：「一个 Daily Active Agent 是在该 UTC 日至少发送了一条可见消息的 Agent，与 DAU 计数人类的方式一致。」 |

一份权威术语表、五项词条字段、全仓改名、别名到期和两项 CI 检查是用户新增要求。上述出处只印证局部消歧、状态映射、中英文配对与可判定定义，不能证明任一来源采用了全套规则。这一补充不计入前文的 12 条 Raft 观点统计。
