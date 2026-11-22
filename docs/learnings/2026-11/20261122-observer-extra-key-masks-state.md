# 观察器多字段与缺状态要分开诊断

**现象。** 阶段 3 v2 的 DeepSeek 观察器有 16 次 `invalid observation fields or state`。实际有 15 次多 `"type":"json_object"`，另一次为 `"type":"blocked"` 且缺 `state`。

**直接原因。** [观察器契约](../../../contracts/teacher/observation.mjs#L16-L25)要求精确字段与合法 `state`。两类触发同一错误，但第二类删掉 `type` 仍缺状态。不是五次待修锚未对齐，也不因字段看似相近就能断定 `type` 等于 `state`。

**证据。** `stage3-dev-v2-real-01` 的 [F01-A／默认](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F01-A/default/calls/teacher_observer-2-1-1.json)和 [F01-B／默认](../../../runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F01-B/default/calls/teacher_observer-2-1-1.json) #4 前原件，`callId` 分别为 `candidate:TA2B-F01-A:default:teacher_observer:2:1:1`、`candidate:TA2B-F01-B:default:teacher_observer:2:1:1`。

**处置与预防。** 保留回退，不改契约。以后若试窄容错，用仅冗余键和冗余且缺必需状态两种原件分别断言，另守住错角色及待修锚的拒收。不能用 HTTP 200 当观察成功。
