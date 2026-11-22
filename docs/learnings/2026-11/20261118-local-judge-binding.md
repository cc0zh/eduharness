# 严格 JSON 不替代本地证据绑定

**现象。** E1 正常格先出现跨槽证据交错、组间证据重叠，随后出现不合法 JSON。改用 `json_schema` 且设 `strict: true` 后，另两份响应通过结构检查，却把 `context_id` 写成 `e` 和 `a`，仍不能用来评分。

**根因与边界。** 已证实旧格式把上下文标识和长消息 ID 的生成交给裁判，结构合规不能保证引用对应本格对话，也不能保证时序和槽位正确。未证实下游路由为何返回错误标识。这些尝试不能证明 strict 在所有调用中都生效。

**证据。** [六份原件的诊断表](../../archive/round1-judge-structured-output.md)列出交错、重叠和语法错误。`c72b66d:docs/status.md:5` 及 `runs/e1-real-structured/normal/calls/judge-4-1-{2,3}.json` 记录错误回填。`e045d49:contracts/judge/schema.mjs:56–81` 是编号解析和绑定变更；`cd0de52:docs/status.md:3` 及 `runs/_receipts/e1-real-numbered-two-cells.json` 记录两格有效总分。

**修复或现状。** 保留 strict 请求，裁判只返回当前窗口的短整数序号。本地从实际视图建立绑定，把序号映射成完整消息 ID，再校验角色、顺序和组间重叠。修复后的真实双格通过，正常格第一份响应仍因分数与证据冲突被拒绝，重试才合规。

**预防。** 区分请求格式、完整 JSON 和证据语义。回归用错序、重叠、越界、截断和尾随文本作反例，不靠截取或拼接 JSON 换取分数。

旧库参照：`mini-eduharness2/docs/learnings/2026-11/20261116-strict-schema-and-local-contracts.md`。旧案是学生输出，本条只迁移「服务端结构约束与本地契约分工」的做法，以上为本库裁判原件。
