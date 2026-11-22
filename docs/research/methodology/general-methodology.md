---
name: evidence-first-project-workflow
description: Guides human and Agent teams in starting projects, planning nontrivial changes, and handing off work with verifiable acceptance, clear ownership, and reproducible evidence. Not needed for simple lookups or trivial edits.
---

# 有证据的项目协作方法

适用于新项目起步、跨模块改动、交付标准易误读或需要换人接手的任务。小改动可以行内记录行为和检查，不必另建计划。权限、费用、数据访问和外部写入以项目和任务的授权为准，本方法不授予权限。

## 执行顺序

1. **定义要证明什么（M1）。** 先填场景卡；没有可读回的证据，就先缩小场景或补证据入口，不要先选架构。
2. **定边界和入口（M2、M3）。** 为第一张卡定行为归属、权威记录和阅读入口。先写最短可用版本，不预建空白分类。
3. **跑通一条纵向路径（M4、M5）。** 先让代表性场景在隔离环境可重跑，再验证真实边界。只有卡片或已有故障证明需要时，才扩建共享基础设施。
4. **按证据推进和归档（M6）。** 非平凡工作在步骤 2 后立计划；每交一片就更新证据和剩余风险。不要让计划代替当前契约。
5. **固定重复检查（M7）。** 第一条路径走通后，先把便宜、确定的检查接入本地和 CI；有新故障时，优先补在责任层，而不是加一份说明。新接手者按同一个入口回读证据，检验 M3、M4 是否可用。

依赖关系：M1 给 M2 和 M5 提供目标；M2 决定 M3 的内容归属和 M4 的可信产物；M4 让 M5 的结果可回读；M6 消费这些证据，不产生另一份事实；M7 拦截可机械识别的偏差，不能代替验收判断。

以下证据固定在 EnsoCode 提交 `0a54bc0ba5686561c7595af3d599f648f916b5f6`。引号内是原文；步骤和取舍是根据快照推导的建议，不宣称 EnsoCode 已采用整套方法。本文件可作为独立技能候选稿，未做宿主安装或 Agent 行为实测。

## M1 · 先写验收场景，再决定怎么做

**原则。** 先写验收场景卡，再从可观察结果倒推实现、测试和文档。

**解决的问题。** 把实现清单当成果，把编译通过或 Agent 自报当作验收，真实使用者仍无法完成任务。

**做法。** 为每张卡给一个稳定 ID，再填六栏：

| 栏 | 填什么 |
| --- | --- |
| 谁 | 谁执行或接收结果，人、脚本或 Agent 都可以。 |
| 条件 | 初始状态、输入、版本、权限和预算；标明离线、模拟还是真实。 |
| 能完成什么 | 从现有入口执行的动作和可观察结果。 |
| 证据 | 检查命令或人工步骤、通过条件、可回读的原件位置。 |
| 失败可定位 | 失败时能指出哪一步、哪项输入或哪条契约出了问题。 |
| 不算交付 | 写明哪些近似物不能替代结果，例如仅有截图、模拟成功或测试无断言。 |

从结果反推最小调用链和行为归属，从证据反推测试与保留产物，从条件和失败反推快速开始、契约与排障说明。评审时逐卡对照，不用功能项打勾替代。小改保留六个问题的最短回答，不要求新文件；探索任务可以把结果定义为能判别两个假设的证据。

**证据。** 六栏模板来自用户已确认的方法，不归为 EnsoCode 原创。[动手前检查清单](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/engineering-reference/guides/pre-implementation-checklist.md) 要求「现在会发生什么，应该发生什么？」；[开发调试](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/dev-debugging.md) 将「验证 UI / 往 composer 发消息 / 读对话状态」指向一套实际操作步骤。它们支持先写行为差距和验证动作，并不证明该仓库使用六栏卡。

## M2 · 为事实和公共能力各定一个归属

**原则。** 共享语义由一个责任层维护，能用成熟依赖或现有实现解决的问题不另起一条路径。

**解决的问题。** 同一个规则在多个入口各修一次，缓存被当成事实，或为局部需求追加昂贵基础设施。

**做法。** 列出行为、数据、配置和依赖的归属。区分原始记录、可重建视图及允许写入的入口。先查现有代码和上游公开接口；能复用就复用，仅在边界集中必要的校验、策略或适配。没有实际调用者或故障约束时，不实现通用框架。锁定关键依赖版本；不得不碰私有接口时记录理由、可观察回归和升级复检点。形似而语义不同的逻辑可以分开，单一归属不等于把所有逻辑塞进一个类。

