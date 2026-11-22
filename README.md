# TeachArena (`eduharness`)

TeachArena 是面向教学 Agent 的 **Eval & Harness 门控基础设施**，用多轮师生对话评估「教师 = 模型 + harness」。
系统通过固定教学场景、二元证据绑定裁判、确定性代码计分与收据验真，判断一次改动该采用还是拦下，并将每项差异定位到具体消息 `#n`。
仓库聚焦可审计的工程变更门控而非模型排行榜；其状态机隔离边界、契约体系与回归门禁可直接复用于下游教学 Agent 应用（项目 2）。

## 工作流程与评测基础设施

系统把每次评测收口为一条可重放、可验真的固定链路，确保离线验证与真实运行共用同一套编排、解析与校验代码：

```text
对话生成（教师 Agent + 模拟学生，4 轮 / 9 条公开消息）
   ↓ 公开对话投影（隔离教师私有工具、观察器与学生画像）
二元裁判（6 维 19 题是非判断 + #n / messageId 证据绑定）
   ↓ 严格 JSON 校验 + 本地角色、时序与同链锚点检查
代码计分（scoreBinary 确定性定档，N/A 不计零，缺分单列）
   ↓ 预登记判线 + 话术负对照 + 跨家族 AI 盲核
门禁裁决 & 收据自证（--verify-run 核对 PID / 预算 / 哈希 / 离线 HTML 报告）
```

### 六维 19 题二元证据尺子

评测围绕教学交互的六个核心维度展开，裁判只输出布尔值与 `#n` 证据槽，维度分档与适用分率由代码确定性计算：

| 维度 | 是非题编号 | 核心评估问题 | 契约依据 |
| --- | --- | --- | --- |
| 误解修复 | `M0–M3` | 学生提出具体错因后，教师给出辨析依据且学生独立修正，避免全解抢先替代 | [binary.mjs](contracts/judge/binary.mjs) |
| 支持递增与淡出 | `S0–S3` | 受阻时在同一卡点升级支持、成功后交还决定并持续放手，避免首答全解 | [binary.mjs](contracts/judge/binary.mjs) |
| 交还主动权 | `A1–A2` | 学生完成实质推理或检验（A1），并在末三分之一自主选法说明理由（A2） | [binary.mjs](contracts/judge/binary.mjs) |
| 保留有益试错 | `P0–P3` | 首答不揭底、针对卡点给提示促尝试，且不在后续卡点过早替做 | [binary.mjs](contracts/judge/binary.mjs) |
| 表征转换 | `R0–R2` | 学生卡在原有表征后，教师实质切换表征并促成学生用新表征解释或推导 | [binary.mjs](contracts/judge/binary.mjs) |
| 验证或迁移 | `V1–V2` | 教师要求独立概念解释或近迁移检查，学生独立说出正确依据或完成迁移 | [binary.mjs](contracts/judge/binary.mjs) |

### 工程底座与防堆放治理

- **单一模型调用边界**：教师经 `@earendil-works/pi-agent-core`、学生与裁判经 `@earendil-works/pi-ai`，全部 LLM 请求统一收口至 [models.mjs](src/models.mjs)，杜绝提示词、重试与超时策略跨路径漂移。
- **收据自证与 `--verify-run`**：每次运行落地 `manifest.json`、启动记录、进程收据、逐调用日志与遥测，`--verify-run` 离线核对进程 PID、源码指纹、预算扣减与请求数量一致性。
- **断点续跑与格级并发**：`E1`、`E2`、`S1-binary` 支持 `--concurrency`（1–5 格级并发，HTTP 429 自动降档）与 `--resume` 断点续跑；同批次共享原子扣减的请求与输出 token 硬上限，只补未结算格，不覆写已校验判决。
- **离线交互复核报告**：`--export-report` 导出零外网单文件 HTML，支持点击判定或 `#n` 高亮定位对话原文；`scripts/export-project-report.mjs` 生成阶段 1–3 项目级离线总览与单格钻取页。
- **双区文档与确定性门禁**：`npm run check` 自动执行尺子指纹、ESM 导入边界、`scripts/check-docs.mjs`（强制 `docs/` 根目录白名单、活文档行数上限、索引覆盖及禁止脏链接）以及全量 `node --test` 回归。

