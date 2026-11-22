# TeachArena 第二轮裁判模型调研

**结论（推断）：** 若保留 19 题、严格 JSON、证据绑定和可读理由的要求，先试 [Qwen3 235B Instruct][q] 的 `parasail/fp8`；备选 [Qwen3-Next 80B Instruct][qn] 的 `deepinfra/fp8`。都不是 Decisions 模型。先做 18 次小样，不直接切正式裁判。**没有候选已证实能让这批输入稳定在 180 秒内完成。**

## 「jev」与「decide」分别是什么

1. **精确命中 [TypeSafe Jev 1.14][j]（`typesafe/jev-1.14`）。** [官方 Jev 指南][jh]称它是 *structured decision model*。用 [Decisions API][d] 提交 `state` 与多道类型化问题；`noul` 返回 Yes 的概率，不是生成式 Yes/No、#n 或理由。**推断：**「jev 这种决策模型」最可能指它；用户原意未确认。不用漂移的 `~typesafe/jev-latest`。
2. 同名功能是 [Jev Router][jr]（`typesafe/jev-router`）。它挑模型和 effort，被挑中的模型才写正文。[Auto Router][ar]（`openrouter/auto`）也逐请求选择模型和 effort，底层提供方与价格随之变。**推断：**两者不是固定裁判，不能为本轮冻结模型家族、推理策略和可比性。
3. **Decide/Decider 也确实存在。** [Solar Decide][s] 和 [Solar Decide Flash][sf]、[Perplexity Decider v1.2][p2] 与 [v1.3:free][p3] 都列在[官方 Decisions 清单][dc]。v1.3 还列出 Extractions；[官方说明][ex]说它能返回原文片段和字符 `span`，不生成理由。历史 [Mercury Decide][m] 有官方页，但付费、免费两种公开 endpoints 均为空，本次不列为可用；下线原因未读原文。**未找到**裸 `openrouter/decide` 或独立的 JVE、JEFF、JEEVA、JEVA 模型/供应商。检索口径与原始字段见[附录](appendix.md#catalog-search)。

**推断：** 如果用户要的是原生决策模型，可另立旁路试验，先冻结 Noul 阈值和证据选择（如对预枚举 #n 做 Choice，或把抽取的 span 本地绑定到消息）。那是新 API 和新评测契约，不能当本轮裁判的等价替换，也不能补造理由。

## 本地基线与计价口径

- 教师和学生都是 `deepseek / deepseek-flash`；训练标签由 `gpt-6.2-sol`（GPT）预标，用户复核，非独立盲标。现裁判 `openrouter / tencent/hy4-flash` 属腾讯混元；请求 `json_schema.strict:true`、`provider.require_parameters:true`、总输出上限 65,536、`reasoning.max_tokens:16384`、180 秒本地截止。（`config/e1.mjs`、`src/models.mjs`、`docs/status.md`。）
- **契约差异：**已有 v1 收据及读到的并行 ①c v2 代码都要求 19 个布尔值和证据槽；Yes 绑 #n、No 槽为 null，门控 N/A 和分数由本地算。线上 **没有 `reason` 字段**。把逐题理由视为用户拟要的新要求，不把旧推理串当理由；若要入线上 JSON，另锁输出契约、重估 token。
- **实报：**①b 54 次尝试，49 次合规完成，51 次有用量。49 次全程 p50/p90 为 72.897/95.041 秒。9 条消息连同裁判提示的输入 p50/p90/最大为 2,301/5,442/5,807 token（含缓存读写）；总输出 p50 13,662，推理 p50 13,293，可见 p50 369。51 条有用量尝试的输入/输出 p50 为 2,301/13,653。三次 HTTP 200 后各到 180 秒才中止，只有推理无可见正文，均缺实报用量；13/51 实报推理超过 16,384。**推断：**长推理是首要嫌疑，不是已经证明这三次超限。见[收据与算法](appendix.md#local-receipts)。
- 下表计价均为**推断**：固定端点 USD/百万 token 输入/输出单价，乘 400–500 次 × 历史 2,301/13,662。无缓存折扣、充值手续费或额外重试。另用历史 369 可见 token 估非推理情形。两种都是情景估算，不是报价、硬上限或候选实耗；新 tokenizer、理由字段会改变用量。

## 八个候选：先看固定端点，再看模型名

[Structured Outputs][so] 要求逐端点核对 [supported_parameters][api]。✓ 表示端点**声明** `response_format` + `structured_outputs`，且下列配置可以保留 `require_parameters:true`；不表示已跑过原 schema。延迟列为官方模型页的混合流量 p90 首 token 秒 / p90 吞吐 token/s（Decisions 行只是判定 API 延迟）。均不是本项目完整可见 JSON 的 p90。[字段及采样窗口](appendix.md#public-metrics)。

| 候选 / 端点 | strict + require_parameters | 推理控制及证据 | p90 秒 / tok/s；180s 完成 | 家族；上下文 | 输入/输出 $/M；400–500 次 USD | 公开供应商 / 结构化可用 |
| --- | --- | --- | --- | --- | --- | --- |
| **[Qwen3 235B Instruct 2507][q]** / [Parasail FP8][qe] | ✓；[Parasail 原文][ps]支持 strict | [Qwen 原卡][qm]明确仅 non-thinking；不发送 reasoning | 1.19 / 19；待验证 | 阿里 Qwen；131,072 | 0.14/0.80；4.50–5.63 | 3/3；本试只锁 1 |
| **[Qwen3-Next 80B Instruct][qn]** / [DeepInfra FP8][qne] | ✓；端点列两项 | [Qwen 原卡][qnm]明确仅 non-thinking；不发送 reasoning | 0.73 / 70.5；待验证 | 阿里 Qwen，不同 checkpoint；262,144 | 0.09/1.10；6.09–7.62 | 2/2；本试只锁 1 |
| [Mistral Small 4][ms] / [Mistral ZDR][mse] | ✓；端点列两项 | OR 列 `high/none`；[Mistral 原文][mr]的 `none` 仍是最少思考且不返回思考块，未见硬上限执行实证 | 0.75 / 77；待验证 | Mistral Small；262,144 | 0.15/0.60；3.42–4.27 | 1/1；单供应商风险 |
| [Gemini 2.5 Flash-Lite][gl] / [AI Studio][gle] | ✓；端点列两项 | [Google 原文][gt]列默认关闭；OR 仅列可选推理，未见该路由的上限实证 | 1.84 / 83；待验证 | Google Gemini；1,048,576 | 0.10/0.40；2.28–2.85 | 1/1；单供应商，[Google 原页][ga]提示旧用户访问限制 |
| [Gemini 3.8 Flash][gf] / [AI Studio][gfe] | ✓；Vertex endpoints 不列 `temperature` | OR 明列强制推理，仅 low/medium/high；未列 `supports_max_tokens`，无硬上限实证 | 4.48 / 38.1；待验证 | Google Gemini；1,048,576 | 0.75/3.75；21.18–26.48 | 2/2；保留温度时只剩 AI Studio，同属 Google |
| [Claude Haiku 5.5][c] / [Anthropic][ce] | 目录 ✓；**原 schema 高风险**：[官方原生 strict][cs] 仅 16 个 union 参数，现有 37 个；且不支持 `temperature` | OR 列 none；[Anthropic 原文][ct]支持关闭（effort ≤high）；OR 实际转译未验证 | 3.54 / 83；待验证 | Anthropic Claude；1,000,000 | 0.10/0.50；2.82–3.53 | 5/3；按原请求带温度为 0 |
| [Jev 1.14][j] / [TypeSafe][je] | **否**：只有 Decisions、两字段均不列 | 不生成文本或推理迹线；不适用 | 0.179 / —；无裁判正文 | TypeSafe System One；262,144 | 0.042/0；0.039–0.048，仅同入量 | 1/0；单供应商风险 |
| [Solar Decide][s] / [Upstage ZDR][se] | **否**：只有 Decisions、两字段均不列 | 只给类型化判定；不适用 | 8.97 / —；无裁判正文 | Upstage Solar Mini 4；524,288 | 0.05/0；0.046–0.058，仅同入量 | 1/0；两端点同一供应商 |

家族均不同于教师/学生 DeepSeek、GPT 预标和现裁判腾讯混元；这不证明训练数据、偏差独立。窗口写的是拟选端点，不是宣传最大值；**推断：**即使按已见最长 5,807 + 8,192 输出余量，所有固定候选窗口都有余量。

## 推荐与换裁判代价（推断）

- **主选 Qwen3 235B / Parasail。** 原卡排除了必须等待隐藏推理的模式；端点支持 strict、温度和输出上限，三个供应商有结构化能力。先固定 `provider.only`、标准 tier，`allow_fallbacks:false`。不是因为参数更多就断言判得更准。
- **备选 Qwen3-Next / DeepInfra。** 同样不依赖推理上限；端点公开吞吐更高，但 30 分钟窗口样本较少，两模型也同属 Qwen。另起受控 run，不在主选运行中自动换模型。若必须备选跨家族，先对 Mistral 的 `none` 做独立路由验证，此处不假定为硬关推理。
- **不能只改模型名。** `src/models.mjs` 目前写死/校验 `reasoning.max_tokens:16384`，未知 judge 的目录兜底也按 HY4 写。换非推理模型须让发送和守卫都省略推理字段，保留 strict/本地绑定，核对 SDK 元数据；收据记录端点、版本、实际预算/停因。由于评测身份哈希包含 `routes`、策略、源码、预登记和来源，`identityId` 会变。不要混拼新旧判决；冻结师生对话可复用，无须重生成。
- **必重跑 116 次常规裁判请求：** S1 5 格 × 3 = **15**（历史硬上限 45）；①b 全批同身份复跑 **101**（13 个原件基线 + 78 个唯一扰动 + 10 次预选第二遍；历史含恢复上限 109）。不是只补未完成的 52 个判决。合计历史额度参考 154 尝试，新身份重新预检/授权。快速方案：18 次小样若预登记即正式 S1 条件且过线，可计入其中 15 次，至 ①b 做完为 **119** 次常规；否则小样独立算，**134** 次。三个超时输入仍在同批 ①b 重跑。
- **货币代价：** 仅 116 次，主选按历史总输出约 **$1.31**，按非推理 369 token 约 **$0.072**；备选 **$1.77 / $0.071**。整个 400–500 次预算情景为主选 **$4.50–5.63 / $0.247–0.309**，备选 **$6.09–7.62 / $0.245–0.306**（历史总输出 / 仅可见）。原混元按同样的历史用量为 **$0.80–1.00**。报价不包含人审差异、失败复核或重新生成。
- 后续训练一致性、新留出泛化、harness A/B 若纳入新裁判结论，另锁同身份评分和判线；不追溯重跑首轮。**推断：**仅按首轮规模参考，分别是 15、25×2=50、10×3=30 个裁判格；第二轮 ②–④ 完整预登记**未读原文**，400–500 是本题估算口径，不是从这三项加总或授权。并行 ①c 的新题面与诊断期限不混入换模型的因果对照。

## 小样验证计划（未执行）

1. 一次验证一个固定模型/端点；用冻结的同版题面、原字、schema、180 秒截止。借旧判决比较时优先锁 v1，或另立 v2 同版双侧对照，不把题面变动算给模型。若要加理由字段，另开预登记。固定服务 tier，不回退；推断起始 `max_tokens=8192`，最终以预检和授权为准。
2. 5 格（normal、answer_dump、lecture、sycophant_close、no_teach）× 3，加 `A2-assigned-multiplier`、`R0-still-learner-origin`、`R1-student-score-cards` 各一次，共 **18** 次首尝试。主判据不靠重试过线；记录实际端点、首推理、首可见、末正文/终止时刻、finish reason、token 用量（缺报记未知）。
3. **推断验收线：** 18/18 首次在 180 秒内完整回正文，18/18 通过 schema、角色/时序/同链及门控本地校验；报全程 p90（最近秩第 17 个，建议 ≤95.0 秒）。失败留计划分母；不得拿仅成功者的 p90 冒充整批。18 个样本不是稳定性 SLA。
4. 逐次对齐 S1 的 r1/r2/r3；①b 前两个超时输入取事后同输入的合规重试作旧对照，R1 没有旧判决，单列不比。最多 **17×19=323** 个成对布尔位。报告总体和逐题一致率、门控/N/A 改变、证据引用差异；回读 A1/A2/V1/V2 错例与原预期。与旧裁判一致不等于正确，不把旧误判设成真值。

## OpenRouter 的坑

- [推理文档][rt]：`supported_parameters` 的 `reasoning` 只是对象级能力，查 `supports_max_tokens`、`supported_efforts` 和 `mandatory`。预算可能转 effort，effort 不是硬上限；`exclude:true` 只藏推理，仍可能耗输出额度及计费。
- [端点选择][pr]：`require_parameters:true` 把不支持参数的端点排除；加错 `reasoning`、`temperature`、用错 schema 形状、锁过窄或叠加策略可无路由/报错。不要关开关降级 JSON。strict 的原生/翻译/提示语义不一；37 个 nullable 槽易触发不同 grammar 限制。继续本地证据绑定，不截 JSON、不兜底分。
- [路由性能][pm]：首 token 可能是推理；阈值是排序偏好，不是截止或 SLA。HTTP 200 是响应头，流内仍可能错误或没有正文。阶段计时与实际 usage 比榜单更能验证本项目；不要拿空 usage 当 0。

## 待用户拍板

1. 要保留生成式证据契约，还是另立原生 Jev/Decide 的概率与证据抽取试验？
2. 逐题理由是否必须写进线上 JSON？若要，先锁契约及旧/新同版对照，不和换模型合并解释。
3. 是否另行授权先试主选的 18 次、确认判线和请求输出额度？未获授权不运行。

[附录：公开原件摘录、收据读数与计算](appendix.md)。仓库路径相对 `D:/Code/eduharness`；本次仅匿名 GET 公开资料并读取本地原件，不运行评测。

[q]: https://openrouter.ai/qwen/qwen3-235b-a22b-2507
[qe]: https://openrouter.ai/api/v1/models/qwen/qwen3-235b-a22b-2507/endpoints
[qm]: https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507
[qn]: https://openrouter.ai/qwen/qwen3-next-80b-a3b-instruct
[qne]: https://openrouter.ai/api/v1/models/qwen/qwen3-next-80b-a3b-instruct/endpoints
[qnm]: https://huggingface.co/Qwen/Qwen3-Next-80B-A3B-Instruct
[ps]: https://docs.parasail.io/parasail-docs/guides/structured-output
[ms]: https://openrouter.ai/mistralai/mistral-small-2603
[mse]: https://openrouter.ai/api/v1/models/mistralai/mistral-small-2603/endpoints
[mr]: https://docs.mistral.ai/inference/conversations/reasoning
[gl]: https://openrouter.ai/google/gemini-2.5-flash-lite
[gle]: https://openrouter.ai/api/v1/models/google/gemini-2.5-flash-lite/endpoints
[gt]: https://ai.google.dev/gemini-api/docs/thinking
[gf]: https://openrouter.ai/google/gemini-3.8-flash
[gfe]: https://openrouter.ai/api/v1/models/google/gemini-3.8-flash/endpoints
[c]: https://openrouter.ai/anthropic/claude-haiku-5.5
[ce]: https://openrouter.ai/api/v1/models/anthropic/claude-haiku-5.5/endpoints
[ct]: https://platform.claude.com/docs/en/build-with-claude/thinking#turning-thinking-off
[j]: https://openrouter.ai/typesafe/jev-1.14
[je]: https://openrouter.ai/api/v1/models/typesafe/jev-1.14/endpoints
[jh]: https://openrouter.ai/docs/guides/community/jev
[jr]: https://openrouter.ai/docs/guides/routing/routers/jev-router
[ar]: https://openrouter.ai/docs/guides/routing/routers/auto-router
[d]: https://openrouter.ai/docs/guides/features/decisions
[dc]: https://openrouter.ai/api/v1/models?output_modalities=decisions
[s]: https://openrouter.ai/upstage/solar-decide
[sf]: https://openrouter.ai/upstage/solar-decide-flash
[se]: https://openrouter.ai/api/v1/models/upstage/solar-decide/endpoints
[m]: https://openrouter.ai/inception/mercury-decide
[p2]: https://openrouter.ai/perplexity/pplx-decider-v1.2
[p3]: https://openrouter.ai/perplexity/pplx-decider-v1.3:free
[ex]: https://openrouter.ai/docs/guides/community/extractions
[so]: https://openrouter.ai/docs/guides/features/structured-outputs
[api]: https://openrouter.ai/api/v1/models
[rt]: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
[pr]: https://openrouter.ai/docs/guides/routing/provider-selection
[pm]: https://openrouter.ai/blog/insights/evaluate-llm-provider-performance/
[cs]: https://platform.claude.com/docs/en/build-with-claude/structured-outputs#schema-complexity-limits
[ga]: https://aistudio.google.com/docs/models/gemini-2.5-flash-lite
