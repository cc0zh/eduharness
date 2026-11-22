# S2 独立的改进环境 · 设计草案

**证据级别：静态阅读。** 以下均为现状、设计建议或未来验收条件，不表示已验证隔离。S1 稳定环境（E2 仍待真实验收）→ S2 独立环境 → S3 改进循环。S2 不判断教学改进，不用尺子排名。依据：`README.md:3-5`、`docs/scenarios.md:3,7-16,50-74,83-87`、`docs/glossary.md:17-21`。

本草案直接读取工作区的 `docs/scenarios.md:50-61`，读取时文件 SHA256 为 `3b25cff3d3b9a7d4e951a8078b1faf56a7700f2e2db00208fab99e1d007ba0ac`。下文 `workflow` 指 `C:/Users/cc/.agents/skills/evidence-first-project-workflow/SKILL.md`，按场景卡逐栏验收，由原件支持结论。依据：`workflow:10-18,28-41,84-93`。

## 1. 每轮独立建目录，写权限由系统实施

- 操作者在开发检出之外分配唯一 `<外部评测区>/runs/s2-<日期>-<序号>/`（下称 `<验收根>`）。`old/`、`changed/` 直接作各自的绝对 `--run-root`。每侧 run 与 `_receipts/` 同根；`isolation.md` 由操作者写，索引用相对路径。源码、`.tmp`、会话等不混入证据目录，另放本轮外部工作区下的各侧私有目录。依据：`docs/scenarios.md:57-61`、`docs/runbook.md:3,17-26`、`workflow:74-80`。
- 每轮从全新候选编辑检出启动改进 Agent。推荐从已验证的本地 Git 快照给候选编辑端、旧版执行端、改动版执行端分别建独立 Git 仓库及检出；也可在各自私有仓库内建 detached worktree。不得直接在开发仓库挂 worktree，也不得让两侧共享 `.git` common dir、对象借用路径或任何可写挂载。worktree 分离源码目录，不等于分离 Git 元数据或进程权限。依据：`docs/scenarios.md:57-61`、`workflow:49,74-80`。
- 三类受限进程用不同系统身份或等效隔离容器，子进程继承限制。Agent 只写候选编辑区预登记的 harness 文件、私有 Git 元数据和本轮 `.tmp`、会话、缓存；由可信启动器封存候选提交，再分别执行。运行进程只写本侧 run 根、私有 `.tmp`、HOME、缓存、会话和启动器允许的本侧检查收据路径。源码、依赖与输入在运行阶段只读。依据：`docs/scenarios.md:56-61,83`、`AGENTS.md:6-8`、`src/real-preflight.mjs:9-34`。
- 默认拒绝其他写入，包括开发检出及其 `.git`、权威原件、对侧和前轮、宿主用户配置、验收索引。Agent 不读学生私有数据、裁判原件或旧会话；可信校验器读取这些文件，教师仍只消费公开输入及允许的部署策略。旧库不作运行来源，不读取或复制其禁用路径。依据：`AGENTS.md:4-6`、`docs/scenarios.md:58-61`、`src/run.mjs:120-138`、`src/teacher/session.mjs:18-34`。

## 2. 固定比较条件，只有 harness 可变

