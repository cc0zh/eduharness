# README 数据与结论出处对照表

本表记录项目首页 [README.md](../../README.md) 所列全部数值、状态决定与边界说明的权威原件出处。带反引号的 `runs/...` 路径为本地持久化评测产物，可在保留对应运行目录的工作区配合 `--verify-run` 直接复核；未进 Git 的目录不设可点击链接。

## 阶段 1 二元评分器与选型

| README 表述 / 数值 | 原件数值与口径说明 | 权威仓库文档 / 代码出处 | 原始运行产物坐标 |
| --- | --- | --- | --- |
| 6 维 19 题二元证据尺子（`#n` 引用 + 代码计分） | M0–M3、S0–S3、A1–A2、P0–P3、R0–R2、V1–V2 共 19 题是非判断，`scoreBinary` 代码定档 | [二元尺子 v2 契约](../../contracts/judge/binary.md) · [v3 拆维契约](../../contracts/judge/binary-v3.md) | `contracts/judge/binary.mjs` · `contracts/judge/binary-v3.mjs` |
| 同台选型 Gemini 3.8 Flash 首次结构合规 `107/108` → 重试后 `108/108` | 18/18 格完整、S1 15/15、分率方向 3/3、四个目标维均 3/3、确定项错误 0/2、中位耗时 2,383 ms / p90 2,983 ms | [代理补跑日志](../archive/status-log-2026-11.md#round2-judge-bakeoff) | `runs/round2-bakeoff-proxy-report/bakeoff-report.md` · `runs/round2-bakeoff-gemini-proxy-01/` |
| Haiku 5.5 代理补跑 `56/108` → `60/108`；原 Qwen `63/108` → `66/108` | Haiku 合规格 7/18、S1 7/15、坏教师方向 0/3、四目标 `0/3, 2/3, 2/3, 1/3`、确定项 0/2（缺 57/99）、中位耗时 `6,142 ms` / p90 `7,665 ms`；Qwen 合规格 7/18、S1 7/15、方向 0/3、四目标全 0/3、确定项 11/2（缺 39/99）、中位耗时 `2,940 ms` / p90 `4,950 ms` | [代理补跑日志](../archive/status-log-2026-11.md#round2-judge-bakeoff) | `runs/round2-bakeoff-proxy-report/bakeoff-report.md` · `runs/round2-bakeoff-haiku-proxy-01/` · `runs/round2-bakeoff-qwen-01/` |
| 直连 HTTP 403 地区限制定位并用 `HTTPS_PROXY` 解决 | OpenRouter `Gate Endpoints with Geo Restrictions` 拒收直连 Haiku/Gemini；启用 `--proxy-from-env` 经 `HTTPS_PROXY` 补跑全通 | [代理补跑日志](../archive/status-log-2026-11.md#round2-judge-bakeoff) · [踩坑记录](../learnings/2026-11/20261121-provider-catalog-is-not-acceptance.md) | `runs/round2-bakeoff-haiku-01/` · `runs/round2-bakeoff-gemini-01/` · `.tmp/scratch/judge-bakeoff/403-diagnosis.md` |
| `e1-binary-v3` 冻结复测 `51/51` 格、`307` 次请求、`verified: true`，决定**带边界采用** | S1 `15/15` 过线、五组复跑成对；定向仅 V2 过线（V1 召回 2/3、A1 特异度 1/2、A2 召回 1/2），`normal` 四格 `1/2/1/0` 未达 `1/2/1/1`；v3 与 v4 均未冻结，路线 A 带边界采用 | [阶段 1 收口](../archive/stage1-closeout.md) · [踩坑记录](../learnings/2026-11/20261122-bakeoff-pass-is-not-freeze.md) | `runs/round2-binary-v3-freeze-gemini-01/freeze-retest-summary.json` · `runs/round2-binary-v3-freeze-gemini-01/freeze-retest-report.md` |
| 同输入分档翻转统计：支持维 `22/89`（24.72%）、表征维 `15/99`（15.15%），其余四维 `0/99` | 合并 ①h Gemini 补跑 18 格与 v3 冻结复测 51 格同请求配对重算（`node scripts/stage1-flip-rates.mjs runs`） | [同输入翻转率](../archive/stage1-closeout.md#同输入翻转率) | `scripts/stage1-flip-rates.mjs` · `.tmp/scratch/stage1-closeout/flip-rates.json` |
| 三条已知边界与 A2 覆盖边界 | A1 误报展开式跟算（`A1-only-proposes` 1/2）、V1 对事后话术敏感（`V2-normal-claim` / `V1-claim-none`）、同输入单次判决翻转；A2 修订后只实测 1 个正例（`A2-choose-identity-test`） | [三条已知边界](../archive/stage1-closeout.md#三条已知边界) | `runs/round2-binary-v3-freeze-gemini-01/_processes/1/` |

## 阶段 2a：高压学生保真验证与跨家族审核

| README 表述 / 数值 | 原件数值与口径说明 | 权威仓库文档 / 代码出处 | 原始运行产物坐标 |
| --- | --- | --- | --- |
| 换 Gemini 审核器后难例验证两遍各 `40/40`、难例 `24/24`、跨遍一致 `40/40`（Qwen `21/24` = 87.5%） | `hard-learner-audit-v5-gemini`（AI 审核，而非人工复核）对 16 原样本 + 24 独立复核难例两遍均达线；用 Gemini 重审 run 05 使 `answer-seeker` 由不可用转为能用 | [阶段 2a Gemini 审核](../archive/status-log-2026-11.md#stage2a-gemini-audit) · [策略配置](../../config/fidelity-audit.mjs) | `runs/stage2a-gemini-audit-validation-01/validation-report.md` · `runs/stage2a-qwen-hard-audit-validation-01/validation-report.md` · `runs/stage2a-hard-learners-05-gemini-reaudit-01/reaudit-report.md` |
| 小样关闭推理将自证伪由 `2/8` 降至 `0/8` | 甲组（关闭学生 DeepSeek `thinking`，无共享条款）在 40 条小样自证伪 `0/8`（对照 `2/8`）、指定代值 `2/2` | [阶段 2a 自证伪修复](../archive/status-log-2026-11.md#stage2a-learner-fix) · [踩坑记录](../learnings/2026-11/20261122-self-falsification-is-not-profile-fidelity.md) | `runs/stage2a-learner-fix-pilot-01/pilot-report.md` |
| 甲组 `48` 条正式复跑：顽固与伸手可用、假装懂了型不可用 | 每画像审齐 `16/16`：顽固型 `4/4, 4/4, 4/4, 4/4`（可用）；伸手型 `4/4, 4/4, 4/4, 4/4`（可用）；假装懂了型 `2/4, 4/4, 4/4, 2/4`（不可用），两题可教性均 `2/2` | [阶段 2a 自证伪修复](../archive/status-log-2026-11.md#stage2a-learner-fix) · [学生配置](../../config/hard-learners.mjs) | `runs/stage2a-learner-fix-full-01/hard-learner-fidelity-report.md` · `runs/stage2a-learner-fix-full-01/pid-usage-check.json` |

## 阶段 2b：开发集余量检查

| README 表述 / 数值 | 原件数值与口径说明 | 权威仓库文档 / 代码出处 | 原始运行产物坐标 |
| --- | --- | --- | --- |
| `stage2b-headroom-real-01` 真跑收齐 `48/48` 格、`674` 次请求、验真通过 | 8 道 dev 题（4 家族）× 3 学生画像（默认/顽固/伸手）× 2 遍；实报总量 `1,022,836` token，`PID 42464` | [阶段 2b 余量报告](../archive/stage2b-headroom.md) | `runs/stage2b-headroom-real-01/verify-run.json` · `runs/stage2b-headroom-real-01/headroom-report.md` |
| 交还主动权适用 `48/48`、均分 `1.021`、失分 `47/96`、两遍同档 `23/24`、A1 `48/48` 而 A2 `1/48` | 误解修复失 `32/96`（同档 `16/24`）列备选；支持维失 `59/78`（均分 `0.487`，同档 `10/24`、历史翻转 `22/89`）；保留有益试错封顶 `2.000`（`24/24`）；表征转换适用 `8/48`（均分 `1.500`、同档 `18/24`、历史翻转 `15/99`）；验证或迁移适用 `48/48`（均分 `1.875`、同档 `21/24`）；选交还主动权为主目标维 | [六维余量与候选](../archive/stage2b-headroom.md#六维余量) · [踩坑记录](../learnings/2026-11/20261122-headroom-by-question.md) | `runs/stage2b-headroom-real-01/headroom.json` |

## 阶段 3：预登记三臂 A/B 与门禁拦截

| README 表述 / 数值 | 原件数值与口径说明 | 权威仓库文档 / 代码出处 | 原始运行产物坐标 |
| --- | --- | --- | --- |
| 预登记三臂 A/B 门禁拦下状态机升级，执行**不采用**决定 | dev v1（72/72 格）A 差 `+0.000`、A2 三臂 `0/24`、V 差 `+0.042`、总适用分率 `+3.785` pp、C 有效暴露默认 `0/8`；dev v2（72/72 格）A2 从 B 的 `1/24` 升到 S 的 `12/24`（18 次交权），但 V 配对差 `−0.208`（`−5/24`，越过 `−0.125` 线）、A 差 `+0.042`（未达 `+0.25` 线）、P `+0.000`、总适用分率 `−2.847` pp | [阶段 3 收尾](../research/stage3/closeout.md#判线结果) · [锁定预登记](../research/stage3/preregistration.md) · [附录 01](../research/stage3/preregistration-addendum-01.md) | `runs/stage3-dev/stage3-dev-v2-real-01/report.json` · `runs/stage3-dev/stage3-dev-v2-real-01/verify-run.json` |
| 话术负对照 C 均差 `−0.042`、有效暴露各 `1/8`、盲核 `2/16` 合规（`14/16` 超 400 字符拒收） | 16 个必审 Haiku 盲核均 HTTP 200，其中 14 个 `reason` 长 `430–673` 字符超本地 400 字符 schema 拒收，结论记 `inconclusive`，`sealed` 未触碰，三句固定交权模板作废 | [阶段 3 收尾五项归因](../research/stage3/closeout.md#五项归因核实) · [盲核长度踩坑](../learnings/2026-11/20261122-blind-audit-length-is-coverage.md) | `runs/stage3-dev/stage3-dev-v2-real-01/blind-audit-contract-readback.json` · `contracts/teacher/handoff.mjs` |
| 定位同链引用缺失（10/12 A2=Yes 仍计 A=1）与观察器 `22` 次回退（16 字段 + 5 锚 + 1 错绑） | v3 拆维 A 提示缺少 v2 通用同链择证偏好，导致同条选法与执行被分引不同消息；保留在未验证下一轮假设 | [阶段 3 收尾归因 (b)(d)](../research/stage3/closeout.md#b-部分属实v3-少了同链偏好不能据此解释全部-10-格) · [同链踩坑](../learnings/2026-11/20261122-split-judge-chain-priority.md) | `runs/stage3-dev/stage3-dev-v2-real-01/gate-readback.json` |

## 基础设施与阶段 4 交付

| README 表述 / 能力 | 实现模块与验证依据 | 权威仓库文档 / 代码出处 |
| --- | --- | --- |
| 单一模型调用边界、预算/代理绑定、干净 HEAD 检查收据 | 统一封装 `@earendil-works/pi-ai` / `pi-agent-core`、真实前检查 `runs/_receipts/check-<sha>.json`、`--estimate-only` → `--confirm-cost` | [src/models.mjs](../../src/models.mjs) · [src/real-preflight.mjs](../../src/real-preflight.mjs) · [运行手册](../runbook.md) |
| 启动/进程/请求收据与 `--verify-run` 自证 | 核对启动、结束、manifest、逐调用遥测与 PID/预算一致性 | [src/run-receipts.mjs](../../src/run-receipts.mjs) · [产物契约](../../contracts/artifacts/README.md) |
| `--resume` 断点续跑与 `--concurrency 1..5` 格级并发、429 自动降档 | 原子预算扣减、校验 HEAD/源码/身份/预登记 SHA256 后只补未完成格 | [src/cell-batch.mjs](../../src/cell-batch.mjs) · [运行手册](../runbook.md#格级并发和断点续跑) |
| 离线静态 HTML 复核报告与项目总览包 | 单 run `--export-report` 校验消息 ID / 视图哈希 / 绑定坐标；`export-project-report.mjs` 导出零外网 `docs/report/` | [src/html-report.mjs](../../src/html-report.mjs) · [scripts/export-project-report.mjs](../../scripts/export-project-report.mjs) · [项目报告](../report/index.html) |
| 确定性代码/文档双门禁与 GitHub Actions CI | `npm run check` 执行尺子指纹、导入边界、`check-docs.mjs` 与全量 `node --test` | [scripts/check.mjs](../../scripts/check.mjs) · [scripts/check-docs.mjs](../../scripts/check-docs.mjs) · [CI workflow](../../.github/workflows/ci.yml) |
