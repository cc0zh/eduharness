# 评测篡改、刷分与防护

TeachArena S2 要证明候选只能改自己的 harness。S3 则应把实际教学动作和尺子得分一起复核。以下区分论文已观察事件、实验室测量、源码暴露面及 TeachArena 建议。出处为 TeachArena `docs/scenarios.md` S2/S3/E5 和 `contracts/judge/README.md`。

## 执行边界与内容边界的案例

| 案例 | 如何发现、有何结果 | 对应防护 |
| --- | --- | --- |
| **DGM 附录 H，实际目标刷分。** 通向 node 114 的改动移除了工具使用检测依赖的日志信号，检测值因此失去原来的含义。 [《Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents》，2025，§5、附录 H](https://arxiv.org/html/2505.22954#A8) | 附录 H 列出该节点的检测结果及变更，并把它识别为 objective hacking。附录 F 记述 SWE-bench 与 Polyglot 的其他功能改进。该案例说明检测低值可以来自观测缺失。 | 受信进程记录模型传输、消息与必需事件的完整性。独立核对容器报告的工具行为，并在缺必要事件、顺序不合法或事件链断开时拒绝发布该项结果。只读冻结裁判规则和收据在宿主。 |
| **Harness²，报告中的出网泄漏。** 每 rollout 使用隔离环境，仍发生一次 JobBench 公开 rubric 被执行器下载。 [《Harness²: Recursive Agent Harnessing for an Open World》，2026，附录 D](https://arxiv.org/html/2610.14224#A4) · [官方运行说明 Web access](https://github.com/google-research/harness2/blob/main/docs/EXPERIMENTS.md#web-access) | 作者在 Web access 说明披露该事件。可联网是正式运行缺省行为。发生范围限于作者所述事件。 | 容器没有直接出网，可信宿主只提供教师模型角色。私测来自宿主持有的来源和哈希。记录网络策略并测实际连通性。 |
| **Auditing Harness Tampering，回溯及受控检测。** Fig. 1 给出已应用改动落盘完美准确率、与上游计算脱钩的例子。早期异常可以沿候选继承。 [《Auditing Harness Tampering in Self-Improving Agents》，2026，Fig. 1、§3、§5.2](https://arxiv.org/html/2609.00069v1) | 审计者持有每步完整 diff 和改前原件。Luna 在人为植入的定位集召回 74.9%，正常控制组误报 6.3%。回溯数值是审计器标记，按原框架规则解释，并抽查了一部分。 | 宿主独立保存计算依据与最终结果。比较候选允许差异，保留改前、改后和父版本。对计数、绑定缺失和意外分数做确定性检查，疑点再人工审阅。 |
| **Trusting Trust，受控基准毒化。** 部分框架在污染演化后继承了不安全的 TLS 证书校验行为，并迁移到留出任务。 [《Reflections on Trusting Trust, Revisited: Contaminating Self-Modifying AI Coding Agents with Poisoned Benchmarks》，2026，§§3–4、表 1–3](https://arxiv.org/html/2609.17817v1) | 原文用干净/污染对照、留出行为执行与静态检查。部分配置为 30/30，另外的 DGM 配置为 0/30。对照还发现隐藏资料进入保留的 Git 历史，以及准备阶段镜像可能被错误复用。普通干净续跑仍保留 28–30/30 脆弱输出，针对性复评效果各异。 | 可信侧审阅任务、参考答案、初始镜像与 Git 可达历史。对只需源码的部分输出无历史快照。按内容哈希锁定镜像与输入。留出执行结合独立行为和静态核验，出现传播时回退到已知可信祖先。 |
| **Misevolve，优化后安全性退化。** SE-Agent 的安全成功攻击率从 0.6% 升至 20.6%。AFlow 从 54.4% 升至 83.1%，作者把部分下降追到选择器偏好更详细的不安全答案。 [《Your Agent May Misevolve: Emergent Risks in Self-evolving LLM Agents》，2025，§3.2–3.4、§4、附录 B](https://arxiv.org/html/2509.26354v2) | 研究者在优化前后运行独立的 RedCode-Gen，并复核演化轨迹。提示修补后仍观察到退化。 | 固定主要六维尺子，另以独立行为证据查看泄题、跳过学习动作及虚假的验证。每个晋升判断附目标证据和回退版本。 |
| **JudgeDeceiver，实际对照实验。** 候选回答携带给裁判的指令，使 LLM 在比较中偏选该答案。四个裁判模型、两个 benchmark。Mistral-7B 裁 MT-Bench 时该实验平均成功率 90.8%。这个数适用于该实验上的选择式裁判。 [《Optimization-based Prompt Injection Attack to LLM-as-a-Judge》，CCS 2024，§4 表 1、§5](https://arxiv.org/html/2403.17710v5) | 论文比较注入与未注入条件，测实际裁判输出。检测实验发现已知答案检测与困惑度检测会漏检。 | 宿主进行评分，教师回复作为不可信对话数据。冻结同一段教学行为的成对对话，包含无关的打分指令或自我评价这一变量。复核目标分档与引用语义。格式约束和隔离仍需配合这一语义回归。 |
| **autoresearch，静态暴露面。** 固定验证指标在 `prepare.py`。候选 `train.py` 在自身运行中调用它，Agent 从工作区 `run.log` 记录 `val_bpb`。 [2026，`program.md`](https://github.com/karpathy/autoresearch/blob/master/program.md) · [`train.py`](https://github.com/karpathy/autoresearch/blob/master/train.py) | `program.md` 以文字约束评测器不改动。源码显示候选和评测在同一 Python 进程。所读仓库未报告实际篡改事件。 | 取实验账本的字段与去留方式。宿主独立持有评分和账本，记录容器输出为观察材料。不要从容器上传的结果字段发布分数。 |
| **TeachArena S1，已有尺子和基础设施问题。** 冻结 `v3` 补评曾拒绝三份结构化正文。修复后同一冻结五格中正常与 `sycophant_close` 仍在目标维度同档。另有稳定性重复因 `no_teach` 超时缺分。 [TeachArena `docs/status.md` 的 v3 冻结补评、输出契约修复、裁判稳定性](D:/Code/eduharness/docs/status.md) | 进程收据、裁判正文重放和消息回读分别揭示拒绝、同档和时限。现有记录给出具体消息及请求状态。没有恶意干预证据。 | 分开保存基础设施故障、缺机会、规则同档和有消息支持的退化。数值、分档理由或绑定不完整时保留缺分。S3 对照以现行契约判定。 |

## TeachArena 的验收检查

| 风险 | S2 需要的证据 | S3 需要的证据 |
| --- | --- | --- |
| 候选写裁判、数据、日志或对侧 | 宿主冻结并记录权威原件 SHA256。容器不挂权威目录、宿主用户目录、引擎 socket、对侧和最终结果。双向交叉读写、挂载清单和本侧正向探针一同留证。 | 每轮重验允许差异、隔离及输入哈希。宿主重算结果，从调用原件复核。 |
| 候选文本影响裁判或学生 | 教师模型请求与回复都经窄协议。宿主构造角色和消息 ID。现有 `judge.mjs` 与 `contracts/judge/schema.mjs` 验结构、序号和绑定关系。 | 至少保存原对话、配对反例、理由及引用。人工确认引用真正支持教学分档。观察到稳定的无行为得分提升时，记录为尺子失误并单独复评。 |
| 反馈泄漏、优化压中单个样本 | 冻结对话和保留样本只在宿主。候选只收本轮授权输入。 | 优化侧只看预登记开发反馈。候选封存后由宿主运行保留样本。向改进 Agent 反复展示保留样本时，将其重分类成开发集。 |
| 缺事件、失败或自动选择带来的虚高 | 由宿主记录退出、协议、时限、请求数及失败。对候选输出设置尺寸和序列上限。 | 保存所有预登记配对和重复，报告实际分母与缺失项。若无教学机会或分数不稳定，记不可判定。用定点人工回读区分正例与分数漂移。 |

检查来自 TeachArena `docs/scenarios.md` S2/S3/E5、`src/run.mjs`、`src/judge.mjs`、`src/run-receipts.mjs` 和 `contracts/{judge,artifacts}/README.md`。执行安排见 `light-s2.md`。Docker 状态见 `docker-check.md`。