- 两侧锁定同一场景、模式、任务和格子集合。固定 S0-06 任务原件与部署策略、学生画像、学生提示和生成契约、轮数。固定教师、学生及裁判模型的 provider、模型 ID 与可获得的服务版本；固定尺子版本、裁判提示/schema/证据校验及目标维度。固定推理、超时、重试和实际预算上限。固定 Node、依赖锁及实际安装的 `pi-agent-core` 和 `pi-ai`（现为 `1.5.2`）；另记录改进 Agent 的 pi 启动器版本与启动配置，勿混为评测依赖。固定学生配置不要求两侧生成相同台词。依据：`config/e1.mjs:1-13`、`config/e2.mjs:1-6`、`package.json:6-17`、`src/run.mjs:74-98,120-138`、`contracts/artifacts/README.md:5-9`。
- 首次建议只允许 `src/teacher/session.mjs` 内预登记的正常教师提示、教学阶段或工具实现片段变更。坏教师对照行为、公共契约、运行器、数据、预算、裁判与锁文件不动。同一文件里未登记的片段也不能改。新增提示或工具资产须事前纳入逐文件哈希记录，否则不进入对照。依据：`src/teacher/session.mjs:5-15,18-49,54-61`、`src/run.mjs:16-17,92-98`、`contracts/artifacts/README.md:9`、`docs/scenarios.md:83`。
- 用可信校验器从冻结源码与输入复算原件哈希，按现有 `hash({ mode, scenario, identity })` 规则重算各侧 `identityId`。逐字段比较 manifest。仅放行预登记 harness 差异及其派生哈希；单列核对 `taskId`、两侧源码提交、格子集合、run ID、writer 和检查收据归属。harness 变了，两个 `identityId` 通常也应不同，不能只比 ID。离线 `routes` 为 `pi-ai-faux`，仍须独立比对真实路由配置。依据：`contracts/core/schema.mjs:11`、`src/run.mjs:90-103`、`contracts/artifacts/README.md:7-9`、`docs/glossary.md:18-19`。

## 3. 从本轮请求和权威原件重建输入

| 原件 | 取自哪里，如何校验 | 依据 |
| --- | --- | --- |
| 本轮请求 | 操作者提交只读的 `request.md`，登记目标、允许改动、基准完整 SHA、运行条件；按原始字节记 SHA256。不得用历史会话摘要填充。 | `docs/scenarios.md:57-61,70-72`、`workflow:49,65` |
| 基准与候选 | 首轮 `OLD_SHA` 由操作者从 S1 已验收、可回读的运行提交选定；未完成 S1 不先指定本次阅读的 HEAD。`CHANGED_SHA` 是该基准加本轮预登记补丁的完整提交。后续轮只从本轮请求明确指定、可复核的基准重新物化。旧 E1 提交 `e045d49` 仅证明历史记录，不自动成为 S2 基准。 | `docs/scenarios.md:7-16,20,57,70-72`、`AGENTS.md:7` |
| 数据和部署策略 | 从 `OLD_SHA` 取 `data/upstream/tasks/stage0_situated_tutoring.json`、`data/upstream/policy_situated_tutoring.md`、`contracts/dataset/schema.mjs`。数据上游修订 `d9a673dc7c32d45df6c08a05e70d276da9e8a164`；学生画像来自原任务，不另造副本。 | `data/README.md:3`、`contracts/dataset/schema.mjs:3-5`、`src/run.mjs:78-82,123-133` |
| 固定实现与验收规则 | 从 `OLD_SHA` 取 `config/e1.mjs`、适用的 `config/e2.mjs`、`package*.json`、`src/cli.mjs`、`src/real-preflight.mjs`、`src/run.mjs`、`src/models.mjs`、`src/judge.mjs`、`src/offline.mjs`、各契约 schema 和 `scripts/check*.mjs`；教师源码基准也从该提交取。尺子口径取同一基准的 `contracts/judge/README.md`；S2 验收卡可来自单独批准的文档提交 `SPEC_SHA`，不得用它替换运行基准。 | `src/run.mjs:16-17,93-98`、`scripts/check.mjs:2-14`、`README.md:16`、`docs/scenarios.md:50-61` |

- 可信启动器生成只读 `inputs.json`，逐项记 `{path, commit, sha256}`；请求无 Git 来源则记操作者提交的输入 ID。用二进制方式读取 `<sha>:<path>` 的 Git blob 并计算 SHA256，比较两侧实际文件原始字节和固定项清单。避免 PowerShell 文本管道和 Git 换行转换改变字节；不符即停。候选允许变化项独立验提交差异并记新哈希。运行前后复验原件；证据索引指向原件，不重复维护评分规则。依据：`src/run.mjs:16-17,78-98`、`contracts/core/schema.mjs:11`、`docs/scenarios.md:59-60`、`workflow:49,65,80`。
- 新进程、私有空用户数据目录、无续跑、无旧会话挂载。显式从 `request.md` 与清单喂入改进 Agent；记录它的首个请求，以及两侧评测各自首份模型调用原件或经保管的记录。核对有效输入来源、首个上下文与会话加载记录，不能只看启动参数。评测侧用新建 `Agent`，不得用 `--judge-only` 加载旧对话替代冷启动。依据：`docs/scenarios.md:57-61`、`src/teacher/session.mjs:18-26`、`src/run.mjs:53-71,101-125`、`docs/runbook.md:13,24-26`。

