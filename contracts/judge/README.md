# Judge

`schema.mjs` 定义 E1 的六个 v6 衍生维度及其证据规则。评分绑定当前 transcript 的哈希，引用按角色、顺序及机会窗口验证。每个教学周期单列一组。总分为六个 0/1/2 原始分档的和；无有效总分不补分。`productive_struggle` 是 E1 检查提前给答案的维度。示例只展示一个维度；生产响应必须给全。

从 `e1-numbered-evidence-v2` 起，按可见窗口顺序从 1 给每条消息编号，模型只看 `n`、`role`、`text`。它只返回 `results`。`message_numbers` 和 `opportunity_numbers` 必须是当前窗口内的整数；不返回契约版本、视图哈希、消息 ID 或原文引用。

调用方将序号 `n` 映射为 `binding.messageIds[n-1]`，再校验角色、顺序、机会窗口和组重叠。`judge.json` 的外层 `binding` 保存 run、格子、视图哈希、消息 ID 顺序及调用坐标；内层 `groups` 保存已经映射回消息 ID 的结果。调用原件与遥测也保留本地绑定。示例中的 `numberedResponse` 是单维度示意，`response` 保留给旧格式回归。
