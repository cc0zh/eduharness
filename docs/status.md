# 当前状态

> 完整文档索引与写入路由见 [docs/README.md](README.md)。2026-11 逐轮详细流水、PID 与全部收据记录已归档至 [历史状态流水](archive/status-log-2026-11.md)。

## 当前有效基线与架构决策

- **教师基线**：维持线性教学教师 B（`normal`）。阶段 3 动态状态机候选在预登记检验后决定**不采用**；`contracts/teacher/handoff.mjs` 三句固定交权模板已作废，后续项目不得复用。
- **工作评分器**：`e1-binary-v3`（6 维 19 题是非证据绑定 + 代码计分）作为工作评分器**带边界采用**（配合 Gemini 3.8 Flash 与 `HTTPS_PROXY` 代理传输），未冻结，不单独用于排名。
- **高压学生集**：`stubborn`（顽固误解型）与 `answer-seeker`（伸手要答案型）通过保真验证可用；`pretender`（假装懂了型）不可用。`D:\Archive\teacharena\stage2-holdout\` 下的 `sealed` 留出集与训练标签均未触碰。

## 分阶段收口总览

| 阶段 | 核心产出与结论 | 关键实测依据 | 权威出处 |
| --- | --- | --- | --- |
| 阶段 1 | 同台选出 Gemini 3.8 Flash；定位 403 地区限制并用代理解决；`e1-binary-v3` **带边界采用** | Gemini 首次结构合规 `107/108` → 重试 `108/108`，S1 `15/15`；v3 冻结复测 `51/51` 格验真，发现支持维翻转 `22/89` 及 3 条已知边界 | [阶段 1 收口](archive/stage1-closeout.md) · [代理补跑报告](archive/status-log-2026-11.md#round2-judge-bakeoff) |
| 阶段 2a | 换跨家族 Gemini 审核器后难例校验满分；关闭学生推理后复跑验证两类高压画像可用 | 审核验证两遍 `40/40`、难例 `24/24`（Qwen `21/24`）；`stage2a-learner-fix-full-01` 48 条审齐，顽固/伸手型全条件 `4/4`，假装懂了型 `2/4` 不可用 | [阶段 2a Gemini 审核](archive/status-log-2026-11.md#stage2a-gemini-audit) · [自证伪修复](archive/status-log-2026-11.md#stage2a-learner-fix) |
| 阶段 2b | 在 8 题 dev 集检验线性基线六维余量，锁定阶段 3 主目标维 | `stage2b-headroom-real-01` `48/48` 格验真（674 请求）；交还主动权适用 `48/48`、失分 `47/96`、两遍同档 `23/24`，A1 `48/48` 而 A2 仅 `1/48` | [阶段 2b 余量报告](archive/stage2b-headroom.md) |
| 阶段 3 | 预登记三臂 A/B 门禁拦截不成熟状态机升级，执行**不采用**决定 | dev v2 `72/72` 机判验真：A2 从 `1/24` 升至 `12/24`，但 V 维退化 `−0.208`（越过 `−0.125` 线）、A 差 `+0.042`；另定位同链引用缺失与 Haiku 盲核 `reason` 超长（`14/16` 超 400 字符） | [阶段 3 收尾](research/stage3/closeout.md) · [dev 实测流水](archive/status-log-2026-11.md#阶段-3-状态驱动教师) |
| 阶段 4 | 完成离线 HTML 项目总览包、重构首页 `README.md`、建立确定性文档门禁与 CI | `docs/report/index.html` 可下钻到 S1 v3 与 Stage 3 dev v2 单格对话证据；`npm run check:docs` 与 GitHub Actions 已接入 | [项目离线报告](report/index.html) · [README 出处](research/readme-sources.md) · [路线图](plans/roadmap.md) |

## 下一步

- 项目 1 阶段 1–4 按 [推进路线图](plans/roadmap.md) 收官；后续在 `D:\Code\resume` 同步项目条目，并在项目 2 中复用 `src/models.mjs`、状态机内核边界与离线/真实评测门禁。
