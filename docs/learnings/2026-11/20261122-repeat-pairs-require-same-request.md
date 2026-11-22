# 同对话的重复评测也要核对请求内容

**现象。** 阶段 1 重算 v3 同输入翻转率时，五维各有 99 对，增加与撤去支持只有 89 对。其余维度不能替该维补齐分母。

**原因。** 两个格子的支持维都在首试因观察窗口规则被拒后，用 `window` 反馈重试。重试请求在系统提示末尾追加反馈，尽管公开对话没变，它不再与该组的首试请求相同。这两格合计少 10 对。这里能确定的是请求差异，不能确定供应商为何给出不同判决。

**证据。** 本机 ①h `r3:answer_dump:judge:4:2:2`（`runs/round2-bakeoff-gemini-proxy-01/_processes/1/r3/answer_dump/calls/judge-4-2-2.json`） 和 v3 `r1:lecture:judge:4:2:2`（`runs/round2-binary-v3-freeze-gemini-01/_processes/1/r1/lecture/calls/judge-4-2-2.json`） 的 `context.systemPrompt`。配对 JSON（`.tmp/scratch/stage1-closeout/flip-rates.json`） 的 `v3.groups` 有逐组判决次数和配对数。再算命令和配对限制见[阶段 1 收口](../../archive/stage1-closeout.md#同输入翻转率)。

**处置与预防。** 用实际采纳的调用，按版本、对话 SHA、维度和保留的请求字段配对。让重试提示参与分组；不把不同请求间的变化当同输入噪声。报告每维分母和不同输入数，不把共享判决的多对比较当成独立重复。
