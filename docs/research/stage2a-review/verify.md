# Stage 2a 七个反例核查

只读核查 `feat/stage2-hard-learners-json`（HEAD `034bd39`）。以下 `报告` 指 `runs/stage2a-hard-learners-05/hard-learner-fidelity-report.md`；对话和审核原件路径也相对该运行目录。每条 #9 是对应坐标下 `transcript.json:54`；审核原始字段在相应 `rN/题/画像/calls/fidelity_audit-4-1-1.json:39`，按 #8、#9 引文绑定样例。

## 1. 伸手要答案型 · 两条 answer｜部分属实

- `r1/S0-06/answer-seeker/answer`（报告 L93）：「Okay, I’ll write 25/13. But can you show me how you got that—what lengths or triangle did you use?」明确要写下答案，也明确要方法。`r1/S0-06/answer-seeker/audit.json:20,30–31` 记录 `surface-understanding / none`，理由原文：「The learner assents to the answer and accepts it as correct, showing surface-understanding, without performing a step or requesting to copy.」
- `r2/S0-06/answer-seeker/answer`（报告 L119）：「Okay, so the distance is 25/13 units. Can you show me the steps for how you got that, especially what to plug into Pythagoras?」复述答案，未明确承诺抄写，但明确索要步骤。`r2/S0-06/answer-seeker/audit.json:52,62–63` 同判 `surface-understanding / none`，理由原文：「The learner assents to the answer and treats it as understood, but requests the derivation without performing any step or endorsing a misconception.」
- 两条都应是 `answer-dependence / none`。实际审核提示与 `contracts/learner/fidelity.mjs:8` 一致，规则 3 原文：「3. answer-dependence: Use this only if #9 explicitly asks the tutor to supply a method, step, or result, or expressly commits to copying an answer, without doing its own step. You must be able to point to those actual words. An implied request, a stated obstacle, or the absence of work is insufficient. An explicit request takes priority over assent, thanks, and repetition at the start of the reply.」

## 2. 伸手要答案型 · 两条 independent｜属实

- `r1/S0-06/answer-seeker/independent`（报告 L95）：「I’d pick AE because A is on side AD, but I’m stuck on why that would be the shortest—doesn’t it just end at a vertex instead of going straight to the side?」`r1/S0-06/answer-seeker/audit.json:52,62–63` 为 `exposed-gap / attempt`，回包 `stepPerformed=true`。
- `r2/S0-06/answer-seeker/independent`（报告 L117）：「I’d pick AE because it ends on AD at A, but I’m stuck on why it would be the shortest—AE looks slanted, not perpendicular. Is the segment supposed to go straight down from E to AD instead?」`r2/S0-06/answer-seeker/audit.json:20,30–31` 为 `exposed-gap / none`，回包 `stepPerformed=false`。
- 两条都选定了 `AE` 并说明为何选它；r2 还点出不垂直。措辞不同，动作等价。#8 明说「Try drawing or naming one choice first.」（两条 `transcript.json:48`），字段定义把「choosing and specifying a candidate」列为已做一步（`contracts/learner/fidelity.mjs:15`）。漂移在 `stepPerformed`，不是 `stance`。

## 3. 顽固误解型 · r2 repeat｜属实

`r2/S0-01/stubborn/repeat`（报告 L102）：「I get that all thirteen roots sum to zero, but the six terms in the expression are still powers of a root of unity. Why wouldn’t they cancel the same way? I’m not seeing what else to try first.」`r2/S0-01/stubborn/audit.json:36,46–47` 判 `answer-dependence / none`，理由称「The learner explicitly asks the tutor what to try first」。末句是陈述卡住，不是明确索要第一步；反问仍在维护旧规则。更贴合的是 `misconception / none`。r1 类似的反问「so why wouldn’t those six cancel the same way?」正是这么判的（报告 L76；`r1/S0-01/stubborn/repeat/transcript.json:54`；规则 `contracts/learner/fidelity.mjs:6–8`）。

## 4. S0-01 三条 independent｜部分属实

- `r1/S0-01/pretender/independent`（报告 L85）：「I’d try z = 1 first. Then the expression is 1+1+1+1+1+1 = 6, not 0, so my “they must cancel” idea seems wrong because these are only six of the thirteen roots, not all of them. But I’m still stuck on how to use that to find all the possible values.」有依据地否定旧规则。
- `r2/S0-01/pretender/independent`（报告 L111）：「I’d try z = 1 first: then each of the six terms is 1, so the expression is 6, not 0. That makes me doubt my cancellation idea, but I’m still not sure why—maybe I was treating the six selected powers like they were the full set of 13 roots, and I don’t see what fixes that.」措辞试探，但给出了反证和误解来源。两条都超出画像要求的「Choose an initial step that leaves your original misconception unresolved.」（`contracts/learner/profiles.mjs:11`）。
- `r1/S0-01/stubborn/independent`（报告 L79）：「I still think the six powers are roots of unity, so they should cancel. For a first step I’d try z = 1, but then the expression is 1+1+1+1+1+1 = 6, which doesn’t cancel. That confuses me — I’m stuck on why that doesn’t just break my rule.」自选反例已违反画像的「do not construct or test a new counterexample on your own」（`contracts/learner/profiles.mjs:9`），但学生明确仍信旧规则，没有说清旧规则错在哪里。按审核规则 1 与修正字段定义（`contracts/learner/fidelity.mjs:6,16`），`misconception` 和 `correctionWithBasis=false` 更有依据。
- 三条原始回包均给 `stance=exposed-gap`、`stepPerformed=true`、`correctionWithBasis=true`（各组调用原件 L39），所以本地都记为 `repair`（`contracts/learner/fidelity.mjs:74`）。该字段由审核模型给出，代入本身不会自动触发它。

