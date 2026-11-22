# 当前状态

<a name="stage2a-learner-fix"></a>

## 阶段 2a 学生自证伪修复（20261122）

**甲组复跑后，顽固误解型与伸手要答案型仍能用，假装懂了型仍不可用。** 按预登记停止，不补跑或再改画像。只在本轮使用甲组的新学生身份：DeepSeek Flash 显式关闭 `thinking`，不加共享条款，三张画像哈希不变。审核仍为 `hard-learner-audit-v5-gemini`，提示、端点、预算和代理条件不变。[学生配置](../config/hard-learners.mjs) · [原判线](#stage2a-gemini-audit)

**四组小样。** S0-01/independent 中，只有亲自做了未指定的特例、再据此修正或动摇原误解，才计自证伪。先盲读 #9 再解盲。S0-06/targeted 每组两条，检查学生确实使用老师给的坐标。四次同条件重复复用提示、温度为 0，只用于本轮选优。

| 配置 | 自证伪 | 独立解释命中 | 针对错因命中 | 指定代值通过 |
| --- | ---: | ---: | ---: | ---: |
| 对照：low、无共享条款 | 2/8 | 7/8 | 2/2 | 2/2 |
| 甲：off、无共享条款 | 0/8 | 4/8 | 2/2 | 2/2 |
| 乙：low、有共享条款 | 1/8 | 6/8 | 2/2 | 2/2 |
| 丙：off、有共享条款 | 0/8 | 4/8 | 2/2 | 2/2 |

甲与丙两条代值均通过，自证伪均为 0/8。预登记的平手顺序是甲、乙、丙，因此选甲。画像命中不用于平手，也不能用自证伪减少代替完整验收。[40 条 #9、标签和 callId](../runs/stage2a-learner-fix-pilot-01/pilot-report.md)

**甲组 48 条复跑。** 每画像审齐 16/16。顺序为重复、给答案、针对错因、独立解释，每项需 ≥3/4。三类两题可教性均 2/2、2/2，无跃迁或泄漏。比较基线是 run 05 的 Gemini 重审，不是旧 Qwen 结果。

| 画像 | run 05 Gemini | 本轮 | 结论 |
| --- | --- | --- | --- |
| 顽固误解型 | 4/4、4/4、4/4、4/4 | 4/4、4/4、4/4、4/4 | 能用 → 能用 |
| 伸手要答案型 | 3/4、4/4、4/4、4/4 | 4/4、4/4、4/4、4/4 | 能用 → 能用 |
| 假装懂了型 | 4/4、4/4、4/4、2/4 | 2/4、4/4、4/4、2/4 | 不可用 → 不可用 |

假装懂了型的四个未命中都在 S0-01。两遍独立解释只提议代入 `z=1`，仍主张六项该相消；两遍重复却主动摊开不理解之处。由 `repair` 变为 `misconception` 仍不命中该画像的独立解释要求。保留全部审核标签，未续跑。[逐条件与 48 条对比](../runs/stage2a-learner-fix-full-01/hard-learner-fidelity-report.md)

**收据。** 小样登记 SHA256 `75f696270bc8847b10937fa40f07baefb48f9703708b1e47cae18fae9234a1fb`，复跑登记 `7eef0d9ab043dc65864623fb6393ae14788f59ee32c5e437c225bf5f3ccfd11e`，均先于零请求预检和真实启动。两次均在干净 `ba2dbc0` 上通过 42 项范围检查。两份 `manifest.json` 各保存当次收据，公用[收据路径](../runs/_receipts/check-hard-learners-ba2dbc01b5321fe41602715dca472c005215e4d4.json)保留最近一次检查。`--verify-run` 均通过；启动、进程、manifest、调用原件与遥测的 PID 一致，无停线、重试或总用量缺报。关闭推理的学生回包未报推理用量，不能把缺报读成零。

| 运行 | PID | 实发／上限 | 请求输出 token／上限 | 实报总 token |
| --- | ---: | ---: | ---: | ---: |
| [40 条小样](../runs/stage2a-learner-fix-pilot-01/pid-usage-check.json) | 50892 | 56／168 | 229,376／688,128 | 78,895 |
| [48 条复跑](../runs/stage2a-learner-fix-full-01/pid-usage-check.json) | 53208 | 60／180 | 245,760／737,280 | 74,517 |
| 合计 | | 116／348 | 475,136／1,425,408 | 153,412 |

[本地进度、预检与审查](../.tmp/scratch/hard-learners/learner-fix/progress.md)

<a name="stage2a-gemini-audit"></a>

## 阶段 2a Gemini 审核（20261122）

**采用 Gemini 重审 run 05。伸手要答案型由不可用转为能用。** 这不是新学生配置的结论。源 run 05 使用 DeepSeek Flash、`thinking: low`；48 条新审核绑定相同的 48 份转录和 12 份原审核证据视图，未生成学生回复。顽固误解型仍能用，假装懂了型仍不可用。

`fidelity_audit` 使用 `google/gemini-3.8-flash` / `google-ai-studio`、`reasoning.effort: low`、温度 0、每请求 4,096 输出 token、120 秒 deadline。出站为严格 `json_schema`、`require_parameters: true`、`allow_fallbacks: false`，显式使用 `HTTPS_PROXY`。策略 `hard-learner-audit-v5-gemini` 与评测身份绑定路由、预算、传输、源对话和预登记。审核提示 v2 SHA256 `c7823a99e324ba5e03b303833b9f9590d3c5be357bc4f9b7b85a0168eef93af0` 不变。既有学生生成入口的 Qwen 默认不变。[策略](../config/fidelity-audit.mjs)

**验证。** 保留原 16 条，加独立复核的 24 条原创难例，四类各 6 条。Gemini 两遍各 **40/40**，难例各 **24/24**，跨遍一致 **40/40**；达到各 36/40、22/24、36/40 的预登记线。Qwen v2 难例 **21/24**（87.5%，描述性对照）。D01、D02、D03 把有验算但没有修正的回复误判为 `correctionWithBasis=true`，派生为 `repair`。[Gemini 验证](../runs/stage2a-gemini-audit-validation-01/validation-report.md) · [Qwen 逐条错因](../runs/stage2a-qwen-hard-audit-validation-01/validation-report.md) · [难例真值冻结](../.tmp/scratch/hard-learners/audit-validation/hard-truth-review.md)

**48 条重审。** 每画像审核齐 16/16。按原登记，每条件须 ≥3/4，两题可教性各须 ≥1/2，跃迁和泄漏须为零。两侧三画像在两题上的可教性均 2/2，均无跃迁或泄漏。条件顺序为重复／给答案／针对错因／独立解释。

| 画像 | Qwen 条件命中 | Gemini 条件命中 | 使用结论旧 → 新 |
| --- | --- | --- | --- |
| 顽固误解型 | 3/4、4/4、4/4、3/4 | 4/4、4/4、4/4、4/4 | 能用 → 能用 |
| 伸手要答案型 | 4/4、2/4、4/4、3/4 | 3/4、4/4、4/4、4/4 | 不可用 → 能用 |
| 假装懂了型 | 4/4、4/4、4/4、2/4 | 4/4、4/4、4/4、2/4 | 不可用 → 不可用 |

四标签在 11/48 条上有变化。七个事前反例与复核参考全部相符：两条给答案改判 `answer-dependence`，一条选定候选改判 `attempt`，一条卡住却仍坚持旧规则改判 `misconception`，一条验算仍坚持改判 `misconception / attempt`。两条假装懂了型仍判 `repair`，不命中独立解释条件。伸手型另有一条重复条件新判 `exposed-gap` 而未命中，原话也有询问下一步；不事后重标。构造题全对不代表原件每个标签正确。[48 条对照与七例](../runs/stage2a-hard-learners-05-gemini-reaudit-01/reaudit-report.md) · [逐字段及引文](../runs/stage2a-hard-learners-05-gemini-reaudit-01/result.json)

验证预登记 SHA256 `993776d46eb8a868abd6f10ace96e6cdc6ad09355226f384237b5fdeed7364ca`；过线后另锁重审预登记 `0e4edbeee6d856f53fd9287fbc46d294eb572111c1906331576dabf87d6d9c63`。三次零请求预检及 PID 见[进度](../.tmp/scratch/hard-learners/gemini-audit/progress.md)。三次真实运行使用干净 `14c3e91` 的 [316 项检查收据](../runs/_receipts/check-14c3e918eff87384d78c12ac60d40898351fc9aa.json)，`--verify-run` 均通过。启动、进程、manifest、请求事件和遥测的 PID 一致；没有重试、停线或用量缺报。

| 运行复核 | PID | 实发／该侧上限 | 请求输出 token／该侧上限 | 实报总 token |
| --- | ---: | ---: | ---: | ---: |
| [Qwen 难例](../runs/stage2a-qwen-hard-audit-validation-01/verify-run.json) | 51360 | 24／72 | 98,304／294,912 | 33,827 |
| [Gemini 两遍](../runs/stage2a-gemini-audit-validation-01/verify-run.json) | 41652 | 80／240 | 327,680／983,040 | 111,279 |
| [Gemini 重审](../runs/stage2a-hard-learners-05-gemini-reaudit-01/verify-run.json) | 51288 | 12／36 | 49,152／147,456 | 37,344 |
| 合计／任务授权 | | 116／312 | 475,136／1,277,952 | 182,450 |

<a name="stage2a-json-mode-rerun"></a>

## 阶段 2a JSON mode 正式续跑（20261121）

**`stage2a-hard-learners-05` 收齐 48/48 条生成和审核。** 本轮只更换学生 JSON 输出协议及技术停线，不动画像、条件、行为判线或审核第 2 版。学生输出评测身份为 `hard-learner-fidelity-v2`：DeepSeek `json_object`、有界清理、歧义转义拒绝；三类画像哈希与正式审核提示 SHA256 `c7823a99e324ba5e03b303833b9f9590d3c5be357bc4f9b7b85a0168eef93af0` 沿用原值。预登记合并 SHA256 `aa1bd23f82d2c92923034008daaab57ef56fca9f49a95b899e5d5d787027f2b1`。[预登记](../.tmp/scratch/hard-learners/preregistration-json-mode.md) · [逐条报告和第三轮对照](../runs/stage2a-hard-learners-05/hard-learner-fidelity-report.md)

| 画像 | 重复 | 给答案 | 针对错因 | 独立解释 | 两题可教性 | 跃迁／泄漏 | 机器判线 | 本轮使用结论 |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| 顽固误解型 | 3/4 | 4/4 | 4/4 | 3/4 | 2/2、2/2 | 0／0 | 能用 | 能用 |
| 伸手要答案型 | 4/4 | 2/4 | 4/4 | 3/4 | 2/2、2/2 | 0／0 | 需改 | 不可用 |
| 假装懂了型 | 4/4 | 4/4 | 4/4 | 2/4 | 2/2、2/2 | 0／0 | 需改 | 不可用 |

逐条分母为已审核有效回复，均为 4；每类已审 16/16。失败回复 0，审核故障 0，格式清理 0。只有机器判线完整达到「能用」的画像可用；其余按本次预登记记为不可用，不把失败或未审核项当作行为反例。本次到此停止，不续改画像。

与第三轮的逐条件、两题可教性和行为例见报告；三轮后有假装懂了型澄清和审核第 2 版变化，本轮再增加 JSON 输出身份，比较仅作描述性结果。第三轮机器结论为 `需改 / 需改 / 需改`；本轮为 `能用 / 需改 / 需改`。

运行于干净 HEAD `a5ad7cb8808aa6818f8997350625a0172a965b79`，范围检查 33/33，预检 0 请求。正式进程 PID `34236`，exit 0、60 请求、`acceptance=true`、`--verify-run verified=true`。硬上限 180 次和 737,280 请求输出 token；实际 60 次、245,760 请求输出额度，实报输出 17,430、实报总量 84,372 token，无缺报、无重试。[范围收据](../runs/_receipts/check-hard-learners-a5ad7cb8808aa6818f8997350625a0172a965b79.json) · [零请求预检](../runs/_receipts/stage2a-hard-learners-estimate-06.process.json) · [正式复核](../runs/stage2a-hard-learners-05/verify-run.json)

<a name="stage2a-audit-validation-rerun"></a>

## 阶段 2a 审核验证与正式重跑停线（20261121）

**审核验证通过，正式小样按停线退出。第三轮结论和判线保持原样。** Qwen 审核对 16 条冻结构造样本两遍均为 16/16 四字段全对，跨遍一致 16/16。之前提示 v0 为 10/16、8/16、14/16；v1 为 14/16、14/16、16/16，均未过 15/16 线。本批样本曾用于两次提示修订，验证结论仅限这 16 条。[全版本报告](../runs/stage2a-audit-validation-2/audit-validation-report.md) · [构造真值和预登记](../.tmp/scratch/hard-learners/audit-validation/preregistration.md)

审核复审 v2/v3/v4 整条一致率分别为 10/12、9/12 和 11/12。v2 与 v4 的共同 11 条都同判 10 条。v4 的构造验证通过，但只支持这批刻意构造的样本，不能证明审核对所有回复一致或正确。校准结果及限制见[本地记录](../.tmp/scratch/hard-learners/progress.md)。

审核通过后仅修改假装懂了型。给答案时要有可识别的理解表态；独立解释时先尝试、暴露原误解所在的缺口，并让这个缺口保持未解。新提示及判线沿用 v4 审核和冻结门槛。单轮正式小样只完成 25/48 条生成和 24/48 条审核，第二遍 S0-01 顽固误解型独立解释发生同类 JSON 故障停线。因此三类本轮均记 **不可用，正式小样未完成**。这不意味着已审核的半批行为都不合格。

`stage2a-hard-learners-04` 第三次 `simulator_generation_contract` / `invalid JSON document` 故障在 `r2/S0-01/stubborn/independent` 的第二次尝试停止；此前 `r1/S0-06/stubborn/targeted` 已有一次同类失败。未重启或换模型。进程退出 1、PID `43448`、34/72 请求、139,264/294,912 输出请求额度、实报 45,950 token、无用量缺报。`--verify-run` 中 `verified=true` 与 `conclusion=complete` 只说明已落盘部分的收据一致；同一结果仍是 `acceptance=false` 且 exit 1，不代表 48 条矩阵完成。[报告、逐条证据及部分分母](../runs/stage2a-hard-learners-04/hard-learner-fidelity-report.md) · [收据核验](../runs/stage2a-hard-learners-04/verify-run.json) · [正式预登记](../runs/stage2a-hard-learners-04/preregistration.md)

干净 `2a63f11` 的范围检查通过 23 项，预检 `stage2a-hard-learners-estimate-05` 为零请求，硬上限 72 次和 294,912 请求输出 token。[范围收据](../runs/_receipts/check-hard-learners-2a63f11134217eedbc7148eab22e0aabd5425574.json) · [预检收据](../runs/_receipts/stage2a-hard-learners-estimate-05.process.json)

本轮画像修改次数已用完。审核验证、本轮停线和画像使用结论均已记录。第三轮原报告、判线、画像和 run 原件未改，后续不得在无新决定前重启或追加画像轮次。

<a name="stage2a-hard-learners-revision"></a>

## 阶段 2a 画像单轮修订与审核校准（20261121）

**`stage2a-hard-learners-03` 审核齐 48/48，三类画像最终均为不可用。** 原样本的重复审核整条同判为 10/12。只改提示的 v3 为 9/12，停在审核校准。v4 结构化提交尝试、修正依据和新增事实原字，复审同判 11/12，几何两例均同为 `repair` 且无跃迁，两条教师给数的跃迁位均为 false。`r2/S0-06/pretender/answer` 仍有一个进步标签分歧。新旧共有 11 条，两版均同判 10 条。闸门通过后才修订各画像一次。[原口径复审](../runs/stage2a-audit-original-01/result.json) · [v3 复审](../runs/stage2a-audit-calibrated-01/result.json) · [v4 复审](../runs/stage2a-audit-calibrated-02/result.json)

| 画像 | 重复 | 给答案 | 针对错因 | 独立解释 | 两题可教性 | 跃迁标记／泄漏 | 最终 |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 顽固误解型 | 4/4 | 3/4 | 4/4 | 2/4 | 2/2、1/2 | 1／0 | 不可用 |
| 伸手要答案型 | 4/4 | 2/4 | 4/4 | 4/4 | 2/2、2/2 | 0／0 | 不可用 |
| 假装懂了型 | 3/4 | 0/4 | 4/4 | 1/4 | 2/2、1/2 | 1／0 | 不可用 |

对照原小样，三类的重复条件均过 3/4，两题可教性均达到各至少一次。审核仍把两条由 5 与 3 的比较支撑的局部修正标为跃迁，两条明确索步骤的回复被判表面理解。报告保留标签及前后数值，另列 #8/#9 回读。画像修订额度已用完。原 run 和结论在下节保留。[正式报告](../runs/stage2a-hard-learners-03/hard-learner-fidelity-report.md) · [预登记与附录](../runs/stage2a-hard-learners-03/preregistration.md)

附录合并 SHA256 `9d0bd249eef81b2e822d76a7c16f2d502b683ea75bb5ec25e3273a293e25e2b5`。干净 `27f004d` 范围检查 22/22，预检 0 请求。正式 run 退出 0，`--verify-run` 通过，启动、进程、manifest 与尝试遥测均为 PID `33336`。62/72 次请求、253,952/294,912 请求输出 token，实报 80,396 token，无缺报。两次学生 JSON 契约重试恢复。[复核](../runs/stage2a-hard-learners-03/verify-run.json) · [预检收据](../runs/_receipts/stage2a-hard-learners-estimate-04.process.json)

<a name="stage2a-hard-learners"></a>

## 阶段 2a 高压学生保真（20261121）

**重跑收齐 48/48 条审核，没有画像能用于考教师。** `stubborn` 在针对错因的反例或换表征后才修正；`answer-seeker` 在教师交还具体任务时尝试；`pretender` 在独立检查时露出卡点。有针对性教学时三类都允许局部进步。旧学生提示、公共九条与 #7 边界不变。[学生契约](../contracts/learner/README.md)

`stage2a-hard-learners-01` 在 GPT-4.1 mini 经 OpenRouter 的审核请求三次 HTTP 403 后停线，4/48 生成、0/48 审核。仅能确认请求被拒；旧原件不含错误体或实际上游。原[报告](../runs/stage2a-hard-learners-01/hard-learner-fidelity-report.md)和[复核](../runs/stage2a-hard-learners-01/verify-run.json)保留。

`stage2a-hard-learners-02` 按附录从头生成，不复用四条旧回复。`568e0c1` 锁定跨家族审核 `openrouter/qwen/qwen3-235b-a22b-2507` 和 `parasail/fp8`，严格 JSON，不发送推理或允许回退。12 次成功审核每次覆盖四条回复，均流报 Parasail，推理实报为 0。审核不是人工评审，不出教师分数。[预登记与附录](../runs/stage2a-hard-learners-02/preregistration.md) · [报告及 #8/#9 引用](../runs/stage2a-hard-learners-02/hard-learner-fidelity-report.md)

| 画像 | 重复 | 直接答案 | 针对错因 | 独立解释 | 两题可教性 | 跃迁标记／泄漏 | 结论 |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 顽固误解型 | 2/4 | 2/4 | 3/4 | 2/4 | 2/2、0/2 | 1／0 | 不可用 |
| 伸手要答案型 | 0/4 | 4/4 | 4/4 | 4/4 | 2/2、2/2 | 1／0 | 需改 |
| 假装懂了型 | 1/4 | 2/4 | 4/4 | 4/4 | 2/2、2/2 | 1／0 | 需改 |

表中是冻结判线的 AI 审核结果，每类审核齐 16/16。前四列各需 3/4；两题分别至少有一条有依据的进步；跃迁与泄漏均须为 0。S0-06 的顽固误解型 `targeted` 两遍 #9 都比较出 5 和 3 并松动，但一遍 `repair` 被标跃迁，另一遍只给 `attempt`，因此 0/2 不能断言教不会。另两条跃迁标记引用了 #8 已给的数值，和预登记相冲突。保留原标签和判线。弱刺激仍有反例，本轮无预算重测，未修改画像。

附录合并后 SHA256 `74ea73ac0a508b2143e05ed8cdbf03fdcf116b964b4048263dddc928e6d2f6c8`。[零请求预检](../runs/_receipts/stage2a-hard-learners-estimate-03.process.json)；干净 `568e0c1` 的[范围检查收据](../runs/_receipts/check-hard-learners-568e0c1a8182f08f443ce1d8ef2bed79836ced92.json) 21/21。默认全量检查会读混合题库，未启动。实跑退出 0，`acceptance=true` 仅表示收齐。`--verify-run` 通过，同 PID `46064`。用量 62/62 请求、253,952/253,952 请求输出 token，实报 76,817 token；两次审核 429 恢复，均缺报。[逐原件复核](../runs/stage2a-hard-learners-02/verify-run.json)

<a name="round2-judge-bakeoff"></a>

## 第二轮 ①h 六维裁判对照与冻结复测

### 代理补跑与冻结决定（20261122）

**Gemini 唯一入选；`e1-binary-v3` 不冻结。** [代理补跑附录](../.tmp/scratch/judge-bakeoff/preregistration-addendum-proxy.md) SHA256 `36270ad60ad4c58297305b63f31072d79bbd11d4aa0f253c29ed31c515700b83`，与原登记使用同一样本、判线、选优和停线。两批在干净 `d2f7cce` 上以 `--proxy-from-env` 运行，每批一个进程、并发 4。原 Haiku/Gemini 直连批次标为「基础设施未通，未测到」；Qwen 沿用原批，不重跑。新身份显式绑定 `judgeTransport` 和附录 SHA。原件与遥测核对 `proxied:true`、`proxySource:HTTPS_PROXY`，不记录地址与凭据。其他策略不启用这条代理路径。

| 原采用线 | Haiku 代理补跑 | Gemini 代理补跑 | 原 Qwen |
| --- | ---: | ---: | ---: |
| (a) 合规格，要求 18/18 | 7/18 | 18/18 | 7/18 |
| (b) 完整 S1，要求 ≥14/15 | 7/15 | 15/15 | 7/15 |
| (c) 四个坏教师分率均低于同遍 normal，要求 3/3 | 0/3 | 3/3 | 0/3 |
| (d) 四个目标维各要求 ≥2/3，按 answer_dump、lecture、sycophant_close、no_teach 顺序 | 0/3、2/3、2/3、1/3 | 四项均 3/3 | 四项均 0/3 |
| (e) 确定项 FP + FN ≤2，另报缺判 | 0，缺 57/99 | 0，无缺判 | 11，缺 39/99 |
| 首次结构合规 → 重试后合规 | 56/108 → 60/108 | 107/108 → 108/108 | 63/108 → 66/108 |

三侧的验真通过，PID 分别为 `40516`、`34744`、`42976`，均已结束。Haiku 达到四个失败格后停线；Gemini 只有一次重试，无停线。失败格和未发格均保留原分母。[合并报告、验真与 PID](../runs/round2-bakeoff-proxy-report/bakeoff-report.md)。

另锁[冻结复测预登记](../.tmp/scratch/judge-bakeoff/preregistration-freeze.md) SHA256 `e489892180d863f725976bfccb97793c141e7fcc81f199429a32f6a44da40c1b`。沿用选中 Gemini 的固定端点、策略、代理和裁判指纹 `27a32e4b14f73415f04bd7dc5314e3509f719f10be399bcb0c5123678e70757f`，对新样本计划另记运行身份 `2af26b90c9caf0e439c817f227c1f94b6ec854b1be2dd7d92ecc8d4a8923ce9e`。干净 `d93b5d4` 启动 `round2-binary-v3-freeze-gemini-01`，单进程 PID `47852` 已结束，`--verify-run` 通过，51/51 格有合规判决，无停线或缺判。[复测报告](../runs/round2-binary-v3-freeze-gemini-01/freeze-retest-report.md) · [PID 复核](../runs/round2-binary-v3-freeze-gemini-01/pid-check.json)

- **S1 通过。** 15/15 格完整，分率方向 3/3，四个目标各 3/3。五组复跑均成对完成；四个目标位相同 20/20，全部题位相同 94/95，六维分档相同 29/30。一致率只描述，不是判线。
- **定向复测未达。** 召回和特异度均须至少 0.8。V2 达线（3/3、2/2）；V1 召回 2/3，`V1-claim-none` 漏判；A1 特异度 1/2，`A1-only-proposes` 把 #9 判为 Yes；A2 召回 1/2，`A2-still-chosen` 漏判。
- **normal 四格未达。** V2 四格布尔值均符合预期，补解释格正确引用 #4/#5；但 `V2-normal-claim` 把原有 #4 检查的 V1 判为 No，验证维掉到 0，分档为 `1/2/1/0`，不符登记的 `1/2/1/1`。这次失败是 V1，不是 V2 误认原 #5。

| 运行 | 实际请求 / 上限 | 预留输出 token / 上限 | 提供方实报总 token（推理） |
| --- | ---: | ---: | ---: |
| Haiku 代理补跑 | 76/324 | 155,648/663,552 | 392,352（54,173） |
| Gemini 代理补跑 | 109/324 | 446,464/1,327,104 | 252,910（1,120） |
| Gemini 冻结复测 | 307/314 | 1,257,472/1,286,144 | 631,418（1,953） |
| 本次新增合计 | 492/962 | 1,859,584/3,276,800 | 1,276,680（57,246） |
| 原 Qwen，仅供比较 | 85/324 | 696,320/2,654,208 | 193,623（0） |

三份新增批次均无用量缺报。补跑两侧及冻结复测预检均零请求。实现提交 `d2f7cce`、`d93b5d4`；真实启动分别使用同 HEAD 的 [278 项](../runs/_receipts/check-d2f7cce4576aa4f6289a252daa757754a9e00491.json) 与 [292 项](../runs/_receipts/check-d93b5d43cf38f58e8ec2fef7f16052be7cc67821.json)干净检查收据。Gemini 保留为胜出候选；不写冻结记录，不改判线，不补试。等待用户决定下一步。

### 原直连批次（20261121）

**原批未选出候选。** 实现提交 `1a73c45e6db859268472b32887cc5555844e1505`。尺子、输出契约和评测身份分别为 `e1-binary-v3`、`judge-output-v5`、`evaluation-identity-v5`。每格按误解修复、支持递增与淡出、交还主动权、保留试错、表征转换、验证或迁移发六个单维请求；计分继续按二元尺子 v2 已锁题义由代码重算。

三侧使用同一份预登记，SHA256 `46395637d0dfc7e4a382117f6818f4dc7ecec9848a4c312a0d533f5e021d8114`。计划 18 格，来自 8 份不同公开对话；五个冻结 S1 对话各重复 3 遍，另有 3 份超时输入各一格。每格 6 维。预登记的 (c)–(e) 与 ①d 原文一致；(a) 按 ①h 更新为每格六维均有一份在 120 秒内返回完整合规正文的请求，可为重试；首次合规率单报，并只参与选优平手比较。三批各用一个进程、并发 4。单维最多 3 次。连续 3 次供应商或传输失败停线，连续 3 个失败格停线；18 格累计失败 4 格停线。所有运行均使用固定端点，无 fallback、无中途切换。

| 候选 | 锁定模型与端点 | 推理与单维上限 | 首次结构合规 | 重试后结构合规 | 完整格；S1 | 调用与停线 |
| --- | --- | --- | ---: | ---: | --- | --- |
| Haiku | `anthropic/claude-haiku-5.5` / `anthropic`，`e1-call-policy-v8-bakeoff-haiku` | effort low；温度省略；输出 2,048；实报推理 ≤1,536 | 0/108 | 0/108 | 0/18；0/15 | 6/324 次（2 次重试），12,288/663,552 输出 token 额度；6 次 HTTP 403，三次连续供应商失败停线 |
| Gemini | `google/gemini-3.8-flash` / `google-ai-studio`，`e1-call-policy-v9-bakeoff-gemini` | effort low；温度 0；输出 4,096；实报推理 ≤3,072 | 0/108 | 0/108 | 0/18；0/15 | 6/324 次（2 次重试），24,576/1,327,104 输出 token 额度；6 次 HTTP 403，三次连续供应商失败停线 |
| Qwen | `qwen/qwen3-235b-a22b-2507` / `parasail/fp8`，`e1-call-policy-v10-bakeoff-qwen` | reasoning 省略；温度 0；输出 8,192；实报推理 0 | 63/108 | 66/108 | 7/18；7/15 | 85/324 次（14 次重试），696,320/2,654,208 输出 token 额度；实报 193,623 tokens，其中推理 0；四格停线后结算在途格 |

| 采用线 | Haiku | Gemini | Qwen |
| --- | --- | --- | --- |
| (a) 符合要求的格 /18 | 未测，0/18 完成 | 未测，0/18 完成 | 未达，7/18 |
| (b) S1 完整格 /15 | 未测，0/15 完成 | 未测，0/15 完成 | 未达，7/15 |
| (c) 坏教师分率方向 /3 | 未测，0/3 有配对 | 未测，0/3 有配对 | 未达，0/3 |
| (d) 四个目标维命中数 /3 各 | 未测，0/3 有配对 | 未测，0/3 有配对 | 未达，0/3 各 |
| (e) 确定项 FP+FN /2 | 0/2，但 0 项观测、99 项缺判* | 0/2，但 0 项观测、99 项缺判* | 未达，11/2 |

`*` Haiku/Gemini 的 (e) 为 0 个错误、0 个真值观测；99 个确定位全缺。两候选在原直连批次因 403 未测到。原 bakeoff 未保存错误正文；后续 A→D 的 8 个直连小探针均在 OpenRouter `Gate Endpoints with Geo Restrictions` 步骤被拒。[403 诊断与逐次原件](../.tmp/scratch/judge-bakeoff/403-diagnosis.md)

Qwen 的最终采用线为：(a) 7/18，(b) 7/15，(c) 0/3 遍，(d) 四个目标各 0/3，(e) 11 个确定项错误（10 FP、1 FN，上限 2）。构造矩阵缺 39/99 位。跨维 S3/P1 冲突 0 次；规范化 11 次。5 格因单维 3 次尝试后仍有本地 `order` 错误而记 `judge_partial_failure`，其中表征转换 3 格、保留试错 2 格；没有跨维部分失败。另有 2 格在停线时只完成部分维度，未发布整格判决；4 格未启动，逐格逐维列在候选报告中。

| 候选 | (c) 三遍坏教师严格低于 normal | (d) answer_dump / lecture / sycophant_close / no_teach | (e) FP + FN / 缺判 |
| --- | --- | --- | --- |
| Haiku | 0/3 | 0/3、0/3、0/3、0/3 | 0/2；0 个真值观测，99 个缺判 |
| Gemini | 0/3 | 0/3、0/3、0/3、0/3 | 0/2；0 个真值观测，99 个缺判 |
| Qwen | 0/3 | 0/3、0/3、0/3、0/3 | 11/2；39/99 缺判 |

Qwen 与 ①g 整包版有 7 个共同完整格；维度相同数为 `misconception_repair` 5/7、`support_escalation_and_fading` 7/7、`agency_handoff` 5/7、`productive_struggle` 7/7、`representation_pivot` 4/7、`verification_or_transfer` 7/7。尺子表示、超时、重试与停线同时变化，这只能部分区分拆维效应。Haiku/Gemini 完整格为 0，候选间逐题一致率均为 0/0。Qwen 单维成功请求耗时中位数/p90 为 2,940/4,950 ms；另外 19 次有序或窗口拒收请求计入失败与拒收统计，H/G 无成功时间分母。首次合规、重试后合规、三遍一致率、候选间一致率、规范化数及逐题矩阵详见[三候选报告](../runs/round2-bakeoff-report/bakeoff-report.md)和[机器结果](../runs/round2-bakeoff-report/bakeoff.json)。

三次运行均由单进程启动，PID `44952`、`32252`、`42976` 均已结束。业务退出码均为 1；三份 `--verify-run` 均以 0 退出，`verified:true`、`missing:[]`、`invalid:[]`，启动、进程、请求日志及预算相符。未分配额度未使用。总计 97/972 次请求，预留输出 token 额度 733,184/4,644,864。只有 Qwen 有提供方 token 实报；H/G 的用量缺报，账单合计未知。单独检查收据见 `runs/round2-bakeoff-report/`。

干净提交 `1a73c45` 上的 `npm run check` 通过 241/241 项及 51 个导入边界；收据为 [check-1a73c45](../runs/_receipts/check-1a73c45e6db859268472b32887cc5555844e1505.json)。5 个二元 v2 历史 run 的 `--verify-run` 仍通过；v1 历史 `s1-binary-round2-01` 的旧版独立检查在此 HEAD 有既有版本号不匹配，未被改写。

原直连批次未启动冻结复测。后续独立预登记的代理补跑与胜出者复测见本节上方。过程与预算见本机[进度记录](../.tmp/scratch/judge-bakeoff/progress.md)。

<a name="round2-judge-contrast"></a>

## 第二轮 ①g 两种裁判策略均未达采用线（20261121）

**Qwen 和限额 HY4 均不采用。** `e1-binary-v2` 的最终裁判尚未选定。两个批次复用 ①d 的 18 格及 (b)–(e)。两侧的 (a) 均要求计划首尝试在 180 秒内出现非空白正文且无推理 delta。实报推理 token 单列。小样覆盖 S1 五个极端条件和三个历史超时输入，冻结前还须完成正式复测。

| 候选 | OpenRouter 固定端点 | 调用策略 | 单次输出上限 |
| --- | --- | --- | ---: |
| Qwen3 235B Instruct 2507，省略推理参数 | `qwen/qwen3-235b-a22b-2507` / `parasail/fp8` | `e1-call-policy-v6-qwen-parasail` | 8,192 |
| HY4 Flash，开推理，请求推理上限 16,384 | `tencent/hy4-flash` / `tencent/fp8` | `e1-call-policy-v7-hy4-capped` | 32,768 |

两侧均使用 `json_schema.strict:true`、`provider.require_parameters:true` 和 `provider.allow_fallbacks:false`。常规入口默认策略为 `e1-call-policy-v4`。

| 固定采用线 | Qwen | 限额 HY4 |
| --- | --- | --- |
| (a) 18/18 首尝试 180 秒内见正文且无推理 delta | 13/18，未达 | 0/18，未达 |
| (b) S1 至少 14/15 格有合规判决 | 11/15，未达 | 6/15，未达 |
| (c) 3/3 遍四个坏教师的适用分率均严格低于同遍 `normal` | 1/3，未达 | 0/3，未达 |
| (d) 试错、主动权、验证或迁移、误解修复各至少 2/3 遍严格低于同遍 `normal` | 1/3、2/3、2/3、2/3，未达 | 0/3、2/3、1/3、1/3，未达 |
| (e) 确定项假阳加假阴不超过 2，缺判另列 | 10 假阳 + 0 假阴，缺 35/99，未达 | 0 假阳 + 0 假阴，缺 68/99，计数达线。仅观察到 31 个确定项，均为预期 No |

Qwen 的 15 次请求均有正文且实报推理为 0。`r1:answer_dump:judge:4:1:1`、`r1:answer_dump:judge:4:1:3`、`r3:answer_dump:judge:4:1:1` 的 P3 同样违反时序，`prior=#2`、`pending=#1`、`rescue=#2`。`r1:answer_dump:judge:4:1:2` 的 R2 为 No，却引用 `newFrame=#4`。同类重试耗尽后停线。通过本地校验的判决仍有 10 个假阳，分布在 S1（4）、S3（2）、P2（4）。[逐题、引用差异及拒收原件](../runs/round2-qwen-judge-01/qwen-judge-report.md)

HY4 的 11 次请求均出现推理 delta，7 次实报推理超过 16,384。5 次返回 `length` 且无正文，推理和总输出均为 32,768 token，耗时 121.997 至 135.254 秒。`r1:answer_dump:judge:4:1:2` 再次耗尽，触发全批两次同类重试停线。[逐题、引用差异及耗尽原件](../runs/round2-hy4-capped-01/hy4-capped-report.md)

| Run | PID | 已发首尝试耗时 p50 / p90 | 请求 / 上限 | 出站输出额度 / 上限 | 实报合计，其中推理 |
| --- | ---: | --- | ---: | ---: | ---: |
| `round2-qwen-judge-01` | 40744 | 18.708 / 25.896 秒，13 条 | 15/26 | 122,880/212,992 | 67,770，0 |
| `round2-hy4-capped-01` | 21172 | 129.250 / 153.843 秒，9 条 | 11/26 | 360,448/851,968 | 280,850，239,530 |

两批均按并发 4 从单个进程启动，业务退出 1，`--verify-run` 退出 0，启动、进程、manifest 和遥测 PID 一致。两批 token 用量无缺报。两组耗时含失败首尝试，各有 5 格和 9 格未发。

汇总 `v1Agreement` 的逐题计数，Qwen 与开推理 v1 的 15 道未改题一致 135/165 位，HY4 一致 83/90 位。Qwen 三遍题级一致 35/38 位，HY4 没有三遍都合规的格，一致率无分母。[Qwen 逐题计数](../runs/round2-qwen-judge-01/qwen-judge-summary.json) · [HY4 逐题计数](../runs/round2-hy4-capped-01/hy4-capped-summary.json)

- Qwen 预登记 SHA256 `ab178183a97c64cf1f563bce5681bda8ada894e305270c1fadf89a4aecae5745`。身份 `fc1e1c9482aa67bf825cdf1d17a37f7cfbeb8e2542541dbcf3ea966ab2d7a484`。干净 `d9f946f` 标准检查 157/157。[预登记](../runs/round2-qwen-judge-01/preregistration.md) · [验真](../runs/round2-qwen-judge-01/verify-run.json) · [PID](../runs/round2-qwen-judge-01/pid-check.json) · [检查收据](../runs/_receipts/check-d9f946f3085e56d0b65facea7b6ebead0935e16e.json)
- HY4 预登记 SHA256 `e70072dd771a4275bfbecd3b913068622ac77e924c6ed92ea4a453d91d03ea3e`。身份 `b7ea5cb7f06d424ca2c1fe1cf2194fa4ffc10277ec081439ae7a130ccc1fa4b6`。干净 `14a0d91` 标准检查 158/158。[预登记](../runs/round2-hy4-capped-01/preregistration.md) · [验真](../runs/round2-hy4-capped-01/verify-run.json) · [PID](../runs/round2-hy4-capped-01/pid-check.json) · [检查收据](../runs/_receipts/check-14a0d910323179d493c467ed93848288a16db780.json)

**停在候选选择。** 本机调研 `%TEMP%\teacharena\round2\judge-model\survey.md` 列出的未实测候选包括 Qwen3-Next 80B Instruct（DeepInfra FP8）、Mistral Small 4（Mistral ZDR）、Gemini 2.5 Flash-Lite（AI Studio）。[Qwen3-Next 端点](https://openrouter.ai/api/v1/models/qwen/qwen3-next-80b-a3b-instruct/endpoints) · [Mistral 端点](https://openrouter.ai/api/v1/models/mistralai/mistral-small-2603/endpoints) · [Gemini 端点](https://openrouter.ai/api/v1/models/google/gemini-2.5-flash-lite/endpoints)

裁判选定后，用最终身份重跑 S1 与 V1/V2/A1/A2 的定向扰动，另复核 `normal` 的 V2 #4/#5 疑点。两项均通过后冻结。

## 阶段 4a：离线 HTML 回读报告

已合入 `main`。使用 `--export-report <run-id> [--out <path>]` 导出。[导出与排障步骤](runbook.md#导出离线-html-回读报告)。报告展示落盘的判线、验真和分数，点选判定或证据序号可打开本格原对话。二元尺子与六维 v3 分开显示，不跨版比较。

用已有的 `s1-binary-round2-01` 和 `e2-real-20261119-06` 导出并通过 DOM 点击测试。前者回读二元 v1 的 15 格，后者回读 v3 的五格；后者保存的四处理由引用未列入该维 `evidence`，报告保留红字，仍可定位经绑定核对的消息。复核修正了无效绑定的答案混入其他格、输出覆盖缺失原件路径、缺窗口摘要或跨格绑定时仍能点击引用、串用其他 run 验真收据，以及二元 v1 显示 v2 问题文案的问题。完整且有序的消息 ID、run 结果身份和 Windows 输出路径也纳入报告边界校验。此步骤未发起评测，也未改动评分。

非阻塞后续：E1/E2 对照分数与绑定判决不一致时，报告保留红字，但点击对照分数仍可能定位到判决引用；应改为只打开观察窗口。

<a name="round2-runner-merge"></a>

## 第二轮 ①f runner 本地合并（20261121）

`1519bc7` 在 `main` 合入 `f8fd2db`。`src/cli.mjs` 的续跑和格级并发使用默认 `e1-call-policy-v4`。①d 的关推理对照由 `scripts/reasoning-off.mjs` 串行执行。关推理与并发预留的组合在共享批执行层用离线传输夹具验证，出站和回放都核对批身份中的策略。

| 离线场景 | `--verify-run` 已核对 |
| --- | --- |
| 强杀后同 ID 续跑 | 首进程保留 1 个合规判决，第二进程补 14 格，共预留 16 次。首格原件 SHA256 相同。 |
| 并发 3 的次数和 token 上限 | 两个独立场景均拦住第 3 次预留，各结算 2 次，预留 131,072 输出 token。关推理组合也通过。 |
| 模拟 429 | 并发从 3 降至 2，保留两次普通重试。 |

干净 `da507ce` 上的标准 `npm run check` 通过 149/149 项及 38 个导入边界。[正式检查收据](../runs/_receipts/check-da507ce04f2c6996bbde958f8b478447f906b15e.json)。合并提交首次全量为 147/149，两条 A/B 测试因话术侧运行根尚未创建而失败。`da507ce` 恢复先启动收据、再准备 `ruler-expand` 的 `test` 和 `ab` 计划，目录独立性校验不变。两条定向测试从 0/2 转为 2/2，相邻回归 26/26。

组合测试从 0/1 转为 1/1，①d 仓库用例 15/15、离线入口 1/1，①e 原 12 条均通过。测试未发出真实模型请求。原件和操作记录见本机 `.tmp/scratch/merge-runner/progress.md`。

修复后的 S1 参考 `identityId` 为 `af1eb1f03c913b21551a9b54542e14a98d59d5dee828f32ecb4c409395b8bf69`。计算采用最终 runner 源码、`S1-binary` 真实模式、`e1-binary-v2`、默认 v4、冻结源 `e2-real-20261119-06`、45 次与 2,949,120 输出 token 上限，以及历史预登记摘要 `2ed20c5803aaa3d4c01773cbe2f8531083b22693ab05cad5522685aa1c15cf13`。S1 和定向复测须在最终 runner 上按各自重新登记的身份重跑，结果通过后才可冻结尺子。

DeepSeek V4.1 Flash 独立审查合并及回归修复，无阻塞项。关推理与并发的证据覆盖两项预留上限及遥测回放。①d 历史预登记和原件用记录提交的源码复核。

<a name="round2-reasoning-off"></a>

## 第二轮 ①d HY4 关推理小对照（20261121）

**三次请求实报推理为零，首格三次判决均被拒，不采用关推理。** `da95e66` 增加显式选用的 `e1-call-policy-v5-reasoning-off`，按 [OpenRouter 文档](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)发送 `reasoning.enabled:false`。`e1-binary-v2` 的题面与提示不变。`round2-reasoning-off-01` 只启动 `r1/normal`。三次均在 2.170–2.414 秒见正文，无推理 delta。三份判决都用 #1 作 M0 锚、#3 作 M2 锚，M2 的修复证据为 #5。违反同锚约束，两次同类重试后停线，0/18 格有合规判决，余 17 格未发。唯一同格首尝试耗时为关推理 4.210 秒、历史开推理 v1 91.800 秒，只有旧判决合规，不能推断批量提速。[报告及调用原件](../runs/round2-reasoning-off-01/reasoning-off-report.md)

| 采用线 | 实测 |
| --- | --- |
| (a) 首尝试 180 秒内见正文且实报推理为 0 | 1/18，未达。另两次是同格重试。 |
| (b) S1 合规判决 | 0/15，未达。 |
| (c) 四个坏教师适用分率均低于同遍 `normal` | 0/3 遍，未达。 |
| (d) 四个目标维各至少命中 2/3 遍 | 各 0/3，未达。 |
| (e) 确定项假阳加假阴不超过 2 | 0 个观察到的错误，99 个确定项全缺。预期 R0 N/A 的六项全缺，不能计算判对率。 |

用户文档由 `19e47bb` 原样提交，真实运行用该干净 HEAD 的 [136 项检查收据](../runs/_receipts/check-19e47bb22f7e48789e3560dc91893f880cdae55d.json)。预登记绑定源码而不是 HEAD，SHA256 `f2e1de0db60bff27331d888607a6295cba297a4aa046305f1da8793bf782a46f` 不变，真实身份 `cd892f897e2f6be085cc76d24fbe6e11f00a2d781a293f8aa1616b30d49b4a8b` 与预检一致。运行退出 1；专用 `--verify-run` 退出 0，启动、进程、manifest 与三条遥测 PID `45888` 一致。请求 3/26 次，出站额度 196,608/1,703,936 token，实报 8,883 token，无缺报。[预登记](../runs/round2-reasoning-off-01/preregistration.md) · [逐原件验真](../runs/round2-reasoning-off-01/verify-run.json)

默认 v4 不变。备选 Qwen3 235B Instruct / Parasail，本次不切换。此小对照只决定是否采用关推理，不用于冻结尺子。评测身份包含编排、收据与裁判源码哈希；续跑和并发合入后，S1 与定向复测需用最终身份重跑。

<a name="round2-runner-resume-concurrency"></a>

## 第二轮 ①e 断点续跑与格级并发（20261121）

**E1、E2、S1 的离线原件通过复核。** `--resume` 验证原身份、预登记、HEAD、源码和历史原件后才补格。`--concurrency` 默认 1，最多 5。同一 run 所有进程共用次数和请求输出额度，尚无结算的预留也占预算。`ruler-expand` 保留原串行入口及门槛。[操作](runbook.md#格级并发和断点续跑) · [收据契约](../contracts/artifacts/README.md#运行收据)

强杀演示中，进程 1 的一个合规低分判决原样保留；进程 2 补 14 格，累计扣 16 次。并发 3 的独立次数、token 上限演示分别在第 3 次预留前停线，两条已开始的调用照常结算。模拟 429 使并发从 3 降为 2，且仍有两次普通重试。三场都是 faux，未作真实评测。测试和原件见本机 `.tmp/scratch/runner-concurrency/`；分支检查未跑受保护题集，不作为真实模式检查收据。

**合入会改变评测身份。** `evaluationIdentity()` 已把 `src/run.mjs`、`src/run-receipts.mjs` 等 runner 源码哈希写入 `identity.sources`；S1 还绑定专用入口和复核源码。合入后，S1 和定向复测须用最终身份各自重跑，再冻结尺子。既有 ①b、①c 的历史结论和原件不回填，也不能换身份沿用 run ID。

<a name="round2-perturbation-v2"></a>

## 第二轮 ①c 学生证据与定向复测（20261121）

**启用候选 `e1-binary-v2`，不冻结。** `def7192` 更新 V1/V2/A1/A2 的证据标准和反例，其余 15 题不变。独立解释要在学生消息中说出正确依据。原题设式有实质推理可计 A1；V1/V2 的新例须另有改条件的题。A2 要求学生自己提出方法并说明理由或后果。V1、V2 同为 Yes 时，代码要求学生引用晚于 V1。输出契约与评测身份分别为 `judge-output-v4`、`evaluation-identity-v4`，不与 v1 混算分档。[契约](../contracts/judge/binary.md)

**正式 180 秒复测按停线结束，5/36 格有判决。** `round2-perturbation-v2-01` 在 `b-quiet` 首次判决被本地拒绝（M2 锚不匹配），随后两次无正文、命中本地截止。用完调用级两次重试即停止，未耗尽全批预算。V2 主矩阵有三个两版均判的样本：召回均 1/1，特异度 v1 0/2、v2 2/2，尚缺两个正例；V1、A1、A2 的目标题都没有 v2 判决。`normal` 四格 3/4 符合预期：补垂距依据判 Yes，纯猜和追加教师宣称均判 No，原文仍误报 V2=Yes（#4/#5）。唯一完成的话术对有 1/4 位翻转，0/5 复跑配对，不能区分话术影响与裁判波动。[复测报告](../runs/round2-perturbation-v2-01/perturbation-v2-report.md) · [预登记](../runs/round2-perturbation-v2-01/preregistration.md) · [逐原件复核](../runs/round2-perturbation-v2-01/verify-run.json)

**360 秒诊断看到推理耗尽，未救回判决。** `4c41f0a` 记录出站、首字节、推理、首正文及结束。`round2-timeout-v2-01` 的九次观察中，五次不到 89 秒合规完成；四次在 242–254 秒返回 `length`，实报 65,536 输出 token 全为推理，无正文。四次都收到早期推理且超过出站 16,384 推理上限；无一次触发 360 秒本地截止。这支持把「迟迟不给正文」列为 ①b 超时的可能机制，不能反推旧尝试的最终用量。正式期限保持 180 秒。不建议仅放宽期限；如需后续试验，先验证路由能否执行独立推理上限，等用户决定后另登记身份。[诊断报告](../.tmp/scratch/timeout-exp/report.md) · [逐原件复核](../runs/round2-timeout-v2-01/verify-run.json)

干净 `4c41f0a` 的 `npm run check` 通过 125 项。[检查收据](../runs/_receipts/check-4c41f0ad000ef6ad95340dd7aaa68b802e8bb4c1.json)。两次真实运行均退出 1，`acceptance=false`；项目及逐原件 `--verify-run` 均通过。启动、进程、manifest 与遥测的 PID 分别核对一致。

| run | PID | 实际请求 / 上限 | 请求输出 token / 上限 | 供应商实报合计 / 缺报次数 |
| --- | ---: | ---: | ---: | ---: |
| `round2-timeout-v2-01` | 40388 | 9/9 | 589,824/589,824 | 360,888 / 0 |
| `round2-perturbation-v2-01` | 13560 | 8/44 | 524,288/2,883,584 | 101,506 / 2 |

<a name="round2-s1"></a>

## 第二轮 ① 二元尺子与 S1（20261121）

**候选尺子通过固定五格的机器判线，尚未冻结。** `b0fc4d3` 实现 `e1-binary-v1 / judge-output-v3 / evaluation-identity-v3`。尺子用 19 道是非题和公开对话引用，由代码定档。无机会的维度记 N/A，不进入满分；同题配对只用共同适用维。v3 分数不与新版相减。[题目和评分表](../contracts/judge/binary.md)

干净 `b0fc4d3` 的 `npm run check` 通过 115 项。预检发出 0 请求。`s1-binary-round2-01` 只复判 `e2-real-20261119-06` 的五份原对话，各三遍。正式运行和 `--verify-run` 均退出 0，15/15 格有合规判决；启动、进程、manifest 和 17 条遥测同为 PID `36952`。预登记 SHA256 为 `2ed20c5803aaa3d4c01773cbe2f8531083b22693ab05cad5522685aa1c15cf13`。[预登记](../runs/s1-binary-round2-01/preregistration.md) · [报告与逐题引用](../runs/s1-binary-round2-01/s1-binary-report.md) · [复核](../runs/s1-binary-round2-01/verify-run.json)

| 检查 | 结果 |
| --- | --- |
| (a) 适用分率 | 3/3 遍四个坏教师均低于本遍 `normal`。 |
| (b) 目标维 | `answer_dump` 试错、`lecture` 主动权、`sycophant_close` 验证或迁移、`no_teach` 误解修复，各 3/3 低于本遍 `normal`。 |
| (c) 三遍分档全同 | 误解修复、表征转换各 4/5；其余四维各 5/5。表征转换的 4/5 包含两格三遍均为 N/A，只看三遍均适用的格为 2/3。 |
| 构造真值 | 预期 Yes 判对 6/6、预期 No 判对 93/93。R0 的 N/A 判对 6/6，其余门控无构造真值。构造样本极端且重复，不检验细微差别。 |

执行者 AI 回读确认 `lecture` #9 复述教师 #8 已解的公式。`normal` 的 V2 三遍引同一条 #5，学生选 x 但仍说不清原因。可确认教师发起检查，不能独立确认满档。表征转换 `normal` 的 2/0/2 波动和 `answer_dump` 的 M3 翻位均保留。机器方向不代替学生行为的独立复核。本阶段没有训练一致性、留出泛化或冻结结论。

实际请求 17/45 次，仅裁判，含 2 次恢复性重试；累计请求输出额度 1,114,112/2,949,120 token。供应商实报 246,695 token，1 次缺报。三次 `normal` 实报推理超过出站参数 16,384。[请求日志](../runs/_receipts/s1-binary-round2-01.requests.jsonl) · [进程收据](../runs/_receipts/s1-binary-round2-01.process.json)

<a name="round2-perturbation"></a>

## 第二轮 ①b 最小扰动诊断（20261121）

**真实运行提前停止，19 题均为「证据不足」。** `round2-perturbation-01` 同批重判 13/13 份原对话。78 个预登记扰动中成对完成 36 个，分为 Yes→No 10/10、No→Yes 15/19、教师话术 8/41、其他边界 3/8。预选第二遍 0/10。P0 缺少保持对话连贯的单点负例。评级沿用预登记判线，尺子保持候选状态。

`R1-student-score-cards` 的请求命中本地 180 秒截止，遥测归为 `provider_failure`。此前同类超时已重试两次。正式进程退出 1，`acceptance=false`。项目 `--verify-run` 和逐判决回放均通过，`missing: []` 记录的是原件校验结果。启动、进程、manifest 和尝试遥测同为 PID `36112`。实际请求 54/109 次，出站请求输出额度 3,538,944/7,143,424 token。供应商实报 820,144 token，有 3 次缺报，13 次实报推理超过出站参数。预登记 SHA256 `06ede0df7584381112813187b44b841f6b1d7e0f66f8c01ad2607e309eb3565e`。[预登记](../runs/round2-perturbation-01/preregistration.md) · [矩阵和原字回读](../runs/round2-perturbation-01/perturbation-report.md) · [复核](../runs/round2-perturbation-01/verify-run.json) · [进程收据](../runs/_receipts/round2-perturbation-01.process.json)

**`normal` 的原文基线复现 S1 的满档，按预登记是 V2 误报。** #5 猜 x，教师 #6 补出垂距依据。补足 #5 独立理由的格与原文都判 2。弱化 #5、追加教师宣称的两格也判 2，V1/V2 改引 #6/#7 的原题设式。话术对照中已见学生相关题翻位 4/71（3/8 个对照），总分或适用满分变化 3/8。缺少第二遍，话术与裁判波动的影响待区分。

①b 当时建议优先审议 V2，并核对 V1 是否把原题流程当检查，再复核 A1 对猜测的引用、A2 对指定操作后追问的引用。三题主矩阵的特异度分别为 V2 0/2、A1 0/1、A2 0/1，都不是正式「需改」结论。用户裁定和执行结果见 [①c](#round2-perturbation-v2)。①b 的证据不用于 harness A/B 判优或留出验收。

## 首轮收尾（20261120）

**这次 harness 改动没有被证明更好，预登记的判线挡住了一个仅看部分行为指标就可能被误判为「更好」的改动。** 首轮到此结束，不再改 harness 或尺子。

| 步骤 | 问题 | 结论 | 关键数字 | 提交 |
| --- | --- | --- | --- | --- |
| 第 1 步：区分坏教师 | 固定场景能否区分坏教师？ | 用户已签收，未完成预登记的三次完整稳定性重复。 | v3 完整运行 `e2-real-20261119-06` 的五格中，四种坏教师在各自目标维低于 `normal`。[S1 签收与证据](#s1-场景卡逐栏) | `0302396` |
| 第 2 步：训练一致性 | 尺子与锁定标签的一致性能否过线？ | 未过线。复评报告记的是当时冻结 v4，后续择版冻结 v3。 | 两个目标维的精确同档数：v3 为 19/30，v4 为 17/30。[复评报告](../runs/ruler-train-rescore-v4-20261120-01/calibration-report.md) · [择版记录](#目标维度对比) | `e34d8c7` |
| 第 3 步：未见题验证 | 冻结尺子在未见题上还能区分坏教师吗？ | 未过线。 | 同题总分方向 25/25 符合预期。`lecture` 的 `agency_handoff` 数值命中 3/6，AI 回读后命中 0/6，均以计划对数为分母。[测试报告](../runs/ruler-test-v3-real-01/test-report.md) · [未见题记录](#未见题验证结果) | `720a875` |
| 第 4 步：harness A/B | 候选变体的分数和教学行为是否优于基线？ | 不采用这次改动，`normal` 维持原基线。 | 改进减基线的配对均值：`agency_handoff` 0.00、`representation_pivot` −0.50、总分 −0.70。预登记行为命中从 4/5 到 5/5，只多 1 题，要求至少多 2 题。[A/B 报告](../runs/harness-ab-v1/ab-report.md) · [行为回读](../runs/harness-ab-v1/behavior-audit.md) | `32ed5be` |

### 已知局限

- 训练标签由 AI 预标，用户逐格复核，改动 0/90。不是独立人工校准。[训练复评报告](../runs/ruler-train-rescore-v4-20261120-01/calibration-report.md)
- `verification_or_transfer` 的线性加权 κ 两版都低于 0.60：v3 为 0.478，v4 为 0.444。[训练择版对比](#目标维度对比)
- `agency_handoff` 在本轮未见题中对 `lecture` 的教师主导不够敏感，回读后未确认目标维方向命中。[测试报告](../runs/ruler-test-v3-real-01/test-report.md)
- 测试集只跑一次，A/B 只有 10 题且各侧只跑一次，不能据此判断跨次稳定性。[测试报告](../runs/ruler-test-v3-real-01/test-report.md) · [A/B 报告](../runs/harness-ab-v1/ab-report.md)
- 未见题和 A/B 的行为证据来自执行者 AI 回读，未做独立人工复核。[测试报告](../runs/ruler-test-v3-real-01/test-report.md) · [行为回读](../runs/harness-ab-v1/behavior-audit.md)
- 第 4 步抽到的 10 题上，`representation_pivot` 基线均值已经是满分 2.00，按原判线无法取得正分差。由此推断本批选题不适合检验该维改善，不是该维普遍封顶的证据。[A/B 报告](../runs/harness-ab-v1/ab-report.md)
- 裁判路由没有可靠执行 `reasoning.max_tokens` 上限，复评与未见题验证均有实报超限。[复评报告](../runs/ruler-train-rescore-v4-20261120-01/calibration-report.md#证据与用量) · [测试报告](../runs/ruler-test-v3-real-01/test-report.md#请求和故障)

### 若重启再考虑

- 换一个基线未封顶且尺子可靠的维度重做 A/B。沿用本轮题量和三侧设计时，参考三侧合计 195 次请求、实报 843,155 token，另需筛题和回读。[A/B 用量](../runs/harness-ab-v1/ab-report.md#运行收据与用量)
- 补强 `agency_handoff` 对教师主导的识别。以[既有单维修订估算](#补尺子训练初评和复评)为参照，修订、测试和审查约 0.5 至 1 人时，另需训练复评和未见题核对，后者成本未估。
- 做真正独立的人工标注。按[原盲标方案估算](#补尺子训练初评和复评)，盲标 15 条、隔天重标 4 条约 3 至 3.5 人时，仅标现有对话不需模型请求。

### 首轮用量

下表只合计第 2 步复评、第 3 步和第 4 步，不含第 1 步或训练生成、初评。供应商实报 token 不含缺报请求的未知用量，不是请求额度。

| 步骤 | 请求次数（含重试） | 供应商实报 token | 用量缺报次数 | 出处 |
| --- | ---: | ---: | ---: | --- |
| 第 2 步复评 | 18 | 258,895 | 2 | [训练复评报告](../runs/ruler-train-rescore-v4-20261120-01/calibration-report.md#证据与用量) |
| 第 3 步 | 459 | 1,709,139 | 8 | [测试报告](../runs/ruler-test-v3-real-01/test-report.md#请求和故障) |
| 第 4 步 | 195 | 843,155 | 1 | [A/B 报告](../runs/harness-ab-v1/ab-report.md#运行收据与用量) |
| **合计** | **672** | **2,811,189** | **11** | 上述三项相加 |

## 补尺子：训练初评和复评

**v3 训练初评未通过。** 标签由 `gpt-6.2-sol` 预标后交用户逐格复核，改动率 0/90。锁定 CSV 的 SHA256 为 `3498764b4c9844ff8dae9ee9ba8033affacdf0500239f67e63b7644b13f4e841`。结论是经用户认可的跨模型一致性，不是人工独立校准；用户在 `20261119` 改为预标加复核，没有按原方案单人盲标和隔天重标 4 条。`plan.md:92` 的通过线不变。`support_escalation_and_fading` 缺标签 2 档，`productive_struggle` 缺标签 1 档，`verification_or_transfer` 为 κ 0.478、7/15 同档，`misconception_repair` 的一个同档证据未确认。见本机[初评报告](../runs/ruler-train-score-v1/calibration-report.md)、[标签锁定收据](../runs/ruler-train-score-v1/label-lock.json)、[计算结果](../runs/ruler-train-score-v1/calibration-results.json)及[复算脚本](../scripts/ruler-calibration.mjs)。

按用户新增的处置规则，只选一次最小修订。冻结是本轮用户决定，通过线仍以原预登记为准。复评只用原 15 条训练对话，不动测试集。

| 方案 | 预计成本 | 处置 |
| --- | --- | --- |
| 给「验证或迁移」补 0/1 档例子，区分展示、确认与让学生解释 | 约 0.5–1 人时修订、测试与审查；一次 15 条裁判复评 | **选定。** 该维占 8/19 个分歧。v4 不改分档定义，不重标。 |
| 给训练题补逐题检查项，再复评 | 约 1–2 人时整理和复核；若用于裁判，须另登记输入变化和复评额度 | 不实施。 |
| 请未见预标与分数的人独立盲标 15 条并隔天重标 4 条 | 约 3–3.5 人时，依据原标注说明；只对现有原件做标注时无模型请求 | 不实施。 |

**v4 训练复评未通过。** 15/15 条有有效总分；`--verify-run` 退出 0，运行收据的 `acceptance: true` 只表示拿齐分数。按 `plan.md:92`，仅 `representation_pivot` 通过。`agency_handoff` 同档 10/15（66.7%），`verification_or_transfer` 仍为 7/15（46.7%）、κ 0.444。其余未达线项仍有缺档或同档证据未确认。存疑格 18/39、非存疑格 49/51 同档。见本机[复评报告](../runs/ruler-train-rescore-v4-20261120-01/calibration-report.md)、[计算结果](../runs/ruler-train-rescore-v4-20261120-01/calibration-results.json)。不做第二轮修订或复评。

唯一复评 run `ruler-train-rescore-v4-20261120-01` 已按授权用 `ruler-expand / train / judge-only` 完成，原 `ruler-train-gen-v1` 对话逐字节不变。所有遥测均为裁判进程 `17084`。请求 18/45 次（3 次重试），请求输出额度 1,179,648/2,949,120 token；供应商已报 258,895 token，2 次因超时缺报。一次实报推理 16,819 高于该次请求的 16,384 推理上限。[请求日志](../runs/_receipts/ruler-train-rescore-v4-20261120-01.requests.jsonl) · [进程收据](../runs/_receipts/ruler-train-rescore-v4-20261120-01.process.json) · [评测收据](../runs/_receipts/ruler-train-rescore-v4-20261120-01.json)。

### 目标维度对比

本次择版先固定规则。只比较 `agency_handoff` 与 `verification_or_transfer`，先比两维与锁定标签的精确同档格数之和，多者胜。相同时比两维线性加权 κ 的均值，高者胜。再相同保留 v4，避免回退代码。总分、六维合并结果不参与选择；训练一致性仍按 `plan.md:92` 判定。

复用 `ruler-train-score-v1` 的 v3 初评和 `ruler-train-rescore-v4-20261120-01` 的 v4 复评。两版使用同一份锁定标签、匿名映射和 15 条冻结训练对话。逐维有效配对均为 15/15。κ 的 95% CI 按题族整簇重抽 2,000 次。v3 的 `productive_struggle` 有 16 次重抽未定义，未代填；其余表内读数未见未定义重抽。复算没有新发评测请求。标签是 AI 预标加用户复核，不是人工独立判断；每版只观察一次，区间不能证明版本差异或未见题效果。

| 版本 | 维度 | 线性加权 κ（95% CI） | 精确同档率 | 两档差 | `plan.md:92` |
| --- | --- | ---: | ---: | ---: | --- |
| v3 | `misconception_repair` | 0.815 [0.494, 1.000] | 13/15（86.7%） | 0 | 未通过，S0-55 同档证据未确认 |
| v3 | `support_escalation_and_fading` | 0.706 [0.444, 1.000] | 12/15（80.0%） | 0 | 未通过，标签缺 2 档 |
| v3 | `agency_handoff` | 0.783 [0.512, 1.000] | 12/15（80.0%） | 0 | 通过 |
| v3 | `productive_struggle` | 0.672 [0.000, 1.000] | 13/15（86.7%） | 1 | 未通过，标签缺 1 档，S0-84 同档证据未确认 |
| v3 | `representation_pivot` | 0.928 [0.767, 1.000] | 14/15（93.3%） | 0 | 通过 |
| v3 | `verification_or_transfer` | 0.478 [0.187, 0.727] | 7/15（46.7%） | 0 | 未通过，κ 与同档率未达线 |
| v4 | `agency_handoff` | 0.638 [0.294, 0.862] | 10/15（66.7%） | 0 | 未通过，同档率未达线 |
| v4 | `verification_or_transfer` | 0.444 [0.135, 0.717] | 7/15（46.7%） | 0 | 未通过，κ 与同档率未达线 |

**选 v3。** 两维同档数 v3 为 19/30，v4 为 17/30。差距是交还主动权多 2 格，验证或迁移持平。两维平均 κ 分别为 0.630、0.541，无需启用平手规则。v3 只能在已锁定的训练对话上按这条规则优先，整体仍未通过。v4 的历史报告与评分保留。复用初评报告中的离线命令；核对 v4 时，在命令末尾加 `--rescore ruler-train-rescore-v4-20261120-01 --rescore-ruler e1-numbered-evidence-v4`。

两版的 `verification_or_transfer` κ 都低于 0.60。第 4 步该维以原对话行为为准，分数只作参考。记录教师是否发起概念检查或迁移，以及学生是否独立解释或应用，并附消息引用；不能用分差代替这些证据。

### 冻结记录

冻结 `e1-numbered-evidence-v3`。裁判规范、提示和调用配置按 `889fc4bad254f5fcfb813f705643f36bf376ec0e` 回读，已在当前代码恢复。尺子指纹为 `7af16380ef04a8a1af5892859d3bfc8d74cd4477b939e7d614dd79f7b134e6c4`。冻结依据是两个目标维的同档数，不是训练一致性过线。此前 v4 复评对应提交 `3bd3b178a47f8d7e0d2c522a1d86f4b71238de38`，保留为历史。

第 3 步的 manifest 必须引用本冻结记录与 v3 尺子来源提交，并核对下列字段。值见 [v3 初评 manifest](../runs/ruler-train-score-v1/manifest.json)：

| manifest 字段 | 冻结值 |
| --- | --- |
| `identity.ruler` | `e1-numbered-evidence-v3` |
| `identity.judgeOutputContract` | `judge-output-v2` |
| `identity.version` | `evaluation-identity-v2` |
| `identity.policy.version` | `e1-call-policy-v4` |
| `identity.routes.judge` | `openrouter / tencent/hy4-flash`，`responseFormat: json_schema` |
| `identity.sources` | 对照初评 manifest 中 `contracts/judge/schema.mjs`、`src/judge.mjs`、`config/e1.mjs` 的哈希；其余源码以测试运行检出为准 |

v3 初评 manifest SHA256 为 `a8a68385fc5b6aa9e92dd043492fcb924bd4cc9844a2c9cf7e0d3c7061f1662f`。[初评评测收据](../runs/_receipts/ruler-train-score-v1.json) SHA256 为 `bb54307490c3019b559d10b31be76b4bd658c6d424de372766626179e99de564`，沿用上方锁定标签 SHA256。

第 3 步沿用 `plan.md:95–98` 的方向判定与证据核验口径。[机械冻结记录](../contracts/judge/ruler-freeze.json)引用决定提交 `e34d8c767ada4a31de5c58016d07d87c2b231ffb`，锁定 v3 初评的尺子身份和源码，另绑定预登记与测试名单。测试以独立 `identityId` 记录任务、条件、预算和来源，不复用训练 `identityId`。旧划分的格数和哨兵题不再使用；S0-82 在训练名单内。实际配对和哨兵按锁定的 25 题顺序导出。

### 历史训练运行

`6fd2875` 锁定 15/25 划分，`60a93cc` 固定候选题并校验训练引用，`5e56667` 提供训练生成、初评及复核入口。

只纳入原件初筛通过的 40 道题，锁定 15 道训练和 25 道测试。20 道待校正、5 道暂缓、28 道旧封存均保持原状。名单、种子、复算规则和 SHA256 见[数据契约](../contracts/dataset/README.md#补尺子划分)。当时用 `e1-numbered-evidence-v3 / judge-output-v2 / evaluation-identity-v2` 做初评，未生成或评测试题。

干净 HEAD `5e56667` 的 [检查收据](../runs/_receipts/check-5e5666738fd1d096e3caabde4b20b567ea5ffb77.json)记录 68 项通过。真实生成和初评串行执行。15 道训练题均 `execution_success`，初评全部 `scored: true`、`validTotal: true`。两个 run 的进程及 `--verify-run` 均退出 0；[生成复核](../.tmp/scratch/ruler-expand/ruler-train-gen-v1.verify.json)和[初评复核](../.tmp/scratch/ruler-expand/ruler-train-score-v1.verify.json)均为 `verified: true`、`acceptance: true`。全部遥测 PID 与对应启动收据一致，生成 `61792`、初评 `18516`。

| 阶段 | 收据 | 请求数 / 上限 | 请求输出 token / 上限 | 实报输入 / 缓存读 / 输出 / 合计 |
| --- | --- | ---: | ---: | ---: |
| 生成 | [start](../runs/_receipts/ruler-train-gen-v1.start.json)、[requests](../runs/_receipts/ruler-train-gen-v1.requests.jsonl)、[process](../runs/_receipts/ruler-train-gen-v1.process.json) | 120 / 396 | 563,520 / 1,881,216 | 84,689 / 129,280 / 61,894 / 275,863 |
| 初评 | [start](../runs/_receipts/ruler-train-score-v1.start.json)、[requests](../runs/_receipts/ruler-train-score-v1.requests.jsonl)、[process](../runs/_receipts/ruler-train-score-v1.process.json) | 15 / 45 | 983,040 / 2,949,120 | 48,063 / 1,024 / 185,526 / 234,613 |

重试和用量缺报均为 0。两阶段合计实报 510,476 token。原 20 条最省档估算来自本机 `%TEMP%/teacharena/ruler-expand/plan.md` 第 6 节（SHA256 `59a501ce1df6c0e731c4c22c3c0e847438b83dac9c3b126b7efb2ce6a9ea0c22`），生成 295,800、初评 379,000，合计约 674,800 token。按 15 条线性折算，生成约 221,850 token，实报高 24.3%；初评约 284,250 token，实报低 17.5%。实际请求输出额度均低于预检上限。15 次裁判请求未观察到推理 token 超出请求推理上限。

复核材料在本机 `%TEMP%/teacharena/ruler-expand/labeling/ruler-train-score-v1/`。五份交接文件的摘要见 `.tmp/scratch/ruler-expand/verify-delivery.log`。先在评分 run 下锁定 `labels.csv` 再揭分。v4 的变更引用保留在 `git show 3bd3b17:contracts/judge/ruler-change.json`，绑定原生成 run 和同 SHA256 的 `labels-locked.csv`。切回 v3 后 `npm run check` 仍校验原 v3 指纹，任何新尺子变更仍须提供训练引用。

## 未见题验证结果

真实 run `ruler-test-v3-real-01` 在干净 HEAD `64d8cc746d18045320841e3efc9c8b719e75c7d5` 执行。测试 [manifest](../runs/ruler-test-v3-real-01/manifest.json) 核对了[冻结记录](#冻结记录)，使用独立身份 `cd3c5ed0e8a2bea61ff1abe4ef5c2dbe5b7d2fdb26a09e350535ae129cbb6d8e`。25 题、50 格均有有效总分。`no_teach` 哨兵 4/4 后完成余下 2 格。`acceptance: true` 只表示拿齐分数。

**未达到预登记通过线。** 每组有效配对须达到 90%，目标维命中须达到计划数的 80%。四组同题总分方向为 7/7、6/6、6/6、6/6；执行者 AI 回读后，目标维有效与命中分别为 `answer_dump` 7/7、7/7，`lecture` 2/6、0/6，`sycophant_close` 6/6、6/6，`no_teach` 6/6、6/6。`lecture` 即使不扣证据不足的配对也只有 3/6 命中，另 3 对同档。抽查 S0-79、S0-63 的分档证据未获确认，该组留待定，但本轮整体已确定不过线。`verification_or_transfer` 两版训练 κ 均低于 0.60，尺子一致性不足，仅供参考。25 题只运行一次，不能证明跨次稳定。训练是 AI 预标加用户复核，改动 0/90，不是独立人工校准。

[报告和逐题表](../runs/ruler-test-v3-real-01/test-report.md) · [复算结果](../runs/ruler-test-v3-real-01/test-calculations.json) · [逐题消息证据](../runs/ruler-test-v3-real-01/test-audit.json)。[启动](../runs/_receipts/ruler-test-v3-real-01.start.json)、[请求](../runs/_receipts/ruler-test-v3-real-01.requests.jsonl)、[进程](../runs/_receipts/ruler-test-v3-real-01.process.json)的 [`--verify-run` 复核](../runs/ruler-test-v3-real-01/verify.json)退出 0。459 条遥测与启动和进程收据均为 PID `31064`。请求 459/1,650，累计请求输出额度 5,745,024/17,054,400 token；供应商实报总计 1,709,139 token，8 次缺报。没有故障题；裁判调用重试 9 次，含 5 次本地超时。`S0-70/no_teach` 的第 4 轮裁判调用 1、尝试 1 实报 17,324 推理 token，超过请求上限 16,384。

## 第 4 步 harness 对照

预登记以第 3 步 normal 的最低两维为目标：`representation_pivot` 为 1.760，`agency_handoff` 为 1.840。`verification_or_transfer` 为 1.880，保留对话回读，不列为目标分档。表征转换的 0 分含无机会；主动权在第 3 步的 lecture 上回读后 0/6。两项目标的改善不能只凭涨分判断。

预登记 SHA256 为 `bdc17d6a32e46df8664d338cc6b976bc3adb41b348cf914114d011da32037967`。真实三侧在干净 `d373cbee4e350dc91264380008928a3d96051e37` 串行执行，各侧 10/10 有效、`--verify-run` 退出 0。共发出 195/810 次请求，请求输出额度 2,802,960/9,423,360 token，供应商实报合计 843,155 token，另有 1 次缺报。裁判沿用冻结 v3。基线 `identityId` 为 `da3a1f31ca37de5f403f04479d90aa2634893bd86762d8c55864b7182001afd0`。[本地报告和三侧收据](../runs/harness-ab-v1/ab-report.md) · [预登记](../.tmp/scratch/harness-ab/preregistration.md)

**不采用这次改动。** 改进侧减基线的交还主动权配对均值为 0.00，表征转换为 −0.50，总分为 −0.70。其余四维均不低于 −0.3。固定五题的预登记行为命中为基线 4/5、改进 5/5，差距 1 题，要求至少 2 题。回读由执行者 AI 完成，尚无人工复核。话术的两个目标维和总分均未上涨，未触发本次「尺子被骗」判据。normal 沿用原来两条阶段指令，候选仍为显式实验变体。[95% CI 与逐题分差](../runs/harness-ab-v1/ab-calculations.json) · [对话回读](../runs/harness-ab-v1/behavior-audit.md)

## E1 S0-06 真实双格

E1 真实结果为两格均有有效总分，`productive_struggle` 为正常格 2 分、`answer_dump` 格 0 分。23 / 14 条引用均可回读，8 份学生请求未检出教师内部标记。正常格首份裁判响应因分数与证据冲突被拒绝，重试通过。历史执行与排查记录保留在 `cd0de52` 的状态文档。运行和检查收据见 [E1 卡](scenarios.md#e1-s0-06-真实双格)。裁判结构化输出故障另见[诊断与复核](judge-structured-output.md)。

## E2 真实运行

| 场景卡 | 结果 |
| --- | --- |
| 谁 | 维护尺子与复核教学行为的人。 |
| 条件 | 干净 HEAD `f8c9db1` 的检查收据记录 49 项通过。同次五格共用 S0-06、学生画像、四轮编排和尺子 `e1-numbered-evidence-v2`。 |
| 能完成什么 | 目标维度区分了两种坏教师。一格同档，一格因裁判故障不可判定。本次 `acceptance: false`，当时 S1 尚未签收。 |
| 证据 | **真实验证。** [结果](../runs/e2-real-20261119-05/result.json)、[评测身份和检查收据](../runs/e2-real-20261119-05/manifest.json)、[进程收据](../runs/_receipts/e2-real-20261119-05.process.json)、[人工回读](../runs/e2-real-20261119-05/review.md)。四个已打分格的裁判原件重放一致，80 条绑定引用可回读。 |
| 失败可定位 | `lecture` 的 `agency_handoff` 为 1 对 1，证据组引用坏教师格 #2 和 #9。`no_teach` 的裁判第 4 轮、调用 1 连续三次本地超时，末次原件为 `no_teach/calls/judge-4-1-3.json`。 |
| 不算交付 | **离线复现。** `e2-offline-20261119-02` 五格通过机器检查，复核退出 0，外部请求 0。真实回读按预登记的目标维度和教学机会判断。 |

```sh
node src/cli.mjs --scenario E2 --mode real --estimate-only --id e2-estimate-20261119-05
node src/cli.mjs --scenario E2 --mode real --confirm-cost --run-root runs --id e2-real-20261119-05 --max-attempts 147 --max-requested-output-tokens 1610112
node src/cli.mjs --verify-run e2-real-20261119-05
```

预检退出 0，预计 45 次常规调用，硬上限为 147 次尝试、1,610,112 个请求输出 token。真实运行退出 1。复核退出 0，`verified: true`、`conclusion: complete`、`exitCode: 1`、`acceptance: false`。共 49 次请求尝试，含 3 次重试。请求输出额度累计 717,424 token，已上报输出 66,144 token，另有 4 次超时的实际用量未知。49 条遥测均来自启动记录的 PID `28316`。

| 格子 | `status` | `scored` | `validTotal` | 目标维度 | 正常 → 本格 | 差值 |
| --- | --- | --- | --- | --- | --- | --- |
| `normal` | `execution_success` | `true` | `true` | 四项对照基准 | 2 / 1 / 2 / 2（按下方顺序） | — |
| `answer_dump` | `execution_success` | `true` | `true` | `productive_struggle` | 2 → 0 | 2 |
| `lecture` | `execution_success` | `true` | `true` | `agency_handoff` | 1 → 1 | 0 |
| `sycophant_close` | `execution_success` | `true` | `true` | `verification_or_transfer` | 2 → 0 | 2 |
| `no_teach` | `infra_failure` | `false` | `false` | `misconception_repair` | 2 → 缺分 | — |

## S1 补充复核

### `no_teach` 裁判超时与补评

源运行的 `no_teach` 裁判在第 4 轮调用 1 的三次尝试均收到 HTTP 200，分别在 180,005、180,015、180,010 ms 触发 180,000 ms 本地 deadline。保存的请求上下文序列化后均为 5,365 字节，同次完成的裁判请求上下文为 5,718 至 13,476 字节。该大小仅覆盖保存的上下文。三次请求的输出上限均为 65,536 token。首次收到 59,367 字符推理和 35,737 字节不完整 JSON，后两次分别收到 160,964 和 175,298 字符推理，无可见正文。三次均缺终止原因及最终用量，实际推理和输出 token 未知。原件可确认直接失败于本地 deadline，无法确定供应商延迟的根因。单格补评沿用原裁判策略。[调用原件](../runs/e2-real-20261119-05/no_teach/calls/) · [遥测](../runs/e2-real-20261119-05/no_teach/telemetry.json)

```sh
node src/cli.mjs --scenario E2 --mode real --judge-only e2-real-20261119-05 --judge-cell no_teach --estimate-only --id e2-no-teach-estimate-20261119-02
node src/cli.mjs --scenario E2 --mode real --confirm-cost --judge-only e2-real-20261119-05 --judge-cell no_teach --id e2-no-teach-real-20261119-01 --max-attempts 3 --max-requested-output-tokens 196608
node src/cli.mjs --verify-run e2-no-teach-real-20261119-01
```

**真实验证。** 干净 HEAD `28300ce` 的检查收据记录 50 项通过。预检上限为 3 次尝试、196,608 个请求输出 token。补评实际发出 1 次请求，上限 65,536 token，供应商报告输入 1,222 token、输出 13,022 token，其中推理 11,478 token。CLI 和 `--verify-run` 均退出 0，补评格为 `execution_success`，`scored: true`，`validTotal: true`。补评对话与原对话相同，manifest 保存源对话哈希。原五格运行仍为退出 1、`acceptance: false`。[补评 manifest](../runs/e2-no-teach-real-20261119-01/manifest.json) · [进程收据](../runs/_receipts/e2-no-teach-real-20261119-01.process.json) · [检查收据](../runs/_receipts/check-28300ceb07081cad732c151a3ea17d964f21aecb.json)

`misconception_repair` 为正常格 2 分、补评格 0 分，差值 2。正常格第 1 轮 #2 让学生判断 AE 是否垂直于 AD，#3 学生说 “So maybe 5 isn’t automatically the distance to side AD.” 补评保留源消息 ID。`e2-real-20261119-05:no_teach:m:1` 暴露 AE 与垂距的误解，第 1 轮 #2 只说 “Thanks for giving this problem a try—keep going, you’ve got this!”，#3 学生仍问是否为 5。第 4 轮 #8、#9 再现同样机会和未修复的误解。[正常格裁判](../runs/e2-real-20261119-05/normal/judge.json) · [补评裁判](../runs/e2-no-teach-real-20261119-01/no_teach/judge.json)

### `lecture` 同档

正常格 #6 交还列式，学生 #7 自行消元。第 4 轮 #8 又由教师给出线性方程，学生 #9 只完成求解。讲授格 #2 已给两套完整解，#9 学生能复述 `25/13`，仍要求解释为何 AG 等于垂距。这道题提供了交还步骤的机会。正常教师交还有限，裁判也未解释为何将讲授格的复述及自我监控同样判为 1 分。一次同档无法确定两者谁是主因。`productive_struggle` 捕捉了提前揭底，`verification_or_transfer` 也反映了缺少概念核验，两项均为正常 2、讲授 0。逐条证据和备选方向见本地 [.tmp/scratch/e2-real/lecture-analysis.md](../.tmp/scratch/e2-real/lecture-analysis.md)。

### v3 冻结补评

冻结补评 `s1-v3-frozen-real-20261119-01` 使用 `e1-numbered-evidence-v3`、`evaluation-identity-v2` 和 `e1-call-policy-v4`。干净 HEAD `2fbefc7` 的 `npm run check` 通过 51 项。补评 manifest 绑定 `e2-real-20261119-05` 的源身份、manifest 哈希和五格对话哈希。补评按 v3 口径读取；与 v2 分档不可直接比较。[补评 manifest](../runs/s1-v3-frozen-real-20261119-01/manifest.json) · [检查收据](../runs/_receipts/check-2fbefc73afa6573c5f3eee92b195c66dc0586b91.json)

```sh
node src/cli.mjs --scenario E2 --mode real --judge-only e2-real-20261119-05 --judge-cell all --estimate-only --id s1-v3-frozen-estimate-20261119-01
node src/cli.mjs --scenario E2 --mode real --judge-only e2-real-20261119-05 --judge-cell all --confirm-cost --id s1-v3-frozen-real-20261119-01 --max-attempts 15 --max-requested-output-tokens 983040
node src/cli.mjs --verify-run s1-v3-frozen-real-20261119-01
```

预检退出 0。冻结补评退出 1，`acceptance: false`。`--verify-run` 退出 0，`verified: true`、`conclusion: complete`，进程收据与请求日志均记录 3 次请求。正常格第 4 轮裁判调用 1 连续三次收到 HTTP 200 和正常停止的 JSON。三次响应的六维 `reason` 都只有数字，`agency_handoff.reason` 均为 `"1"`。本地校验拒绝三份响应，未发布分数。两次重试耗尽后停止，`lecture` 无分差可判定，完整真实五格未启动。[结果](../runs/s1-v3-frozen-real-20261119-01/result.json) · [进程收据](../runs/_receipts/s1-v3-frozen-real-20261119-01.process.json) · [末次原件](../runs/s1-v3-frozen-real-20261119-01/normal/calls/judge-4-1-3.json)

| 格子 | `status` | `scored` / `validTotal` | 六维 / 总分 | 目标维度 / 分差 | 源对话回读 |
| --- | --- | --- | --- | --- | --- |
| `normal` | `infra_failure` | `false` / `false` | 无 / `null` | 正常对照 / 缺分 | #7 学生列出 “(x − 13)² + y² = 144” 后消元。 |
| `answer_dump` | 未执行 | 无记录 | 无 / 无 | `productive_struggle` / `null` | #2 教师首答给出坐标推导和最终答案 `25/13`。 |
| `lecture` | 未执行 | 无记录 | 无 / 无 | `agency_handoff` / `null` | #9 学生说 “I still honestly don’t see why AG is the distance to AD.” |
| `sycophant_close` | 未执行 | 无记录 | 无 / 无 | `verification_or_transfer` / `null` | #2 教师附和 “the distance from E to side AD is 5 units”，随后收尾。 |
| `no_teach` | 未执行 | 无记录 | 无 / 无 | `misconception_repair` / `null` | #2 教师说 “Thanks for giving this problem a try” 并继续鼓励。 |

摘录来自 `e2-real-20261119-05:<格子>:m:<序号>`。v3 没有发布可用的裁判绑定引用。[冻结源原件](../runs/e2-real-20261119-05/)

三次调用的脱敏出站字段均为 `reasoning.max_tokens=16384`、`max_tokens=65536`、`provider.require_parameters=true` 和 `response_format.type=json_schema`，其中 `json_schema.strict=true`。总输出预算扣除请求推理上限后余 49,152 token。三次实报推理均低于 16,384，未观察到超限。[调用原件](../runs/s1-v3-frozen-real-20261119-01/normal/calls/) · [遥测](../runs/s1-v3-frozen-real-20261119-01/normal/telemetry.json)

| `normal` 第 4 轮调用 1 | 请求输出额度 | 实报输入 | 缓存读入 | 实报输出 | 推理 | 可见输出 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 尝试 1 | 65,536 | 2,034 | 0 | 8,889 | 7,890 | 999 |
| 尝试 2 | 65,536 | 2,071 | 0 | 10,412 | 9,527 | 885 |
| 尝试 3 | 65,536 | 23 | 2,048 | 10,847 | 9,726 | 1,121 |
| 合计 | 196,608 | 4,128 | 2,048 | 30,148 | 27,143 | 3,005 |

实报 token 合计 36,324，含 2,048 个缓存读入 token。三次用量均已上报。

### v3 输出契约修复后的冻结补评

`s1-v3-output-v2-frozen-real-20261119-01` 使用干净 HEAD `10654a7`，检查收据记录 54 项通过。评测身份记录 `judgeOutputContract: judge-output-v2`，沿用 v3 分档和四个预登记维度。五格对话与 `e2-real-20261119-05` 的原件逐字一致，五份裁判正文均可重放到相同的分档、理由和绑定引用。五格都在第 4 轮裁判调用 1 的首次尝试成功。`--verify-run` 退出 0，`verified: true`，本次补评退出 1，`acceptance: false`。[manifest](../runs/s1-v3-output-v2-frozen-real-20261119-01/manifest.json) · [结果](../runs/s1-v3-output-v2-frozen-real-20261119-01/result.json) · [进程收据](../runs/_receipts/s1-v3-output-v2-frozen-real-20261119-01.process.json) · [检查收据](../runs/_receipts/check-10654a73ba751ffd40dc6686d5d0ad8f2b2060ab.json)

六维依次为 `misconception_repair`、`support_escalation_and_fading`、`agency_handoff`、`productive_struggle`、`representation_pivot`、`verification_or_transfer`。五格均为 `execution_success`、`scored: true`、`validTotal: true`。消息 ID 为 `e2-real-20261119-05:<格子>:m:<序号>`。

| 格子 | 六维 / 总分 | 目标维度 | 正常 → 本格 / 分差 | 裁判引用回读 |
| --- | --- | --- | --- | --- |
| `normal` | 2 / 1 / 1 / 1 / 2 / 0，合计 7 | 四项对照基准 | 正常对照 | #7 学生自行列出 “(x − 13)² + y² = 144” 并消元。 |
| `answer_dump` | 1 / 1 / 0 / 0 / 2 / 0，合计 4 | `productive_struggle` | 1 → 0 / 1 | #2 教师首答给出完整坐标推导和答案 `25/13`。 |
| `lecture` | 1 / 0 / 0 / 0 / 1 / 0，合计 2 | `agency_handoff` | 1 → 0 / 1 | #9 学生复述答案并问 “I still honestly don’t see why AG is the distance to AD.” |
| `sycophant_close` | 0 / 0 / 2 / 0 / 0 / 0，合计 2 | `verification_or_transfer` | 0 → 0 / 0 | #2 教师附和 “the distance from E to side AD is 5 units” 并收尾。 |
| `no_teach` | 0 / 0 / 0 / 0 / 0 / 0，合计 0 | `misconception_repair` | 2 → 0 / 2 | #2 教师只做鼓励，#3 学生仍问 “So AE = 5 means the distance to side AD is just 5, right?” |

`lecture` 达到预登记的冻结主动权门槛。整体验收未通过的差值是 `sycophant_close` 的 `verification_or_transfer`。正常格 #8 已把 x 和所求距离等同，只问 “What does x come out to?”，#9 学生求出 x，未解释距离关系。该次裁判把它判为 0 分。完整五格使用新对话，对照同一次运行的正常格。[正常格裁判](../runs/s1-v3-output-v2-frozen-real-20261119-01/normal/judge.json) · [附和格裁判](../runs/s1-v3-output-v2-frozen-real-20261119-01/sycophant_close/judge.json)

预检上限为 15 次尝试、983,040 请求输出 token。实际 5 次、0 次重试、327,680 请求输出 token。供应商实报输入 13,005、输出 61,050，合计 74,055。每次出站均为 `max_tokens=65536`、`reasoning.max_tokens=16384`。按上述格序，实报推理为 10,601 / 9,305 / 12,258 / 11,055 / 10,706，均在上限内。

### v3 完整真实五格

`e2-real-20261119-06` 在干净 HEAD `20c7056` 执行，检查收据记录 54 项通过。五格同用 S0-06、学生画像、四轮编排、`e1-numbered-evidence-v3`、`judge-output-v2`、`evaluation-identity-v2` 和 `e1-call-policy-v4`。[manifest](../runs/e2-real-20261119-06/manifest.json) · [检查收据](../runs/_receipts/check-20c70569330406372024ef9e57a735e351195475.json)

```sh
node src/cli.mjs --scenario E2 --mode real --estimate-only --id s1-v3-output-v2-full-estimate-20261119-01
node src/cli.mjs --scenario E2 --mode real --confirm-cost --id e2-real-20261119-06 --max-attempts 147 --max-requested-output-tokens 1610112
node src/cli.mjs --verify-run e2-real-20261119-06
```

预检、完整运行和复核均退出 0，`verified: true`、`acceptance: true`。全部 46 条遥测与启动、进程收据和 manifest 一致，PID 为 `74648`。五份发布的裁判正文重放一致，四项目标分档均有可回读引用。[启动收据](../runs/_receipts/e2-real-20261119-06.start.json) · [进程收据](../runs/_receipts/e2-real-20261119-06.process.json) · [评测收据](../runs/_receipts/e2-real-20261119-06.json) · [结果](../runs/e2-real-20261119-06/result.json) · [人工回读](../runs/e2-real-20261119-06/review.md)

五格均为 `execution_success`、`scored: true`、`validTotal: true`。六维顺序与冻结表相同。下表的消息号对应 `e2-real-20261119-06:<格子>:m:<序号>`。

| 格子 | 六维 / 总分 | 目标维度 | 正常 → 本格 / 分差 | 裁判引用回读 |
| --- | --- | --- | --- | --- |
| `normal` | 2 / 2 / 1 / 2 / 2 / 1，合计 10 | 四项对照基准 | 正常对照 | #7 学生列出 BE 方程并问 “Can we just subtract them to get x quickly?” |
| `answer_dump` | 1 / 1 / 0 / 0 / 1 / 0，合计 3 | `productive_struggle` | 2 → 0 / 2 | #2 教师首答推到 `25/13`。正常 #2 先追问垂线的方向和落点。 |
| `lecture` | 1 / 1 / 0 / 0 / 0 / 0，合计 2 | `agency_handoff` | 1 → 0 / 1 | #9 学生复述 #8 的公式和答案，说 “I’m still not totally seeing why it works”。 |
| `sycophant_close` | 0 / 0 / 0 / 0 / 0 / 0，合计 0 | `verification_or_transfer` | 1 → 0 / 1 | #8 教师说 “You’ve completed it”。正常 #4 问哪个坐标表示垂距及其原因，#5 学生给出 x 但仍不确定。 |
| `no_teach` | 0 / 0 / 1 / 0 / 0 / 0，合计 1 | `misconception_repair` | 2 → 0 / 2 | #7 学生仍问 AE 与垂距的区别，#8 教师只说 “Keep going—you can do this!”。正常 #2、#6 解释区别，#9 学生用求出的 x 检验原猜测。 |

预检上限为 147 次尝试和 1,610,112 请求输出 token。实际 46 次请求，含 1 次重试，请求输出额度 581,056。已报输入 29,843、缓存读入 38,016、输出 100,846，合计 168,705 token。另有一次用量未知。[请求日志](../runs/_receipts/e2-real-20261119-06.requests.jsonl)

六次裁判请求的脱敏出站均确认 `reasoning.max_tokens=16384`、`max_tokens=65536`、`provider.require_parameters=true`、`response_format.json_schema.strict=true`。**路由未执行上限**。三次实报推理超过 16,384。

| 格子 | 裁判第 4 轮调用 1 尝试 | 请求总输出 | 实报推理 | 与上限对照 |
| --- | ---: | ---: | ---: | --- |
| `normal` | 1 | 65,536 | 8,532 | 上限内 |
| `answer_dump` | 1 | 65,536 | 未知 | HTTP 200 后流失败，用量未上报 |
| `answer_dump` | 2 | 65,536 | 21,258 | 超 4,874 |
| `lecture` | 1 | 65,536 | 18,386 | 超 2,002 |
| `sycophant_close` | 1 | 65,536 | 7,770 | 上限内 |
| `no_teach` | 1 | 65,536 | 17,717 | 超 1,333 |

尝试 1 的故障为 `provider_failure`，其后一次重试成功。[失败调用原件](../runs/e2-real-20261119-06/answer_dump/calls/judge-4-1-1.json) · [裁判重试原件](../runs/e2-real-20261119-06/answer_dump/calls/judge-4-1-2.json)

### 裁判稳定性验证

在 `00fecc4` 的干净独立检出上，用 `e1-numbered-evidence-v3`、`judge-output-v2` 和 `evaluation-identity-v2` 对 `e2-real-20261119-06` 五格冻结对话重复评分。离线先核对源身份、对话和绑定，外部请求为 0。真实预检每次允许 15 次尝试、983,040 请求输出 token。预登记标准要求三次重复都取得五格有效分数，四项目标方向分别达到 3/3，计入原始 `06` 后达到 4/4。调用级两次重试均失败时停止。

| 重复 | 进程退出 / `--verify-run` 退出 | 有效格 | 请求 / 重试 | 请求输出额度 | 实报输入 / 缓存读入 / 输出 / 合计 | 用量未知 |
| --- | --- | --- | --- | ---: | --- | ---: |
| [r1](../runs/s1-stability-r1-20261119/result.json) | 0 / 0，`acceptance: true` | 5/5 | 9 / 4 | 589,824 | 7,467 / 6,656 / 59,478 / 73,601 | 4 |
| [r2](../runs/s1-stability-r2-20261119/result.json) | 1 / 0，`acceptance: false` | 4/5 | 8 / 3 | 524,288 | 10,814 / 1,536 / 48,260 / 60,610 | 4 |
| r3 | 未启动 | 无 | 0 | 0 | 无 | 0 |

14:04:16 应用重启使任务注册和父进程丢失。`r2` 的 Node 进程 PID `37488` 继续执行并写出完整进程收据，`--verify-run` 退出 0。`r2/no_teach` 第 4 轮裁判调用 1 的三次尝试均收到 HTTP 200，随后触发本地 180 秒超时（180,011、180,015、180,016 ms）。该格为 `infra_failure`、`scored: false`、`validTotal: false`。两次重试耗尽后结束，`r2` 计入结果。`r2b` 和 `r3` 均无启动记录。[r1 进程收据](../runs/_receipts/s1-stability-r1-20261119.process.json) · [r1 复核](../runs/s1-stability-r1-20261119/verify-run.json) · [r2 进程收据](../runs/_receipts/s1-stability-r2-20261119.process.json) · [r2 复核](../runs/s1-stability-r2-20261119/verify-run.json) · [r2 超时原件](../runs/s1-stability-r2-20261119/no_teach/calls/judge-4-1-3.json)

下表中的有分数格均为 `execution_success`、`scored: true`、`validTotal: true`。六维顺序同上。引用来自 `e2-real-20261119-06:<格子>:m:<序号>`，每个有分数格的裁判绑定均可回读。`r2/no_teach` 使用源对话摘录定位，未发布裁判引用。

| 重复 | 格子 | 六维 / 总分 | 正常 → 本格 / 分差 | 原文回读 |
| --- | --- | --- | --- | --- |
| r1 | `normal` | 2/2/1/2/2/1，合计 10 | 基准 | #7 “Can we just subtract them to get x quickly?” |
| r1 | `answer_dump` | 1/1/1/0/1/0，合计 4 | 2 → 0 / 2 | #2 首答给出 `25/13`。 |
| r1 | `lecture` | 1/1/0/0/1/0，合计 3 | 1 → 0 / 1 | #9 “I’m still not totally seeing why it works”。 |
| r1 | `sycophant_close` | 0/0/0/0/0/0，合计 0 | 1 → 0 / 1 | #4 “Yes—just put 5 and you’re done.” |
| r1 | `no_teach` | 1/0/1/0/0/0，合计 2 | 2 → 1 / 1 | #8 “Keep going—you can do this!” |
| r2 | `normal` | 1/2/1/2/2/1，合计 9 | 基准 | #7 “Can we just subtract them to get x quickly?” |
| r2 | `answer_dump` | 1/1/0/0/1/1，合计 4 | 2 → 0 / 2 | #2 首答给出 `25/13`。 |
| r2 | `lecture` | 1/1/0/0/1/0，合计 3 | 1 → 0 / 1 | #9 “I’m still not totally seeing why it works”。 |
| r2 | `sycophant_close` | 0/0/0/0/0/0，合计 0 | 1 → 0 / 1 | #4 “Yes—just put 5 and you’re done.” |
| r2 | `no_teach` | 无 / `null` | 1 → 缺分 / `null` | 源 #8 “Keep going—you can do this!” |
| r3 | 五格 | 未运行 | 未运行 | 同一冻结源，暂无本次裁判绑定。 |

下表的逐格一致率以 `06` 同格同维为基准，重复中实际可比较 9 格，原始 `06` 的 5 格计入后分母为 14。预登记的 15 个重复格仍缺 6 个。目标方向以全部预登记次数为分母，`?` 表示未验证。已得出分差的对照中没有同档或反向。

| 维度 | 重复逐格一致 | 含 `06` 自对照 | 分档波动 | 目标方向 `06 / r1 / r2 / r3` | 重复 / 含 `06` 已证实 |
| --- | --- | --- | --- | --- | --- |
| `misconception_repair` | 7/9 | 12/14 | r1 `no_teach` 0→1，r2 `normal` 2→1 | + / + / ? / ? | 1/3 / 2/4 |
| `support_escalation_and_fading` | 9/9 | 14/14 | 无 | 无预登记对照 | 无 |
| `agency_handoff` | 8/9 | 13/14 | r1 `answer_dump` 0→1 | + / + / + / ? | 2/3 / 3/4 |
| `productive_struggle` | 9/9 | 14/14 | 无 | + / + / + / ? | 2/3 / 3/4 |
| `representation_pivot` | 7/9 | 12/14 | r1、r2 `lecture` 0→1 | 无预登记对照 | 无 |
| `verification_or_transfer` | 8/9 | 13/14 | r2 `answer_dump` 0→1 | + / + / + / ? | 2/3 / 3/4 |

两次重复均发送 `reasoning.max_tokens=16384` 和 `max_tokens=65536`，9 次有报告的推理用量均低于上限。每格的记录按尝试顺序排列，`?` 表示未上报。

r1 未上报用量的四次调用均收到 HTTP 200 后触发本地 180 秒超时，分别为 `lecture` 尝试 1、`sycophant_close` 尝试 1、`no_teach` 尝试 1 和 2。它们都在调用级重试中恢复。r2 另有 `sycophant_close` 尝试 1 的服务流故障，用量未知，尝试 2 成功。以上均为第 4 轮裁判调用 1。

| 重复 | `normal` | `answer_dump` | `lecture` | `sycophant_close` | `no_teach` |
| --- | ---: | ---: | --- | --- | --- |
| r1 | 8,048 | 10,289 | ? / 10,352 | ? / 11,755 | ? / ? / 12,142 |
| r2 | 8,474 | 14,703 | 12,554 | ? / 7,420 | ? / ? / ? |

### 尺子范围和已知问题

当前尺子只覆盖整段公开对话的六维评分，六项等权，合计 0–12。旧 v6 的单轮评价（35%）、规则轨迹指标（16%）、学生变化（25%）和完成乘子 `p` 均未接入。旧版整段裁判层（24%）内的任务义务同样未接入。依据为本机 `%TEMP%\teacharena\ruler-old-vs-new.md` 的静态对照，现行契约见裁判 README。旧 v6 与当前分数采用各自口径回读。[裁判契约](../contracts/judge/README.md)

- **S1。** 整段六维验证固定场景中的四项方向和证据回读。单轮质量、规则轨迹、学习增量和完成状态在当前验收范围之外。
- **第 4 步的反馈边界。** 对 harness 的反馈限于同一尺子和预登记目标的整段分档。轮级退化、规则轨迹、学习增量和完成状态需要各自的诊断证据，才可归因到具体改动。
- **一档余量。** 原始 `06` 中，`lecture` 的 `agency_handoff` 与 `sycophant_close` 的 `verification_or_transfer` 都是 1→0，正常格在这两维为 1。两次重复已有的相应分差均为 1。
- **分档一致率。** `misconception_repair` 和 `representation_pivot` 的逐格一致率最低，计入 `06` 自对照后均为 12/14。
- **路由推理上限。** 完整 `06` 已观察到三次实报超限。两次重复的已知用量均在上限内，另有八次用量未知。
- **`no_teach` 裁判超时。** `05`、`06`、`r1`、`r2` 合计发生 10 次本地 180 秒超时，分别为 3、0、4、3 次，其中 8 次出在 `no_teach`。`06` 的 `answer_dump` 首次裁判尝试在 47,413 ms 因流故障结束。`no_teach` 两次成功调用的实报推理量中位数约为 14,930 token，其他四格合计约为 10,321。按 14 次成功调用的中位换算系数 4.1412 字符/token 估算，8 次 `no_teach` 超时中，4 次在截止前已收到约 34,831–42,330 推理 token，未收到正文。另 4 次已收到约 11,289–17,901 推理 token 和不完整正文。用户提出的假设是 `no_teach` 让裁判推理变多，从而导致超时。因果关系未证实。诊断留待后续查阅。[本地诊断材料](../.tmp/scratch/s1-ruler-v2/judge-timeout-diagnosis.md)
- **分档示例。** 根 README 链接裁判契约。裁判 README 的评分表仍缺系统的逐档示例，目前通用示例和主动权正反例在 `contracts/judge/schema.mjs`。

### S1 场景卡逐栏

**状态：已签收。** 用户在稳定性证据不完整的情况下决定签收。`e2-real-20261119-06` 的四组坏教师在各自预登记维度上均低于 `normal`。`r1` 五格有效，四组方向全部复现。`r2` 四格有效，复现三组方向，`no_teach` 缺分。原先预登记的「三次完整重复」未达成，缺 `r2/no_teach` 和 `r3` 的评分证据。

| 栏 | 已满足 | 还缺 |
| --- | --- | --- |
| 谁 | 接手者按 README 和运行手册执行。复核者可从 manifest、收据、裁判绑定与公开对话回读。 | 无。 |
| 条件 | 完整五格使用干净 HEAD `20c7056`。两次稳定性评分使用 `00fecc4` 的干净独立检出、相同尺子版本和 `06` 的冻结对话。 | 无。 |
| 能完成什么 | E1 真实双格已验收。完整 E2 五格的四项分差为 2 / 1 / 1 / 2。稳定性 r1 复现四项目标方向，r2 复现三项目标方向。 | r2 的 `no_teach` 缺分，r3 未启动，未得到四项方向的 4/4 证据。 |
| 证据 | **真实验证。** E1 `check_distance` 前后 hook 共用 `call_00_USpBHGKKl9qAJd83bH0d7645`，`isError: false`。`06`、r1、r2 的 `--verify-run` 均退出 0，保留原件与回读。**离线复现。** `00fecc4` 的 54 项检查通过，历史两项联合回归通过 15 项。 | 三次完整重复的评分及引用。 |
| 失败可定位 | r2 `no_teach` 的 `misconception_repair` 缺分，定位到第 4 轮裁判调用 1 的尝试 1 至 3，均超时。保留回读、启动与进程收据。 | 超时调用的实报用量未知。 |
| 不算交付 | 签收以完整五格和现有真实复评为依据。保留冻结同档、旧版本和离线原件。 | 三次完整重复仍缺证据，预登记标准保留。 |
