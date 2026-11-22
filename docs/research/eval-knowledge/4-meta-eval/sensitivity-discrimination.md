# 灵敏度与区分度

## E2 是定向行为自检

**出处** `docs/scenarios.md:31–42`；`contracts/judge/README.md:30–44`；`docs/status.md:98–110,116–134`。Marco Tulio Ribeiro、Tongshuang Wu、Carlos Guestrin、Sameer Singh，*Beyond Accuracy: Behavioral Testing of NLP Models with CheckList*，ACL 2020，§2.2。[原文](https://ar5iv.labs.arxiv.org/html/2005.04118)

**具体内容** CheckList 把测试分成三类。MFT 用带已知标签的简单样例检查最低功能。INV 扰动后应保留预测，例如换地点名但保持情感。DIR 扰动后预设方向，例如加负向短句后正向情感分不能升高。后两类用输入变换前后的输出关系做 metamorphic testing。E2 预登记 4 个退化和目标维度，要求同 run 的正常格高至少 1 档，并逐项回读双方机会及行为。最新完整运行目标差 `2/1/1/2`。先前冻结组的 `verification_or_transfer` 曾 `0→0`。

**对 TeachArena 的意义** 面试可叫「定向行为测试」「已知缺陷负对照」或「类似 DIR 的对照」。E2 换了教师策略并生成独立对话，学生后续也会变，属于端到端对照。真正受控的变形测试从同一冻结对话出发，每次只改一类可核对的行为。四格共用一个正常格，不是四次独立抽样。

## 用受控的 MFT、INV 和 DIR 定位错因

**出处** Ribeiro 等（2020）§2.2、图 1。[原文](https://ar5iv.labs.arxiv.org/html/2005.04118)；`contracts/judge/schema.mjs:11–16`；`contracts/judge/README.md:24–28`。

**具体内容** 建议先做 12 对同源冻结案例，四个关键维度各 1 对 MFT、1 对 DIR、1 对 INV。MFT 示例是首答完整揭底应给 `productive_struggle=0`，即使后续有高质量提问。DIR 示例保留教师的核验提问，在学生末答用经人工核准的独立理由替换复述，预期 `verification_or_transfer` 上升至少 1 档。INV 示例只变标点、等价数学排版或寒暄，预期六个档不变。人工先读两个版本，确认上下文自洽、机会存在、目标与非目标行为是否一起变化，登记这一判断后再看裁判。

**对 TeachArena 的意义** 逐对保存关系、原文、证据 ID、命中或同档或反转、是否误动其他维、失败原因。12 对报分母及失败位置，源对话是聚类单位。MFT 失败先查分档边界，INV 失败查无关线索，DIR 失败查裁判灵敏度和编辑是否真的改变教学行为。最初这批可用于诊断。后续版本冻结另一批，避免在同一组样例上反复调整后高估命中率。

## 1 档差和地板效应用不同证据解释

**出处** `contracts/judge/README.md:11–18,27–28,39–43`；`docs/status.md:98–110,126–134`；Terwee 等（2007），*Quality criteria were proposed for measurement properties of health status questionnaires* 的地板及天花板指标。「未读原文」，本条只采用仓库事实及下列自定诊断程序。[书目](https://doi.org/10.1016/j.jclinepi.2006.03.012)

**具体内容** 0/1/2 上，1 档是最小非零变化。`1→0` 已通过本次 E2 条件，但任一侧动 1 档就可能同档。`2→0` 单侧动 1 档仍满足差至少 1。旧冻结组的核验维是 `0→0`。该次正常 #8、#9 只给出数值计算，未独立解释距离关系。这至少给出了一个低档正常对照的具体原因，单例不能估总体地板率。

**对 TeachArena 的意义** 在每维、有机会和无机会两层分别列 `n0/n1/n2`、相同分比例、0/2 反向错档和两侧原文。首轮标注后可预登记某档超过 70% 为人工检查触发点，明确它是本项目诊断线。若正常对照本身普遍无证据，先改善诊断案例覆盖。若人工稳定区分 0/1/2 而裁判仍集中在端点，优先查裁判边界和证据。若人也不区分，先修指南或该维在当前窗口的可观测性。先用现有三档验证，只有 held-out 上仍有稳定的人类可辨差异才试细分，并为新口径建立身份和基线。