**证据。** [工程开发约定](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/engineering-guidelines.md)：「session 正文是可丢弃投影，worker / jsonl 才是权威源」；「对 pi 私有 API 的依赖必须封装、测试可观察结果，并记录升级复检点。」[代码复用指南](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/engineering-reference/guides/code-reuse-thinking-guide.md)：「如果只有少数几个值不同 → 提参数，不要复制。」[配置 CLI](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/config-cli.md)：「CLI 把请求发给运行中的 Main，由 Main 走设置页同一条写入路径。」不照搬进程划分，也不把「第三次才抽象」当硬阈值；会造成事实冲突的共享语义第一次就要定归属。

## M3 · 按读者的问题组织文档

**原则。** 给新接手者一个短入口，不同种类的知识各有权威位置，只链接、不复写。

**解决的问题。** 人和 Agent 为上手通读整个仓库，或把旧计划、示例与当前契约混为一谈。

**做法。** README 回答「这是什么、怎么跑第一条场景」。Agent 入口只留高频约束与按任务查阅的路线。指南写「怎么做」，参考写「当前如何工作」，计划写「接下来做什么」，历史写「当时为什么以及当时证明了什么」。可变状态尽量指向代码、版本化配置或可校验的证据索引。当前源码与规范冲突时，分别确认实际行为和承诺，按授权修正规范或实现，不把当前实现自动当成正确契约。共享的调试步骤只有一个维护点。按真实阅读需求拆文件，不要求每种知识先建一个目录。

