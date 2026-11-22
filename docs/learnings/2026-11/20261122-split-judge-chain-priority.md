# 拆分裁判提示要核对同链择证

**现象。** 阶段 3 v2 的 F12-B／伸手在 #9 提出分段复核并当条实做，合规盲核 Yes/Yes。Gemini 的 A2 引 #9，A1 却引 #3，A 得 1 分。候选另有九个 A2 阳性格因不同锚点只得 1 分，但并非每个都独立实做。

**直接原因。** [`scoreBinary`](../../../contracts/judge/binary.mjs#L122-L129)按返回的引用序号匹配同链，不搜索别的执行证据。v2 的[合判系统提示](../../../src/binary-judge.mjs#L3-L7)有通用同链优先，[v3 的 A 维提示](../../../src/binary-judge-v3.mjs#L39-L52)没有；A1、A2 题义未变。未用只改提示的对照验证这次锚点选择的原因。

**证据。** `stage3-dev-v2-real-01` 的 F12-B／伸手判决（`runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-B/answer-seeker/judge.json`）与公开 #9（`runs/stage3-dev/stage3-dev-v2-real-01/candidate/TA2B-F12-B/answer-seeker/transcript.json`）。A 的 `callId` 是 `candidate:TA2B-F12-B:answer-seeker:judge:4:3:1`；盲核调用（`runs/stage3-dev/stage3-dev-v2-real-01/audit/986fb0b2-f2ee-4d9b-a850-67822637fc9f/calls/agency_audit-4-1-1.json`）的 `choice` 和 `execution` 都引 #9。[十格回读](../../research/stage3/closeout.md#五项归因核实)

**处置与预防。** 保留原分。将来拆维时先比对实际出站文字，再检查同题输出引用。用「有早期独立步骤，后有自选且实做」和「后段只提议」两个用例区分漏引与引过头。不只看 Yes 率。