## 关键结果总览

整个闭环以预登记判线和落盘原件为唯一依据，清晰记录了这套系统建成了什么、拦下了什么、暴露了什么：

| 阶段 | 结论与门禁决定 | 核心已验真数字 | 权威出处 |
| --- | --- | --- | --- |
| **阶段 1**：二元尺子与选型 | `e1-binary-v3` **带边界采用**；选出 Gemini 3.8 Flash | 首次结构合规 `107/108` → `108/108`；S1 `15/15`；冻结复测 `51/51` 格（`307` 请求）；支持维翻转 `22/89`、表征 `15/99` | [阶段 1 收口](docs/archive/stage1-closeout.md) · [数据出处](docs/research/readme-sources.md#阶段-1-二元评分器与选型) |
| **阶段 2a**：高压学生保真 | 顽固型与伸手型**可用**；假装懂了型**不可用** | Gemini 审核两遍 `40/40`、难例 `24/24`（Qwen `21/24`）；自证伪 `2/8` → `0/8`；正式 `48` 条顽固/伸手全 `4/4` | [自证伪修复](docs/archive/status-log-2026-11.md#stage2a-learner-fix) · [Gemini 审核](docs/archive/status-log-2026-11.md#stage2a-gemini-audit) |
| **阶段 2b**：dev 集余量检查 | 选定交还主动权（重点 A2）为阶段 3 主目标维 | `stage2b-headroom-real-01` `48/48` 格验真（`674` 请求）；主动权适用 `48/48`、均分 `1.021`、失 `47/96`、A2 `1/48` | [阶段 2b 余量](docs/archive/stage2b-headroom.md) |
| **阶段 3**：预登记三臂 A/B | 门禁拦截不成熟升级，执行**不采用**决定 | dev v2 `72/72` 机判验真：A2 从 `1/24` 升到 `12/24`（`18` 次交权），但 V 退化 `−0.208`（越过 `−0.125` 线）、盲核 `2/16` 合规 | [阶段 3 收尾](docs/research/stage3/closeout.md) |
| **阶段 4**：展示层与文档防堆放 | 交付离线 HTML 项目总览包与确定性文档门禁 | 汇总阶段 1–3 并钻取 S1 v3 与 Stage 3 dev v2 原对话；`npm run check:docs` 与 GitHub Actions CI 接入 | [离线项目报告](docs/report/index.html) · [文档索引](docs/README.md) |

### 阶段 1 同台选型对比（代理补跑 vs 原 Qwen）

定位并验证 OpenRouter 直连 HTTP 403 地区限制后，系统通过 `--proxy-from-env`（`HTTPS_PROXY`）完成同台对比，Gemini 3.8 Flash 成为唯一满足五项预登记判线的候选裁判：

| 候选模型 | 合规格 | 完整 S1 | 坏教师方向 / 四目标 | 确定项错 / 缺判 | 首次结构合规 → 重试后 | 耗时中位 / p90 |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| **Gemini 3.8 Flash**（代理） | `18/18` | `15/15` | `3/3` / 全 `3/3` | `0/2` / 无缺判 | `107/108` → `108/108` | `2,383 / 2,983 ms` |
| Claude Haiku 5.5（代理） | `7/18` | `7/15` | `0/3` / `0,2,2,1` | `0/2` / 缺 `57/99` | `56/108` → `60/108` | `6,142 / 7,665 ms` |
| Qwen3 235B Instruct（直连） | `7/18` | `7/15` | `0/3` / 全 `0/3` | `11/2` / 缺 `39/99` | `63/108` → `66/108` | `2,940 / 4,950 ms` |

### 阶段 2–3 门禁实测与关键归因

- **阶段 2a（难缠学生保真）**：改用跨家族 Gemini AI 审核器在构造验证集两遍各 `40/40`、难例 `24/24`、跨遍一致 `40/40`（对照 Qwen `21/24` = 87.5%）；甲组小样关闭学生推理将自证伪从 `2/8` 降至 `0/8`；正式 `48` 条复跑全审齐，顽固误解型与伸手要答案型四条件全达 `4/4` 可用，假装懂了型因 `2/4` 未达线停用。
- **阶段 2b（基线余量诊断）**：在 8 道 dev 题实测旧线性教师 `normal` 共 `48/48` 格（`674` 次请求、实报 `1,022,836` token），确认保留有益试错封顶（`2.000`）、表征转换仅 `8/48` 适用、支持维失 `59/78` 但同档仅 `10/24` 且历史翻转 `22/89`，而交还主动权适用 `48/48`、均分 `1.021`、失 `47/96`、两遍同档 `23/24` 且 A1 `48/48`、A2 仅 `1/48`，据此选定主目标维。
- **阶段 3（预登记三臂 A/B 门禁拦截）**：三臂（线性基线 B / 状态机候选 S / 仅改 #8 话术负对照 C + 跨家族 AI 盲核 + 防退化护栏）在 dev v2 跑齐 `72/72` 格机判并验真。虽然 S 实际交权 `18` 次、机判 A2 从 B 的 `1/24` 升到 `12/24`，但防退化 V 维掉分 `−0.208` 且 A 差 `+0.042` 均触发硬拦截；系统按预登记“dev 最多 2 版、不调到过为止”的防过拟合纪律止步并作出**不采用**决定（保持 `sealed` 封存未动），同时精准定位出三项工程根因：`10/12` 个 A2=Yes 格因 v3 拆维缺同链择证提示仍计 A=1 分、观察器 `22` 次回退（`16` 字段拒收 + `5` 待修锚未对齐 + `1` 引用错绑），以及盲核本地 400 字符上限配置过紧导致 `14/16` 份 `430–673` 字符正常返回被 schema 拒收。

| 阶段 3 dev v2 预登记门禁项 | 门禁要求 | dev v2 实测结果 | 裁决 |
| --- | --- | --- | --- |
| 机判完整性 | 三臂 `24/24` 对全配对 | `72/72` 格机判验真齐备 | 齐备 |
| A 交还主动权（主目标） | `S − B >= +0.25` 分 | `+0.042`（`+1/24`） | 未过 |
| V 验证或迁移（防退化） | `S − B >= −0.125` 分 | `−0.208`（`−5/24`） | 未过（触发拦截） |
| P 保留有益试错 / 总适用分率 | `>= −0.05` 且无 `2→0` / `>= −5.00` pp | `+0.000`（无额外违规）/ `−2.847` pp | 过 |
| C 均差与假命中检查 | `C − B <= +0.05` 且确认假命中 `0` | `−0.042`；确认 `0` 假命中（1 阳性待盲核） | 均差过 / 假命中待定 |
| C 有效暴露 | 受约束画像各 `>= 2/8` | 顽固 `1/8`、伸手 `1/8` | 暴露不足 |
| Haiku 跨家族 AI 盲核 | 真命中 `>= 90%` 且必审齐备 | `16` 项均 HTTP 200，`2` 项合规；`14` 项 `reason` 430–673 字符超 400 上限拒收 | 覆盖不足（契约上限待调） |

### 阶段 4 展示层与文档防堆放治理

系统在收口阶段将文档规范与成果交付统一落地为确定性脚本检查，避免随手建文件和流水膨胀：

- **双区治理与自动门禁**：`docs/` 根目录严格锁定 6 份活文档，全部阶段流水与早期诊断迁入 [docs/archive/](docs/archive/README.md)；`npm run check:docs` 接入 `npm run check` 与 GitHub Actions，自动拦截孤儿文档、超限膨胀与脏链接。
- **离线多页项目报告包**：`scripts/export-project-report.mjs` 生成零外网依赖的 [docs/report/index.html](docs/report/index.html)，汇总阶段 1–3 结论并可逐层点进 S1 v3 冻结复测（`51` 格）与阶段 3 dev v2（`72` 格）单格对话原文。

| 门禁检查项 | 校验内容与拦截对象 | 执行入口 |
| --- | --- | --- |
| 白名单与归档分区 | 仓库根仅留 `README.md`/`AGENTS.md`，`docs/` 根仅留 6 份活文档，其余归入 `archive/` 或 `learnings/YYYY-MM/` | `npm run check:docs` |
| 活文档体量上限 | `AGENTS.md` `<= 30`、`status.md` `<= 100`、`scenarios.md` `<= 100`、`runbook.md` `<= 120`、`glossary.md` `<= 60`、`README.md` `120–220` 行 | `npm run check:docs` |
| 链接、锚点与脏路径 | 校验全部相对路径、标题锚点与 `#L` 行号，禁止活文档出现 `.tmp/`、`runs/` 或本机绝对路径可点击链接 | `npm run check:docs` |
| 索引覆盖与离线纯度 | 校验 `archive/`、`learnings/`、`plans/` 全收录，并确认 `docs/report/*.html` 零外部 URL 且内链完整 | `npm run check:docs` |
| 尺子指纹与导入边界 | 校验尺子契约哈希及 `teacher` 不读取数据集/裁判契约，并执行全部 `node --test` 单测 | `npm run check` |

全部数值、校验指纹与原始坐标的逐行对照均维护于 [README 数据出处对照表](docs/research/readme-sources.md)。

## 快速开始与复现

项目支持零密钥、零外部网络依赖的本地离线演示、交互报告导出与全套门禁校验（环境要求 Node.js `>= 22.19.0`）：

```sh
# 1. 安装锁定依赖
npm ci

# 2. 运行离线 E1 评测并校验收据自证（不发起外部模型请求）
node src/cli.mjs --mode offline --run-root runs --id e1-first
node src/cli.mjs --verify-run e1-first

# 3. 导出本次离线运行的单文件 HTML 复核页（输出 runs/e1-first/report.html）
node src/cli.mjs --export-report e1-first

# 4. 执行全套确定性门禁（尺子指纹 + 模块导入边界 + 文档防堆放检查 + 全部单测）
npm run check
```

仓库已预生成离线项目总览包 [docs/report/index.html](docs/report/index.html)，新克隆后可直接用浏览器双击离线查看阶段 1–3 总览与两条真实运行钻取页，无需重新运行导出。若需在本地重新构建项目级静态报告包，需先在本地备齐 S1（`runs/round2-binary-v3-freeze-gemini-01/`）与阶段 3（`stage3-dev-v2-real-01/`）运行原件，并指定 `--stage3-root`：

```sh
node scripts/export-project-report.mjs --out-dir docs/report --s1-root runs --stage3-root <stage3-runs-dir> --force
```

### 真实付费运行前置条件

真实运行遵循事前成本确认与环境隔离规则，仓库内不保存任何凭据：

- **密钥与代理**：通过进程环境变量或本地 `.env`（格式见 [.env.example](.env.example)）提供 `DEEPSEEK_API_KEY` 与 `OPENROUTER_API_KEY`，代理经 `HTTPS_PROXY` 与 `--proxy-from-env` 注入。
- **干净检出与预检授权**：真实模式在发请求前强制校验干净 HEAD 的 `npm run check` 收据；先执行 `--estimate-only` 取得零请求预算清单，获明确授权后再追加 `--confirm-cost` 与硬上限启动。完整命令、并发续跑与排障步骤见 [运行手册](docs/runbook.md)。

## 仓库地图

仓库按源码、契约、配置、门禁脚本、测试与分级文档划分清晰边界，用代码检查杜绝跨层读取与文档随手堆放：

| 路径 | 职责与隔离边界 |
| --- | --- |
| [src/](src/) | 评测编排、模型调用唯一边界（`models.mjs`）、二元/拆维裁判校验、收据验真、断点续跑与 HTML 报告导出；`src/teacher/` 为可复用教师内核 |
| [contracts/](contracts/) | 六类领域契约与单测（`core` / `dataset` / `teacher` / `learner` / `judge` / `artifacts`）；教师侧严禁导入数据集或裁判契约 |
| [config/](config/) | 场景模型路由、预算、超时与重试策略；参数变更直接计入评测身份指纹 |
| [scripts/](scripts/) | `check.mjs`（总门禁）、`check-ruler.mjs`、`check-boundaries.mjs`、`check-docs.mjs`、`export-project-report.mjs` 及离线重算脚本 |
| [test/](test/) | `node --test` 全量单测与回归夹具（覆盖坏输入、截断、空正文、JSON 尾随文本、并发断点与 DOM 交互校验） |
| [data/](data/) | 锁定评测数据集与题族划分（不随 harness 改动改变） |
| [docs/](docs/) | 精简活文档根目录：[总索引](docs/README.md) · [当前状态](docs/status.md) · [验收场景卡](docs/scenarios.md) · [运行手册](docs/runbook.md) · [术语表](docs/glossary.md) · [路线图](docs/plans/roadmap.md) |
| [docs/report/](docs/report/index.html) | 阶段 4 静态离线 HTML 项目总览包及 S1 v3 / Stage 3 dev v2 复核钻取页 |
| [docs/archive/](docs/archive/README.md) | 2026-11 历史状态流水（`status-log-2026-11.md`）、阶段 1/2b 收口、早期诊断与旧计划只读归档 |
| [docs/learnings/](docs/learnings/README.md) | 按月份整理的工程与评测踩坑知识库（`YYYY-MM/`），每条绑定可回读原件 |
| [docs/research/](docs/research/README.md) | SHA256 核验的 19 份实验调研原件（阶段 4 已裁剪 4 个外部通用目录）、阶段 3 锁定预登记/收尾及本页 [数据出处表](docs/research/readme-sources.md) |
| [.github/workflows/](.github/workflows/ci.yml) | GitHub Actions CI 工作流，每次提交与 PR 自动执行 `npm run check` |

## 可靠性与已知边界

系统将实测暴露的尺子噪声、模型能力缺口与门禁适用边界全部显式建档，保证结论始终受证据约束：

- **`e1-binary-v3` 带边界采用**：S1 坏教师区分 `15/15` 全过，同时显式登记三条适用边界——A1 可能把教师展开式子后的学生跟算判为自主推理；V1 对事后话术敏感可能漏判原 #4 检查；同一输入下支持维（`22/89`）与表征维（`15/99`）存在单次判决翻转。修订口径下 v3 对 A2 实测覆盖 1 个正例（未含事后否认格），因此阶段 3 为 A2 额外引入跨家族 AI 盲核与原文抽查，不单凭机判分做采用决定。
- **AI 审核边界与画像筛选**：阶段 2a Gemini 审核器与阶段 3 Haiku 盲核均为跨家族 AI 审核，不替代独立人工复核；`pretender`（假装懂了型）保真度未达线已停用，阶段 2b/3 选用已验真的 `stubborn` 与 `answer-seeker`。
- **阶段 3 隔离与离线定位**：状态驱动候选按预登记止于 dev 第 2 版并执行**不采用**决定，实验用固定交权模板（`contracts/teacher/handoff.mjs`）隔离于默认教师路径之外；`sealed` 留出集与训练标签保持封存未读；`--mode offline` 覆盖编排、校验与收据链路验证，真实模型评估走 `--mode real`。

## 下一步

阶段 1–4 评测与门控基础设施已按 [推进路线图](docs/plans/roadmap.md) 交付就绪，详细基线索引见 [当前状态](docs/status.md)：

- **下游教学应用集成（规划中）**：复用 `src/models.mjs` 统一模型边界、教师状态机契约隔离与离线/真实双模式评测门禁，为全栈 AI 教学应用（项目 2）提供持续回归与发布闸门。
- **下一轮门禁迭代清单（已立项备查）**：基于阶段 3 归因已明确 5 项定向改进——v3 拆维同链择证提示、A 维分档口径、动态交权下的验证保护、观察器 `type` 冗余字段收窄容错、盲核理由长度契约（详见 [阶段 3 收尾分析](docs/research/stage3/closeout.md#下一轮假设均未验证本轮不实施)）；封存的 `sealed` 留出集留待新候选冻结后执行唯一一次终验。