**证据。** [工程参考索引](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/engineering-reference/README.md)：「日常开发先读 `AGENTS.md` 与 `docs/engineering-guidelines.md`；需要深入某一层时再读本目录对应文档。」[开发调试](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/dev-debugging.md)：「等步骤以该 skill 为准，不要在别处再抄一份。」[根 README](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/README.md) 的截图链接例如 `src="docs/readme/chat.jpg"`；[该目录](https://github.com/J3n5en/EnsoCode/tree/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/readme) 是 README 图片，不是工程规范入口。保存图片的目录不必复制。

## M4 · 提供隔离的运行入口和可回读产物

**原则。** 让接手者用一个公开入口运行主路径，把可核对结果写到明确的数据目录。

**解决的问题。** 成功依赖开发者机器、缓存或私有会话；生成物散落；自动化把日志、退出码和业务结果混在一起。

**做法。** 文档说明冷启动命令、依赖版本、配置优先级、输出格式、退出码和副作用。临时验证用独立目录和干净环境。让每次运行有稳定标识，在一个运行根下区分输入版本、原件、派生结果和诊断；生成器负责路径，调用者只给根目录或 ID。保存必要的摘要索引和证据链接，不提交凭据、未经脱敏的敏感内容或临时日志；定义保留与清理。机器读取结构化结果，人工诊断走单独通道。离线模式与真实模式复用业务主路径，在外部边界换输入；把模式写进产物，避免把模拟误当实证。

**证据。** [无界面运行文档](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/enso-server-run.md)：「它走的是桌面和 `enso-server` 同一条链路」；「诊断写在 stderr。stdout 只有选定的输出格式。」文档还列 `--data-dir`、`--usage-log` 和不同退出码。[插件指南](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/plugins.md)：「条目按路径排序、时间戳固定，同样的内容得到同样的 sha256」。这支持可发现的运行边界和可验产物，不意味着必须使用容器、插件平台或给所有临时文件算哈希。

## M5 · 用不同层次的检查支持不同的声明

**原则。** 稳定逻辑用会失败的行为测试守住，端到端结果用与声明相称的原件证明。

**解决的问题。** 测试本来就绿、桩替代真实边界、成功标记没有实际结果或失败无法定位。

**做法。** 对可单测契约先跑测试，看它按预期断言失败，再最小实现、重跑同一命令并回归。覆盖坏输入、截断、超时和边界条件，按真实风险选择，不断言内部调用代替输出。用临时目录和固定数据做日常验证。涉及真实外部依赖或交付物时，用代表性条件单独跑真实场景，读取原件，确认退出状态、证据和故障定位；未授权或未跑就标待验证。每条声明写明覆盖范围。正式、昂贵或跨供应商检查独立开关，不默认进入日常测试；关键契约可由不同人写测试和实现，但不强制依赖多 Agent 或特定工具。

**证据。** [测试规范](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/engineering-reference/testing.md)：「先写失败测试再写实现」，并区分「真实网络请求、Electron 窗口行为」与日常单测；其模型自主调工具验收要求「至少跑两个不同厂商的模型」。[package.json](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/package.json#L35-L41) 将 `"test:formal"` 和 `"test:e2e:server"` 与默认 `"test"` 分开。两个厂商是 EnsoCode 对特定功能的验证范围，不是所有项目的硬门槛。

## M6 · 计划按可验收切片推进，历史不充当现状

**原则。** 计划的状态随证据更新，把完成、停止和被替代的工作留作历史，不冒充当前约定。

**解决的问题。** 大计划失控，接手者按过时设计开工，已启动和已通过看起来一样。

**做法。** 非平凡任务建一份活动计划，写场景 ID、现状与目标、归属、必改文件、非目标、依赖和先做的高风险验证。按能独立验证的结果切片，记录当前状态、下一步与证据链接；失败标定位，没授权或缺条件标阻塞。结项时先更新现行契约或入口，再冻结计划，记录结果、版本、证据、遗留项或替代去向；归档后不再维护它的「当前状态」。高代价教训只记症状、根因、修法和回归防线；低价值过程日志不转正。小任务可在变更说明里完成同样的闭环。

**证据。** [计划目录的手机计划样本](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/plans/phone-native-app-plan.md)：「**状态**：计划阶段，未落地」，并给出「双平台真机跑通配对 + 会话收发」。[历史中的实现计划](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/project-history/2026-11-13-secretary-impl-plan.md)：「文中行号以 44c67bae6 为准，动手前用 grep 校准。」[历史说明](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/project-history/README.md)：「`archive/`：按月份归档的历史任务」；「这些文件只作为历史参考，不参与开发流程」。[旧开发日志索引](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/docs/project-history/development-journal-index.md) 以 `Date | Title | Commits | Branch` 串起会话与版本。能证实的是计划样本、历史分类与存档边界，不能据此断言每份计划都有同一迁移路径或自动状态机；本条的状态流转是建议。

## M7 · 让可判定的约束进检查，明示 CI 边界

**原则。** 对可机械判断的漂移用轻量检查拦截，对需要判断的差异保留人工检查与真实验证。

**解决的问题。** 文档承诺改了但代码和配置没同步，本地检查与 CI 意义不清，团队靠 Agent 记住旧故障。

**做法。** 对公开接口变更说明应同步的契约、测试和文档。命令选项、默认和 schema 能从实现提取就生成或对比，不造第二份手填表。从坏链接、错误产物路径、失配字段和缺必要证据开始；确定性错误阻断，篇幅等维护信号只提示。让本地和 PR CI 用同一离线检查入口，发布或授权的真实验证另有任务；明写触发条件、范围和没查什么。每次高代价问题先补根因层回归，有普遍判定规则才升级到 CI；不为单次笔误做治理平台。

**证据。** [AGENTS.md](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/AGENTS.md#L25-L44) 规定 `pnpm typecheck && pnpm lint && pnpm test`，并要求设置项同步 `policy.ts` 与 `docs/config-cli.md`。[知识检查实现](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/scripts/knowledge.ts) 输出 `ERROR ${issue}`、`WARN ${issue}`，最终 `return hardIssues ? 1 : 0;`；具体阻断的是扫描范围内失效的相对文件链接，并非所有文档语义或锚点。整理 `.jsonl` 默认 dry-run，`--apply` 才移动；不是计划自动归档。[发布构建工作流](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/.github/workflows/build.yml) 的触发是 `workflow_dispatch` 或版本标签，执行 `pnpm install --frozen-lockfile` 并有 `Smoke test packaged natives`。与之不同，[Relay Go 工作流](https://github.com/J3n5en/EnsoCode/blob/0a54bc0ba5686561c7595af3d599f648f916b5f6/.github/workflows/relay-go.yml) 有路径过滤的 `pull_request` 和 `go test -count=1 ./...`。不要把本地三件套或 `knowledge:check` 描述成已接入全仓 PR CI；同入口是本方法的建议。

## 交接检查

从干净副本或隔离运行目录读入口。任选一张已完成的卡，找得到它的当前契约、运行命令、原件及失败定位吗？能分清结果是静态检查、离线复现还是真实验证吗？如果只能依赖上一位操作者的聊天记录，先修入口、证据或归属，再扩大流程。没有运行证据就保留待验证状态。