## 4. 用检查与探针证明系统拒绝越界

1. **启动前。** 可信启动器记录每个进程身份和可写根，枚举 Git common dir、真实路径、挂载、权限和目录清单。按 Windows 大小写规则比较规范真实路径，拒绝相同目录、祖先关系、重解析点及硬链接等路径别名；新路径先检查现存父级。用 OS 或容器执行默认拒绝，不能只检查字符串。检查 HOME、APPDATA、LOCALAPPDATA、TEMP/TMP、npm 缓存、Git 全局配置及实际 pi 会话和扩展目录，不继承宿主默认配置。依据：`docs/scenarios.md:58-61`、`scripts/check-boundaries.mjs:8-11,34-38`、`workflow:107-113`。
2. **探针。** 用实际运行身份和继承权限的子进程，在本侧写入随机标记成功；对向读取标记被拒绝或不可见。两侧各自尝试在对侧已由操作者确认存在的探针目录写入，必须非零并记录权限拒绝，不能以目录不存在充数。对开发检出、只读权威目录和公共缓存验证拒绝写入，使用专用探针或 ACL 检查，不碰开发者文件。检查网络盘、共享数据库和其他外部写入入口也未开放。依据：`docs/scenarios.md:58-61`、`workflow:88-92,107-113`。
3. **结束后。** 比对开发检出前后 `HEAD`、`git --no-optional-locks status --porcelain=v1 --untracked-files=all`，及已登记源码、未提交文件和受保护原件的前后内容哈希；额外检查忽略目录和写入审计。运行检出须干净且 HEAD 不变，候选编辑区只允许登记差异。并发开发改变受保护快照时保留冲突记录并另约验收窗口，不能重置或替别人归因。快照证明的是前后差异，防越界依赖系统权限与探针配合。依据：`src/real-preflight.mjs:9-18`、`.gitignore:1-5`、`docs/scenarios.md:59-61`。

## 5. 复用现有入口，补齐隔离证据

- **复用。** Git 独立检出负责版本固定；CLI 已支持侧别 `--run-root`、唯一 `--id`、模式和额度，已有目录拒绝覆写。复用 manifest 的 writer 和调用 PID，以及同根运行收据。现有运行收据不保存命令、退出码或权限；由可信启动器单独捕获。依据：`src/cli.mjs:12-31,38-57`、`src/run.mjs:83-98,109-113,153-157`、`docs/runbook.md:3-15`。
- **保留检查机制。** `npm run check` 运行导入边界检查和测试；它不检查共享缓存或进程权限。检查收据固定写在源码检出的 `runs/_receipts/`，不随 `--run-root`。真实运行时在各侧私有检出完成检查，再冻结源码；归档各自检查收据副本及哈希，不把旧侧收据送给改动侧，也不能把两种收据混用。依据：`scripts/check.mjs:4-15`、`scripts/check-boundaries.mjs:14-39`、`src/real-preflight.mjs:9-34`、`src/cli.mjs:42-46`。
- **待补。** 当前 CLI 没有 `--verify-run` 参数，不把它当现有能力。建议先做可信启动与只读回读校验，再视需要加 `--verify-run` 或独立命令。校验同根路径、收据和 manifest 的绑定、身份与输入哈希、首次请求、退出码和隔离报告；离线测试覆盖错根、漏件、哈希漂移、路径别名、跨侧可写和加载旧会话。校验器不发请求，也不生成分数。依据：`src/cli.mjs:12-23,38-57`、`src/run.mjs:153-157`、`docs/scenarios.md:59-61`、`workflow:88-92,107-113`。

