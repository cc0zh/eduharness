# TeachArena 改进循环与 A/B 对照

S2 验证两侧冷启动和写入隔离。S3 复用该环境，在固定 S0-06 与尺子的前提下，连续完成至少两轮 E5。每轮用两侧公开消息说明预登记的教学动作发生了什么变化，再决定下轮基准。公开研究中，Meta-Harness 和 ADAS 有外部 Agent 修改可执行 harness 再评测的实例。Self-Harness 还演示了用同一基础模型提出改动。三者的搜索协议各有不同，TeachArena 的验收以场景卡为准。 [S2、S3 与 E5 场景卡](D:/Code/eduharness/docs/scenarios.md#s2-独立的改进环境)

## 提示词优化方法

### DSPy 与 MIPROv2

**出处**  已读 DSPy 优化器官方文档及 Opsahl-Ong 等人的论文 §4、§5、Figure 4、Table 2。 [DSPy Optimizers](https://github.com/stanfordnlp/dspy/blob/main/docs/docs/learn/optimization/optimizers.md) · [MIPRO 论文](https://arxiv.org/html/2406.11695)

**具体内容**  DSPy 按可变资产区分优化器。BootstrapFewShot 从通过指标的轨迹中收集各模块示例。MIPROv2 先收集高分轨迹，再根据程序、数据和轨迹提出各模块指令，然后用小批量评分和贝叶斯代理模型搜索指令及示例的组合。论文测试七个任务，每种方法每项任务运行五次。论文采用 500 条训练样例、500 条开发样例和至多 2,000 条测试样例，优化预算按任务折算为 20 至 50 次训练集全量评估。MIPRO 在七项中的五项超过其他基线优化器。

**对 TeachArena 的意义**  沿用“声明可变资产、从开发轨迹提出候选、用固定执行入口评测”的接口。S3 初期只试一项预登记的教师资产，避免同时搜索提示、示例和工具而无法解释消息变化。DSPy 的 proposer 可以看到数据和轨迹，TeachArena 要按角色权限提供批准的开发证据。

### TextGrad

**出处**  已读 Yuksekgonul 等人的论文 §2、§3.1、§3.3 与 Table 1。 [TextGrad 论文](https://arxiv.org/html/2406.07496)

**具体内容**  先运行计算图并评价输出，再由 LLM 生成对可编辑变量的文字批评，最后由更新步骤据此改写变量。论文 §3.3 的提示优化用批大小 3、12 轮，每轮通过验证集决定是否更新提示。§3.1 的另一个实验优化的是单题代码解。LeetCode Hard 上 GPT-4o 零样例基线完成率 26%，五轮 Reflexion 31%，五轮 TextGrad 36%，Table 1 的结果跨五个种子取平均。

**对 TeachArena 的意义**  让改进 Agent 把开发对话中的具体触发消息、教师动作和后果连到一处可改片段。文字反馈用于提出补丁，E5 的固定尺子和原件负责验收。单题代码解实验与 harness 改动是不同层级的优化。

### OPRO

**出处**  已读 Yang 等人的论文 §3、§5.1 至 §5.3。 [Large Language Models as Optimizers](https://arxiv.org/html/2309.03409)

**具体内容**  优化模型读一个元提示，其中含任务示例、历次高分指令及训练准确率。标准设置每轮给 20 条最高分历史指令和 3 条训练示例，请模型生成 8 条新指令，再评分并更新历史。GSM8K 使用始终相同的 3.5% 训练样例子集做搜索，搜索完成后才跑完整测试集。论文报告，部分表中的训练准确率比测试准确率高 5% 至 20%。

**对 TeachArena 的意义**  用版本化试验索引保存补丁、行为假设、可比结果和证据路径。下轮从本轮明确批准的原件重建上下文。S0-06 上反复看过的结果用于开发判断，另保留确认数据。

### Promptbreeder

**出处**  已读 Fernando 等人的论文 Figure 1、§3、§4。 [Promptbreeder 论文](https://arxiv.org/html/2309.16797)

**具体内容**  演化单元通常包含两条任务提示和一条变异提示。用训练集随机抽出的 100 对问答计算适应度。二元锦标赛从两名候选中选较优者，变异后替换较弱者。论文用 50 个单元，通常跑 20 至 30 代。变异提示也会变化，因此搜索策略本身参与演化。

**对 TeachArena 的意义**  如果一种提示改写反复失败，可在开发集保留几条不同解释及其失败证据。E5 仍按预登记比较一个冻结候选与一个冻结基准。保留搜索历史，避免把大量试验后的最高分当成确认结果。

## Agent 修改可执行 harness 的公开实例

### Meta-Harness

**出处**  已读 Lee 等人的论文 §3、§4.2、§4.3、Table 6、Table 7 与附录，以及作者仓库说明。 [Meta-Harness 论文](https://arxiv.org/html/2603.28052) · [官方实现](https://github.com/stanford-iris-lab/meta-harness)

**具体内容**  编码 Agent 按需读取历次候选的源代码、分数和运行轨迹，诊断失败并写新 harness，然后运行评测并归档结果。检索推理实验在 250 道搜索题上用 40 轮生成 109 个候选。作者据搜索结果选一个，冻结后在 200 道未见题上用五个模型评估，其中四个模型没有参与搜索。Table 6 的平均准确率为 38.8%，BM25 为 37.5%，无检索为 34.1%。§4.3 还评测了 TerminalBench-2 的可执行编码 Agent harness。候选在 Agent 循环前收集环境信息并加入首次提示，论文报告 Opus 4.6 的通过率为 76.4%，Terminus-KIRA 为 74.7%。该表报告完整 benchmark 的结果，独立搜索与确认的示例取自 §4.2。

**对 TeachArena 的意义**  这是外部改进 Agent 编辑可执行 harness、固定被测模型后评估候选的直接先例。可以借用按版本保存源码和证据、按需读原件的设计。S2 还要求每轮新会话、限制读写权限，并核对写入探针和首个请求。授权的历史原件由本轮请求显式列出。

### Self-Harness

**出处**  已读论文 Figure 2、§3、§4、Table 1 和 SWE-bench 配置。 [Self-Harness 论文](https://arxiv.org/html/2606.09498)

**具体内容**  同一基础模型先依据开发轨迹归并失败，再在 proposer 角色提出针对失败机制的小补丁。评测器给基准和候选都跑开发集及回归集。论文的晋升规则要求两组通过数都不下降，至少一组严格增加。通过的兼容补丁可以合并。SWE-bench Verified 实际取 100 个实例，67 个给开发诊断，33 个用于回归。每个实例在独立 Docker 环境运行。回归集的轨迹不交给 proposer，但回归分数每轮影响晋升，因此仍在选择循环内。

**对 TeachArena 的意义**  这是小补丁、固定模型、基准与候选都执行、以回归证据控制晋升的直接先例。S3 可以用另一改进 Agent 承担编辑角色。反复用于把关的回归集和只在冻结后开启的确认保留集各自登记。

### ADAS 与 Meta Agent Search

**出处**  已读 Hu 等人的论文 §3、§4.1、§4.2、Figure 1、Figure 3。 [Automated Design of Agentic Systems](https://arxiv.org/html/2408.08435)

**具体内容**  在约 100 行的基础框架上，meta agent 编写候选的 `forward` 函数。它先提出设计和代码，再做两次自反思以检查新颖性，然后在验证集运行。评估报错时最多尝试五次修订，最后将候选及指标写入档案。ARC 用 20 题搜索、60 题做独立于搜索反馈的测试，每个候选在每侧各评五次。作者在测试集报告全部发现候选的轨迹。其他四个领域的搜索各做 30 轮。

**对 TeachArena 的意义**  这是 Agent 编写可运行的编排行为并由外部评测的直接先例。它搜索新 Agent 设计，跨度大于 E5 的单项教师改动。保留每次运行、失败修订和候选来源，TeachArena 的最终保留集只为事先冻结的比较开放。

### GEPA

**出处**  已读 Agrawal 等人的论文 §3、§4、Figure 4 与算法说明。 [GEPA 论文](https://arxiv.org/html/2507.19457)

**具体内容**  抽取轨迹，包括工具调用及工具结果，随后用文字反思提出提示改写。新提示先在小批量与其祖先比较，通过后才跑用于候选选择的全量 Pareto 集。保留在至少一个实例上达到最高分的候选，并按其领先实例数加权采样。摘要报告六项任务上比 GRPO 平均高 6%，最多高 20%，所用 rollout 最多相差 35 倍。

**对 TeachArena 的意义**  提示改进有直接参考价值。一次提示改动可从消息、工具及反馈原件追到具体假设。论文也评估推理时的代码优化，那部分产物是任务代码。Pareto 集参与选择，确认保留集放在其后。

### Anthropic 长时应用开发

**出处**  已读 Anthropic 一手文章中的 “Running the harness”“Iterating on the harness” 和 “Results from the updated harness”。 [Harness design for long-running apps](https://www.anthropic.com/research/harness-design-long-running-apps)

**具体内容**  作者用同一单句游戏编辑器需求和 Opus 4.5 对照单 Agent 与完整 harness。完整侧含 planner、generator、evaluator，规划 16 个功能和 10 个 sprint。每个 sprint 先谈妥可验收行为，QA 通过 Playwright 验证，第 3 个 sprint 有 27 项标准。构建 Agent 根据反馈改应用。作者自己读 QA 日志并改 QA 提示，之后逐项移除组件。更新版改用 Opus 4.6，取消 sprint，并以另一项数字音频工作站任务展示。

**对 TeachArena 的意义**  这是相邻案例。它支持在编辑前写可观察行为，以及用真实动作复核反馈。应用内修复由 Agent 完成，外层 harness 调整由作者推动。新版示例同时改变模型、任务和编排，无法据此归因于单项 harness 改动。TeachArena 固定裁判提示和尺子，任何裁判改进另立评测身份。

### Karpathy autoresearch

**出处**  已读项目 README 与 `program.md`。 [官方 README](https://github.com/karpathy/autoresearch/blob/master/README.md) · [实验指令](https://github.com/karpathy/autoresearch/blob/master/program.md)

**具体内容**  Agent 编辑训练代码 `train.py`，运行固定五分钟的训练，用固定验证指标 `val_bpb` 决定保留或回退，记录提交、指标、峰值显存、状态和描述。README 指定人编辑 Agent 的 `program.md`。项目循环优化的是模型训练架构、超参数和算法。反复使用的验证指标参与每次选择。

**对 TeachArena 的意义**  可借鉴可编辑范围小、固定预算、保留失败记录和明确下一轮基准的流程。TeachArena 的指标有教学机会与证据要求，因此另有不可判定。autoresearch 的状态 `crash` 可启发记录失败原因，崩溃时用零占位的日志约定不适用于教学分数。

## S2 与 S3 的工程对照流程

### 预登记与未使用的保留集

**出处**  已读 Center for Open Science 对预登记、计划变更披露和数据分割的说明，以及 scikit-learn 对模型选择与外层测试的说明。 [COS 预登记指南](https://www.cos.io/initiatives/prereg) · [scikit-learn 嵌套对照说明](https://scikit-learn.org/stable/auto_examples/model_selection/plot_nested_cross_validation_iris.html)

**具体内容**  COS 建议在观察结果前固定研究计划，记录偏离原计划的变更，并使用未经分析的数据验证探索所得的假设。scikit-learn 将内部模型选择与外部评估分开，同一数据反复参与调参与评分会使性能估计偏乐观。

**对 TeachArena 的意义**  提交改动前锁定目标动作、触发机会、目标维度、不可退化项、预算、候选挑选办法和判定规则。反复用于开发的 S0-06 仍照跑，满足 E5 对固定任务的要求。若要声明可迁移性，另由操作者在开发前冻结一份确认保留集与访问权限，锁定一个候选再开启比较。保留集的任务、轨迹、分数和逐例反馈只对复核者开放。只要结果参与挑选下个候选，该分割就进入开发历史，下一次独立确认用未接触的数据。无需给 E5 增加任务，或在这份工程资料中设计任务样本。

### 两侧运行与单轮决策

**出处**  已读当前 S2、S3、E5 场景卡，当前收据实现和产物契约，以及 S2 静态设计草案。 [场景卡](D:/Code/eduharness/docs/scenarios.md) · [运行手册](D:/Code/eduharness/docs/runbook.md) · [产物契约](D:/Code/eduharness/contracts/artifacts/README.md) · [收据校验实现](D:/Code/eduharness/src/run-receipts.mjs#L141) · [S2 草案](../../s2-isolation-design.md)

**具体内容**  场景卡要求两侧独占所有可写状态、每轮冷启动、用原件核对身份与教学动作。S2 草案 §5 对 `--verify-run` 的描述已过期。当前 `src/cli.mjs` 已提供只读入口 `node src/cli.mjs --verify-run <id> --run-root <侧别根>`。它核对启动记录、请求日志、进程收据以及存在时的评测收据。隔离、manifest 身份、退出码是否为 0、教学机会和证据引用仍由复核流程分别审查。现行状态为 S1 暂缓签收，S2 待实现与验收，S3 等待 S2。

**对 TeachArena 的意义**  S2 签收后可按以下顺序执行 E5。

1. 冻结每轮输入。用只读预登记和原件哈希记录基准提交、允许改动的文件和片段、目标维度、预期教学动作及机会、不可退化项、轮次与预算上限、故障如何处理。比对学生配置、模型路由、尺子、数据、工具接口与预算。只允许预登记 harness 差异及其派生哈希，逐字段核对 manifest，并单独核对两侧 `taskId` 均为 `S0-06`。教师源码改变通常会改变 `identityId`。服务端版本无法锁定时记下限制，观察到漂移即暂不归因。
2. 分别启动 A 与 B。把基准固定在独立只读运行检出。把候选补丁审查后交给另一运行检出。各侧在开发检出之外，用私有 Git 元数据、运行根、临时目录、缓存、记忆和会话，以系统权限拒绝跨侧和受保护位置写入。复核交叉写入退出码、标记互不可见、权威原件前后哈希、首次请求和未加载旧会话的证据。照预登记从同一份输入重建两侧，固定学生配置允许实际台词随教师行为变化。
3. 回读两侧原件。记录 `round-<NN>/old/` 与 `round-<NN>/changed/` 的 run ID、退出码、收据、manifest、结果、对话、裁判及必要的调用与工具事件。通过 `--verify-run` 核对进程原件。复核者逐侧标记触发教学机会的消息和目标动作的消息，再核对目标分档与预登记中不可退化的行为。保留同档、反向分差、无机会、身份漂移和基础设施故障的真实原因。总分只作索引，教学归因由绑定的消息原件支撑。
4. 记录观察与处置。改好且达到预登记通过条件，保留候选并指定其为下一轮基准。证实改坏或触发不可退化条件，撤回候选并保留基准。两侧机会和证据齐全、但目标动作与分档没有可辨变化，记作无变化并暂不采纳。机会、必要分档、身份或原件不足，或固定复核窗口内证据冲突无法解释，记作不可判定并暂不采纳。修复运行故障后按预登记重跑规则重启，保留失败尝试。
5. 归档后再启动下一轮。每轮的 `comparison.md` 记录允许差异、消息 ID 和决定。`iterations.md` 索引至少两轮的请求与原件哈希、隔离复核、两侧路径及下一轮基准完整 SHA。下一轮用新会话和本轮批准原件启动。

三种处置是保留、撤回、暂不采纳。场景卡的观察结论仍保留改好、改坏、无变化、不可判定四类。无变化与不可判定都会暂不采纳，但两者需要不同的证据记录。
