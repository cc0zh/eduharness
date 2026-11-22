# 证据绑定与结构化输出

## 1. 宿主用短序号定位，保留原始消息身份

**出处** `src/judge.mjs:3–15`、`contracts/judge/schema.mjs:19,46–87,118–191`、`contracts/judge/README.md:22–28`，以及 [`ruler-old-vs-new.md`](../../ruler-old-vs-new.md) 的「方法和证据逐项对照」。

**具体内容** 宿主为公开对话生成 `{n,role,text}`，编号从 1 开始，记录 `viewHash` 和按顺序排列的 `messageIds`。每个证据序号字段是非空整数数组，最大值为窗口消息数。`n` 由本地 `view.messages[n-1].id` 解析。随后检查观察槽角色、去重、严格时序、组间不重叠和满分支持链。旧版要求模型回显完整消息 ID 和上下文身份。新契约由宿主保存长 ID 与视图散列，模型只选当前窗口里的编号。

**对 TeachArena 的意义** 可回答「长 ID 被模型乱填怎么办」。以四轮含初始学生消息的 9 条窗口为例，裁判只需输出 1–9。一基 `#7` 通过冻结顺序指到唯一原始 ID。改变消息顺序后必须使用对应的新绑定。散列可核对归属，角色和顺序可排除部分坏引用，实际消息是否支持该档仍须回读。

## 2. ALCE 用局部短编号，并区分能定位和能支持

**出处** Tianyu Gao、Howard Yen、Jiatong Yu、Danqi Chen，*Enabling Large Language Models to Generate Text with Citations*，EMNLP 2023，§3.3、§4、附录 H。[论文原文](https://arxiv.org/html/2305.14627)

**具体内容** 输入提示标 `Document [1](Title: ...)`，输出允许一个主张带 `[1][2]`。Citation recall 对每条陈述把其引用段落合并为前提，使用 TRUE 检查是否蕴含陈述，按 0/1 在陈述上取均值。Citation precision 按引用检查贡献并求均值。编号可解析和证据蕴含是两道检查。

**对 TeachArena 的意义** 这是短编号引用的公开先例。ALCE 的单位是检索段落，TeachArena 是冻结对话消息。先确定 `#N` 确实解析到该视图，再回读「独立推理」「误解修复」这样的行为判断。TRUE 的文本蕴含做法提供了验证层次的参考，不能直接充当教学分档验证器。

## 3. Claude API 由宿主取回原文

**出处** Anthropic Claude Platform Docs，*Citations*，文本引用结构和「Citations and structured outputs are incompatible」。[官方文档](https://platform.claude.com/docs/en/build-with-claude/citations)

**具体内容** 原文示例中 `document_index: 0`、`start_char_index: 0` 对应 `cited_text: "The grass is green. "`。API 按定位字段提取原文，保证位置合法。文档写明其原生 Citations 与 strict structured outputs 的响应模式不能同用。

**对 TeachArena 的意义** 模型返回编号，宿主从冻结 transcript 提取想展示的引文，可避免模型手抄造成的错引。需要句内跨度时再增加本地偏移校验。保留现有 JSON 输出契约即可做到消息级原文回读。

## 4. strict schema 和本地校验分别负责什么

**出处** OpenRouter *Structured Outputs* 的 Model Support 与 Best Practices，`contracts/judge/schema.mjs:21–23,46–87,145–191`、`src/judge.mjs:11–15`、`docs/status.md:63–94`、`docs/judge-structured-output.md:9–18`。[官方文档](https://openrouter.ai/docs/guides/features/structured-outputs)

**具体内容** Chat Completions 发送 `response_format.type=json_schema`、`json_schema.strict=true`。OpenRouter 建议 `provider.require_parameters=true`，并说明各端点的严格程度和支持功能不同。本地 `JSON.parse` 后检查结构，然后要求 `reason` 去首尾空白至少 12 字符、有字母、包含至少一个 `#N`，每个匹配到的 `#N` 都属于该维的 `evidence`。历史冻结补评三份 HTTP 200 正常结束的 JSON 均给出数字理由，如 `agency_handoff.reason="1"`，三次被拒，未发布分数。较早的重放记录还拒绝了尾随逗号、顶层维度错位和没有可见正文。生产拒绝任一维 `null`。`reason` 的自报 `evidence` 校验后即删除，发布用的 `evidence` 从证据组另行生成，目前无交叉校验。

**对 TeachArena 的意义** 可给回归加入「理由引 #3，自报 `[3]`，证据组只绑定 #4、#5」的样例。候选规则是对一般档位明确理由证据与该维证据组的关系，并为 `representation_pivot` 无机会且无观察槽的情形明确证据来源。首答揭底引用首个实质教师消息目前是提示要求，也适合单独检查。即使引用通过，仍需检查所引用行为是否支持理由和档位。

## 5. 机会槽描述的是可见机会，代码只校验最低观察条件

**出处** `contracts/judge/schema.mjs:145–182`、`contracts/judge/README.md:24–28,41–44`、`docs/status.md:45–57`。

**具体内容** `observed`、`not_observed`、`not_applicable`、`insufficient_information` 是四种槽状态。`not_observed` 要求机会消息本身或之后存在预期角色的发言。现行 `not_applicable` 仅限 `representation_pivot` 且计 0。`no_teach` 的 #1 暴露 AE 与垂距混淆，#2 只有鼓励，#3 仍问是否为 5。这三个位置可说明实际存在修复机会及教师如何回应。

**对 TeachArena 的意义** 对「有发言，但无明确误解」和「学生已经明确误解，教师只鼓励」各建一个边界例。机会是语义条件。仅检查预期角色随后发言，不能凭此区分两例。可以先把机会判断留在额外诊断，改变计分或资格时再更新契约和身份。