## 6. 六栏验收及建议改卡

| S2 栏 | 证据与通过条件 | 建议改卡 | 依据 |
| --- | --- | --- | --- |
| 谁 | 启动记录识别改进 Agent、两侧执行身份和操作者；操作者可独立回读。 | 指定启动器、原件保管和签收人，不让 Agent 自签。 | `docs/scenarios.md:56,59`、`workflow:32-37` |
| 条件 | S1 签收、`SPEC_SHA`/`OLD_SHA`/`CHANGED_SHA`、当前请求、锁定身份、权限、空状态清单齐全。 | 明示 S2 模式，区分实际隔离验证与真实教学评测，写清两种冷启动。 | `docs/scenarios.md:57,59`、`workflow:33,88-93` |
| 能完成什么 | 两版分别执行；实际权限、交叉探针和首个请求证实各自独占写入并从本轮输入启动。 | 列举 Git、缓存、用户目录、会话和外部存储；区分改进 Agent 与两侧运行进程。 | `docs/scenarios.md:58-61`、`src/teacher/session.mjs:18-26` |
| 证据 | `isolation.md` 可索引全部记录；`old/s2-old/`、`changed/s2-changed/` 各有 manifest、结果、同根收据，命令与退出 0 可核；身份差异、探针和哈希均通过。 | 明示 `runs/` 在开发检出外、检查收据存放、允许差异、首请求脱敏及探针通过语义。 | `docs/scenarios.md:59`、`docs/runbook.md:11,15-26`、`contracts/artifacts/README.md:7-9` |
| 失败可定位 | 按轮、侧、阶段和真实路径保存身份、权限、共享存储、会话来源或实际/期望哈希；保留失败原件。 | 区分环境失败、身份漂移与评测本身未通过；用阶段和机器错误码定位。 | `docs/scenarios.md:60,73,86`、`docs/glossary.md:10-12,21` |
| 不算交付 | 换 ID、共享可写状态、仅靠指令或静态快照、用旧摘要、仅有 `acceptance: true` 均不能通过。 | 增列共享 `.git`、同权限进程和未执行探针；无实际隔离证据仍待验收。 | `docs/scenarios.md:58-61`、`docs/glossary.md:20-21`、`workflow:115-117` |

## 7. 风险与需要用户决定的点

| 决定 | 推荐及风险 | 依据 |
| --- | --- | --- |
| 隔离强度和实现 | 推荐私有 Git 仓库加 OS 强制隔离的进程身份；若无法约束子进程、扩展或默认用户目录，则用分离容器或 VM，未通过探针不得降级签收。 | `docs/scenarios.md:58-61`、`workflow:49,80` |
| S2 评测模式 | 等 S1 签收后，推荐用同样的宿主隔离执行 E1 离线双侧验证并实测探针和冷启动；离线结果不能替代 S1 或 S3 的真实教学证据。若要求 S2 真实双跑，先另获调用数与 token 上限授权。现有退出 0 还取决于 E1/E2 分档差异；若要独立于质量验收，改卡单列运行状态与隔离状态，不重释退出码。 | `docs/scenarios.md:57-61,70-74`、`src/run.mjs:148-156`、`AGENTS.md:5-9` |
| 选基准与允许变化 | 推荐 S1 签收时同时冻结完整 SHA；首轮只改正常教师的一项预登记行为。若线上别名不能固定版本或存在共享供应商状态，记录不可证明范围；出现可见漂移时不做教学归因。 | `docs/scenarios.md:13-16,57,83-87`、`config/e1.mjs:9-13`、`contracts/artifacts/README.md:7-9` |
| 权限、凭据与留存 | 推荐改进 Agent 不持有评测密钥；未来真实评测只给受控运行进程注入环境变量，禁止借用 `.env`。原始调用、请求及启动记录受限保管，分享脱敏索引；用户确认保管人、访问权及保留周期，不在 Git 或共享缓存留副本。 | `AGENTS.md:4-5,8`、`src/real-preflight.mjs:37-46`、`docs/runbook.md:24-26`、`workflow:80` |