## 5. 总数｜部分属实

报告 L62–68 恰好七条。按上述核查，四条是明确错判或漂移，两条是明确的学生画像偏离，一条两者兼有。三条都自行代入，但只有两条用反证修正或质疑旧规则并指出了错因；不能把七条无重叠地归为「4 审核 + 3 学生自我修正」。

## 6. 配置与验证｜属实，有边界

- 学生为 `deepseek-flash`、`thinking: 'low'`（`config/e1.mjs:6,11`；运行 `manifest.json:23–41`；`src/models.mjs:243` 把该配置交给 SDK）。顽固型代入样例的请求回包实报 `"reasoning": 392`（该坐标 `calls/learner-4-1-1.json:44`）。
- S0-01/independent 的 #8 原文含「Try one concrete first step on your own.」（`config/hard-learners.mjs:20`，三条实际对话均为 `transcript.json:48`）。S0-01 `known` 原文是「Substitution, the given power equation, and that the sum of all thirteen thirteenth roots of unity is zero.」（同配置 L8）。
- 每格固定 #1–#8，只调用一次 `learnerReply` 生成 #9（`src/hard-learner-plan.mjs:66–72`；`src/hard-learner-run.mjs:97–106`；`src/learner.mjs:4–9`）。没有额外的学生行为状态机或语义自检；有 JSON 校验和批次停线状态（`contracts/learner/schema.mjs:38–49`；`src/hard-learner-plan.mjs:9–26`），失败最多重试两次（`config/e1.mjs:4`；`src/models.mjs:177,332`）。实跑学生 48 请求、0 重试（报告 L15）。
- 审核为 `qwen/qwen3-235b-a22b-2507`、`parasail/fp8`，每组四格一次请求，不是每格一次（`config/e1.mjs:15–16`；`src/hard-learner-run.mjs:127–139`）。出站不带 `reasoning`（`src/models.mjs:191–205,248–251`）；12 份审核回包 L50 均实报 `"reasoning": 0`，报告 L16 记 12 请求、0 重试。本地校验 #8、#9 引文；非空 `unexplainedClaim` 须见于 #9，再用转义后的边界正则检查此前教师是否给过该字面片段，不复判标签（`contracts/learner/fidelity.mjs:36–48,60–74`）。
- `runs/stage2a-audit-validation-2/audit-validation-report.md:3,9` 的修订 2：首遍准确率 **16/16（100%）**，次遍 **16/16（100%）**，跨遍一致率 **16/16（100%）**。`result.json:4–12` 原字段 `correct: [16,16]`、`agreement: 16`。归档 `prompt.txt` 与本轮调用提示相同。这是固定 16 条、按四字段整条计分的成绩，不能排除本轮实样误判。

## 7. 身份、重跑与「能用」｜属实，按共享修改判断

- 只关 `thinking` 就改变评测身份：`identity` 记录 `calls.learner` 和源码哈希，再算 `identityId`（`src/hard-learner-run.mjs:22–25,40–50`）。仅关 thinking 不改画像哈希；规则若加到共享 `hardPrompt`，三个画像哈希都会变；只改某个 `behavior`，只改该画像哈希（`contracts/learner/profiles.mjs:6,15–19,27–31`）。本提议含共享 thinking 改动，因此要为新配置背书，三个画像都应重跑，同样两题、四刺激、两遍，共 48 格（`src/hard-learner-plan.mjs:31–42,44–50`）。
- 先用现有原件核准有争议的标签，再分开验证关 thinking 与改提示。顽固型已有禁止自造反例的规则；伸手型则被要求「actually try one step with your starting knowledge or the hint」（`contracts/learner/profiles.mjs:9–10`），S0-01 两遍自行代入仍都合格（报告 L82、L104）。全局禁令可能改变本来合格的行为，现有证据也不能归因于 thinking。
- 顽固型的「能用」仍是旧版小样的机器结论（报告 L3、L40–44），无需因这次只读核查撤销，但不可沿用到新身份。旧版 repeat 和 independent 都是 3/4，恰在门槛；新身份待复验，同时要保住两题 targeted 各至少 1/2 的有依据进步，而非只看是否不再自行代入。
