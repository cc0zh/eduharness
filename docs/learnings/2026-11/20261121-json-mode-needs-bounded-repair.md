# JSON mode 仍需有界本地校验

**现象。** `stage2a-hard-learners-04` 的学生请求使用普通文本模式。两条返回裸文本，一条返回 JSON 字符串内含未转义 LaTeX。第三次 `simulator_generation_contract` 后停在 25/48 生成、24/48 审核。

**根因与边界。** DeepSeek JSON mode 只约束 JSON 输出，不保证字段 schema，也不保证反斜线语义。非法 escape（例如 LaTeX `\(`）会使整个文档解析失败；LaTeX `\frac` 与合法 JSON `\f` 前缀重叠，直接解析会悄悄改变字段值。有效但有歧义的控制 escape 不能猜。

**证据。** 04 号报告列出 `r1/S0-06/stubborn/targeted/calls/learner-4-1-1.json` 裸文本、`r2/S0-01/stubborn/independent/calls/learner-4-1-1.json` 的原字 `\(S(z)=...`，以及下一次裸文本 `r2/S0-01/stubborn/independent/calls/learner-4-1-2.json`。04 报告（`runs/stage2a-hard-learners-04/hard-learner-fidelity-report.md`）。05 号原件显示请求带 `json_object` 与 JSON 示例，48/48 收齐、无重试、无清理。05 报告（`runs/stage2a-hard-learners-05/hard-learner-fidelity-report.md`） · 首条原件（`runs/stage2a-hard-learners-05/r1/S0-01/stubborn/repeat/calls/learner-4-1-1.json`）

**修复与现状。** 只在 `hard-learner-fidelity` 启用 JSON mode。清理器只提取唯一单 `text` 字段对象，移除配对围栏及首尾文字，并仅补转义语法无效的反斜线；修复记录进入每个 attempt。合法控制 escape 与字母相连时作为歧义失败，不改写。其它学生路径仍严格解析。单测覆盖裸文本、围栏、非法 LaTeX、歧义 `\frac`、重复字段、损坏 Unicode 和精确保真。画像和审核提示未改。

**预防。** 面向结构化输出调用时，提示要明确格式并给出目标 JSON 示例；`response_format` 不替代本地字段校验。修复器必须有明确边界，保留原始响应、记录每次改动；无法证明字段原字相等就作为技术失败，不包装裸文本或猜测控制字符。失败坐标不进入行为分母。
