# TeachArena 文档索引与写入路由

`docs/` 采用双区治理：少量**现行活文档**留在 `docs/` 根目录保持精简，历史流水、一次性诊断与已完结计划统一归档到 `docs/archive/` 或冻结在 `docs/research/`。`npm run check`（调用 [文档门禁脚本](../scripts/check-docs.mjs)）在本地和 CI 自动拦截根目录乱建文件、活文档膨胀、索引漏登和脏链接。

## 现行文档地图

| 文档 | 职责 | 状态 |
| --- | --- | --- |
| [当前状态](status.md) | 纯状态路由：当前有效基线、阶段 1–4 结论与入口链接（≤ 100 行） | 活文档 |
| [验收场景卡](scenarios.md) | E1/E2、未见题、A/B 对照与已移出范围的验收口径 | 活文档 |
| [运行手册](runbook.md) | 离线/真实命令行入口、预检授权、断点续跑与 HTML 报告导出 | 活文档 |
| [术语表](glossary.md) | 评测状态、证据绑定、评测身份与计分口径规范定义 | 活文档 |
| [里程碑历史](history.md) | E1 演进与重大里程碑索引，链接各期归档记录 | 活文档 |
| [推进路线图](plans/roadmap.md) | 阶段 1–4 收口路线图与项目 2 衔接规划 | 活动计划 |
| [历史档案索引](archive/README.md) | 首轮/阶段 1–2b 收口、逐轮流水日志、早期诊断与旧计划归档 | 历史归档 |
| [踩坑记录索引](learnings/README.md) | 按 `YYYY-MM/YYYYMMDD-slug.md` 沉淀的可迁移工程与评测教训 | 知识库 |
| [研究归档索引](research/README.md) | SHA256 核验的 19 份实验调研原件（阶段 4 已裁剪 4 个外部通用目录）与阶段 3 锁定预登记/收尾 | 冻结归档 |
| [README 数据出处](research/readme-sources.md) | 首页 `README.md` 全部数值与结论的逐行原件出处对照表 | 溯源台账 |
| [离线项目报告](report/index.html) | 阶段 1–4 交互式单包离线 HTML 总览（支持点进具体 run 复核页） | 阶段 4 交付 |

## 写入路由表（防文档拉屎规范）

| 你要写什么 | 唯一允许落点 | 门禁约束 |
| --- | --- | --- |
| 一次运行后的实验流水、逐轮数字、收口复盘 | `docs/archive/` 并在 [archive/README.md](archive/README.md) 登记 | 禁止往 `docs/status.md`（≤100 行）或 `docs/` 根直接堆放 |
| 一条可复用的踩坑经验、根因与预防措施 | `docs/learnings/YYYY-MM/YYYYMMDD-slug.md` 并登记到 [learnings/README.md](learnings/README.md) | 不得出现指向 `runs/` 或 `.tmp/` 的可点击链接，改用反引号路径 |
| 新的跨模块活动计划 | `docs/plans/<name>.md` 并登记到本页索引 | 已完成旧计划迁入 `docs/archive/plans/` |
| 临时进度草稿、预检/对齐脚本输出、中间日志 | `.tmp/scratch/<任务名>/`（不进 Git，任务结束清理） | 仓库根和 `docs/` 根严禁出现未登记 `.md` |
| 需要向评审或面试展示的项目汇总报告 | `docs/report/`（经导出脚本生成，零外网资源） | 由 `npm run check:docs` 校验站内链接与离线纯度 |
