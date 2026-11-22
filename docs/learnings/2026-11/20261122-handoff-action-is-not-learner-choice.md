# 选中交权动作不等于真把方法交给学生

**现象。** 阶段 3 第 1 版的代码选了 19 次 `handoff`，实际回复有的指定检验、有的先列出展开式、有的直接收尾。A2 三臂各 0/24。15 次 `handoff` 已发生在 #6 或 #8，固定窗口提前不是这一批的唯一解释。

**已知原因与边界。** v1 的代码负责给教师选提示，但不约束公开回复必须留下一项由学生决定的检验。用保存的请求上下文在本地 Fetch 边界回放四例，动作提示都在系统消息中，没有外发。排除了四例的序列化漏传。未隔离模型指令遵循、通用教学政策的收尾倾向与任务是否还留有可检验目标，不能把差异归因于单句提示。

**证据。** 第 1 版报告（`runs/stage3-dev/stage3-dev-v1-real-01/report-v1.md`）和门控回读（`runs/stage3-dev/stage3-dev-v1-real-01/gate-readback.json`）。`candidate/TA2B-F01-A/answer-seeker` #6 指定沿外轮廓及各边长，#7 逐项相加；`candidate/TA2B-F18-B/default` #6 说 “Nothing further to resolve.”。四份本地请求体回放（`runs/stage3-dev/stage3-dev-v1-real-01/outbound-goal-readback.json`）

**处置与预防。** 把状态、代码动作、公开交权与学生原创实做四层分开记录。后续若获授权，先用「动作正确但指定了做法」和「动作正确但收尾」两个行为反例保护输出边界，再用同一预登记检验，不把动作计数当成 A2 提升。
