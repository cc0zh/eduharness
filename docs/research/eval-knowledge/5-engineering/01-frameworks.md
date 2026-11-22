# TeachArena 评测工程参考：九个框架

本文核对九个框架如何绑定模型和裁判、保留复现证据、控制并发与费用，以及处理超时和重试。依据为本次读取的官方文档和公开源码。`main` 链接指向移动分支，文中默认值限于所查实现。未启动评测或调用模型。未核实的行为逐项标出。

TeachArena 当前用 Node.js、pi/pi-ai 和 OpenRouter。`src/models.mjs` 是模型调用边界。真实运行和 `--judge-only` 都要求干净工作区及当前 HEAD 的 `npm run check` 收据。`--judge-only` 读取冻结对话，新 run 记录源身份和哈希。S2 要求两侧独立可写根，S3 在验收条件满足后才做逐轮对照。本文讨论可借用的做法。项目依据见 [README](D:/Code/eduharness/README.md) 和 [运行手册](D:/Code/eduharness/docs/runbook.md)。

## 1. Inspect AI

### 出处

[Tasks](https://inspect.aisi.org.uk/tasks.html)、[Datasets](https://inspect.aisi.org.uk/datasets.html)、[Models](https://inspect.aisi.org.uk/models.html)、[Scorers](https://inspect.aisi.org.uk/scorers.html)、[Options](https://inspect.aisi.org.uk/options.html)、[Eval logs](https://inspect.aisi.org.uk/eval-logs.html)、[Log API](https://inspect.aisi.org.uk/reference/inspect_ai.log.html)、[Sandboxing](https://inspect.aisi.org.uk/sandboxing.html)、[Caching](https://inspect.aisi.org.uk/caching.html)。

### 具体内容

- **数据模型与裁判。** `Task(dataset, solver, scorer)` 组合数据、生成或 Agent 执行和评分。`Sample` 要求 `input`，可带 `target`、`id`、`metadata`。`EvalLog` 保存 `eval`、`status`、`results`、`stats`、`samples`，单样本的 `messages` 与 `events` 记录消息及运行事件。`get_model(role="grader")` 可绑定 `--model-role grader=…` 和独立生成参数。角色未显式设置时，查询会返回本评测的默认模型。[Tasks](https://inspect.aisi.org.uk/tasks.html) · [Datasets](https://inspect.aisi.org.uk/datasets.html) · [Log API](https://inspect.aisi.org.uk/reference/inspect_ai.log.html#evalsample) · [Models](https://inspect.aisi.org.uk/models.html)
- **可复现性。** `inspect score` 重评旧日志，`eval_retry(log, …)` 可复用已完成样本。日志按样本组织事件。支持的非批处理 provider 会在 `ModelEvent.request_ids` 记录各次 HTTP 尝试。默认只记录每模型前几次和出错调用的原始请求及响应。`--log-model-api` 扩展到全部。[Eval logs](https://inspect.aisi.org.uk/eval-logs.html)
- **并发与费用。** Models 页给出静态连接限制 `max_connections` 的默认值 10。日志文档说明默认模式采用 adaptive connections，并发样本上限 `max_samples` 跟随当前连接上限。日志保留输入、输出 token 用量。连接数和 token 记录各自解决吞吐与事后核算，本次未核实可用的发送前总费用预留策略。[Models](https://inspect.aisi.org.uk/models.html) [Eval logs](https://inspect.aisi.org.uk/eval-logs.html)
- **超时与重试。** `--max-retries` 文档默认无限，`--timeout` 默认无总生成时限。`--attempt-timeout` 限制单次生成尝试。指定 `--stream-idle-timeout` 时，支持的流式 provider 在连续无块后放弃本次尝试，并按重试与总时限继续。流打开前的等待仍需要单次生成时限。[Options](https://inspect.aisi.org.uk/options.html) [Models](https://inspect.aisi.org.uk/models.html)
- **沙箱与缓存。** sample、task、evaluation 可声明 sandbox，`sandbox="docker"` 把 `sandbox()` 操作放进 Docker。模型响应缓存可用 `GenerateConfig(cache=True)`，默认保存一周。键含模型名、base URL、构造参数、消息、epoch、生成配置、工具与 tool choice。复用响应须与新 trial 区分。[Sandboxing](https://inspect.aisi.org.uk/sandboxing.html) · [Caching](https://inspect.aisi.org.uk/caching.html)

### 对 TeachArena 的意义

借用显式模型角色、独立重评和逐尝试请求证据。固定裁判必须写进评测身份，以免缺参落到教师模型。维持 TeachArena 已有的调用级重试上限，并分别记录单次 deadline、provider 中断和流停顿。S2 的文件隔离仍由两侧可写根保证。

## 2. OpenAI Evals 与 graders

### 出处

[托管 Evals 指南](https://developers.openai.com/api/docs/guides/evals.md)、[Graders 指南](https://developers.openai.com/api/docs/guides/graders.md)、[OpenAI Node Evals Runs 类型](https://github.com/openai/openai-node/blob/main/src/resources/evals/runs/runs.ts)、[OpenAI Node SDK](https://github.com/openai/openai-node#retries)、[开源 `evals/eval.py`](https://github.com/openai/evals/blob/main/evals/eval.py)、[开源 `ModelBasedClassify`](https://github.com/openai/evals/blob/main/evals/elsuite/modelgraded/classify.py)、[开源 `oaieval` CLI](https://github.com/openai/evals/blob/main/evals/cli/oaieval.py)、[开源 API helper](https://github.com/openai/evals/blob/main/evals/utils/api_utils.py)。

### 具体内容

- **模型与裁判。** 托管 Evals 分开定义 `data_source` 与评分条件。Graders 有 string check、text similarity、模型打分等类型。模型打分的 `range` 会裁切分数，非数字结果默认给 0。开源版 `ModelBasedClassify` 把最后一个 `completion_fn` 分给裁判。[Graders 指南](https://developers.openai.com/api/docs/guides/graders.md) [开源 `ModelBasedClassify`](https://github.com/openai/evals/blob/main/evals/elsuite/modelgraded/classify.py)
- **可复现性。** 托管 Runs 类型区分 `CreateEvalJSONLRunDataSource` 与由模型生成输出的来源，生成参数有可选 `seed`。开源 CLI 的 `--seed` 默认 `20220722`，每样本随机数由样本 ID 与 seed 派生。随机种子是请求和编排证据，provider 输出的可重复性未验证。[Runs 类型](https://github.com/openai/openai-node/blob/main/src/resources/evals/runs/runs.ts) [开源 `eval.py`](https://github.com/openai/evals/blob/main/evals/eval.py) [开源 CLI](https://github.com/openai/evals/blob/main/evals/cli/oaieval.py)
- **并发与费用。** 开源 `eval.py` 的 `EVALS_THREADS` 默认 10。CLI 从采样事件汇总 token 用量。托管 Runs 返回 `per_model_usage`。未核实托管 worker 并发默认值或每次发送前硬预算。[开源 `eval.py`](https://github.com/openai/evals/blob/main/evals/eval.py) [开源 CLI](https://github.com/openai/evals/blob/main/evals/cli/oaieval.py) [Runs 类型](https://github.com/openai/openai-node/blob/main/src/resources/evals/runs/runs.ts)
- **超时与重试。** OpenAI Node SDK 的 HTTP 请求默认超时 10 分钟，默认重试 2 次，包含超时请求。开源 `api_utils.py` 声明 `EVALS_THREAD_TIMEOUT` 默认 40，另有 `create_retrying` 指数退避 helper。本次未核实该常量和 helper 对所有开源适配器的覆盖，也未核实托管 worker 单题的 deadline 或重试策略。[OpenAI Node SDK](https://github.com/openai/openai-node#retries) [开源 API helper](https://github.com/openai/evals/blob/main/evals/utils/api_utils.py)

### 对 TeachArena 的意义

用冻结对话作为独立评分输入，并分别记录生成方与 grader 的身份。TeachArena 裁判遇到非数字、截断或结构错误时保留失败与原件。与 OpenAI score model grader 对接时，必须避免把它的默认 0 当作有效教学分。Node SDK 默认值不适用于 pi 的 OpenRouter 路径，后者应按现有遥测核对。

## 3. lm-evaluation-harness

### 出处

[CLI interface](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/interface.md)、[Task guide](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/task_guide.md)、[`api_models.py`](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/lm_eval/models/api_models.py)、[`openai_completions.py`](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/lm_eval/models/openai_completions.py)。

### 具体内容

- **数据模型与裁判。** Task YAML 用 `doc_to_text`、`doc_to_target` 将数据行映射为输入和目标，`output_type` 决定生成或似然接口，`metric_list` 指定指标。CLI 用 `--model` 与 `--model_args` 选被测模型。任务可用 `process_results` 处理输出。独立 LLM 裁判角色及默认 provider 未核实。[CLI interface](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/interface.md) · [Task guide](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/task_guide.md)
- **可复现性。** `--seed` 默认 `0,1234,1234,1234`，对应 Python、NumPy、PyTorch 和 few-shot。`--cache_requests` 缓存预处理请求，`--use_cache` 缓存模型响应，两者有不同复现含义。`--log_samples` 保存输入和输出，`--predict_only` 保存预测并跳过指标。[CLI interface](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/interface.md)
- **并发与费用。** API model 的 `num_concurrent=1`，设为大于 1 才启用该并发路径。本次未核实跨模型 USD 核算和 run 级硬预算。`--limit` 限样本量，单样本的调用次数由任务决定。[`api_models.py`](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/lm_eval/models/api_models.py) [CLI interface](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/interface.md)
- **超时与重试。** `TemplateAPI` 参数默认 `timeout=300` 秒，`max_retries=3`。Tenacity 使用 `stop_after_attempt(self.max_retries)` 与 `wait_exponential`，这里的 3 包含首次尝试。默认只归于所查 API model 实现。[`api_models.py`](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/lm_eval/models/api_models.py)

### 对 TeachArena 的意义

把请求构造的可重复性与冻结响应的可回读性分别写进收据。可参考 `--predict_only` 的产物分界来检视现有 judge-only 输入，保留 TeachArena 自有对话和事件 schema。预算报告写明 `attempts` 是否包含首次调用，避免把同名 `max_retries` 的值直接移植。

## 4. promptfoo

### 出处

[配置参考](https://www.promptfoo.dev/docs/configuration/reference/)、[Model-graded assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/)、[OpenRouter provider](https://www.promptfoo.dev/docs/providers/openrouter/)、[CLI](https://www.promptfoo.dev/docs/usage/command-line/)、[`providers/shared.ts`](https://github.com/promptfoo/promptfoo/blob/main/src/providers/shared.ts)、[`util/fetch/index.ts`](https://github.com/promptfoo/promptfoo/blob/main/src/util/fetch/index.ts)。

### 具体内容

- **数据模型与裁判。** Test case 的 `vars` 传入 prompts，`assert` 定义输出检查，`providers` 绑定被测模型。`llm-rubric` 使用模型评分，可用 `--grader`、`assertion.provider` 或 `defaultTest.options.provider` 选裁判。文档指出某些断言在缺少显式配置时也会考虑 `defaultTest.provider`。OpenRouter 有专用 provider。[Test Case](https://www.promptfoo.dev/docs/configuration/reference/#test-case) · [Model-graded assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/) · [OpenRouter provider](https://www.promptfoo.dev/docs/providers/openrouter/)
- **可复现性。** `evaluateOptions.cache` 默认 `true`，`filterSampleSeed` 固定抽样选择。抽样 seed 与磁盘命中都是可记录的运行参数。缓存命中的条目没有本轮的新 provider 响应证据。[配置参考](https://www.promptfoo.dev/docs/configuration/reference/)
- **并发与费用。** `evaluateOptions.maxConcurrency` 默认 4。OpenRouter provider 默认用响应 `usage.cost` 记账，配置参考还说明部分 provider 支持价格覆盖。本次未核实付费前原子预留额度或覆盖所有断言的硬预算。[配置参考](https://www.promptfoo.dev/docs/configuration/reference/) [OpenRouter provider](https://www.promptfoo.dev/docs/providers/openrouter/)
- **超时与重试。** `evaluateOptions.timeoutMs` 默认 `0`，设置后超出的测试会标记 error。provider 通用 `getRequestTimeoutMs()` 从 `REQUEST_TIMEOUT_MS` 读取，默认 `300_000` 毫秒。`util/fetch/index.ts` 对匹配的暂时性 HTTP 错误有指数退避，可由 `maxRetries: 0` 的上下文关闭对应重试。未核实每个 provider 路径的合成尝试数。[配置参考](https://www.promptfoo.dev/docs/configuration/reference/) [`providers/shared.ts`](https://github.com/promptfoo/promptfoo/blob/main/src/providers/shared.ts) [`util/fetch/index.ts`](https://github.com/promptfoo/promptfoo/blob/main/src/util/fetch/index.ts)

### 对 TeachArena 的意义

Node 与 OpenRouter 的同类用法适合作为配置参考。记录本次是否实际发送、provider 是否提供 `usage.cost`、以及费用来自响应还是估算。单线程和并发试验应使用各自的运行根，并保留同一授权额度下每次发送前的预算预留。

## 5. DeepEval

### 出处

[G-Eval](https://deepeval.com/docs/metrics-llm-evals)、[Evaluation flags and configs](https://deepeval.com/docs/evaluation-flags-and-configs)、[`evaluate/configs.py`](https://github.com/confident-ai/deepeval/blob/main/deepeval/evaluate/configs.py)、[`config/settings.py`](https://github.com/confident-ai/deepeval/blob/main/deepeval/config/settings.py)、[`models/retry_policy.py`](https://github.com/confident-ai/deepeval/blob/main/deepeval/models/retry_policy.py)。

### 具体内容

- **数据模型与裁判。** `LLMTestCase` 有 `input`、`actual_output`、`expected_output`、`tools_called` 等字段，metric 选用所需字段。`GEval.model` 可指定模型名或 `DeepEvalBaseLLM`，所查文档给出默认 `gpt-5.4`。`ConversationalGEval` 读取多轮历史并输出对话分数和理由。自定义模型可用 `a_generate_raw_response` 返回响应与费用。[Test Cases](https://deepeval.com/docs/evaluation-test-cases) · [G-Eval](https://deepeval.com/docs/metrics-llm-evals)
- **可复现性。** 显式 `evaluation_steps` 跳过根据 `criteria` 临时生成步骤的调用。`CacheConfig.write_cache=True`，`use_cache=False`。固定步骤可以固定送入裁判的指令，也省下一段生成。由此无法推断裁判会逐字复现分数和理由。[G-Eval](https://deepeval.com/docs/metrics-llm-evals) [`evaluate/configs.py`](https://github.com/confident-ai/deepeval/blob/main/deepeval/evaluate/configs.py)
- **并发与费用。** `AsyncConfig` 默认 `run_async=True`、`max_concurrent=20`、`throttle_value=0`，控制并发 test case。自定义模型接口能传回费用，整体费用硬上限与任意适配器的记账完整性未核实。[G-Eval](https://deepeval.com/docs/metrics-llm-evals) [`evaluate/configs.py`](https://github.com/confident-ai/deepeval/blob/main/deepeval/evaluate/configs.py)
- **超时与重试。** settings 的 `DEEPEVAL_RETRY_MAX_ATTEMPTS=2` 含首次调用。`DEEPEVAL_PER_TASK_TIMEOUT_SECONDS_OVERRIDE` 与 `DEEPEVAL_PER_ATTEMPT_TIMEOUT_SECONDS_OVERRIDE` 分别控制外层与单次尝试。未核实对自定义模型和 provider SDK 内部重试同时启用时的总发送次数。[`config/settings.py`](https://github.com/confident-ai/deepeval/blob/main/deepeval/config/settings.py) [`models/retry_policy.py`](https://github.com/confident-ai/deepeval/blob/main/deepeval/models/retry_policy.py)

### 对 TeachArena 的意义

借用固定 `evaluation_steps` 的原则，把评分步骤、裁判可见字段和预算放入同一评测身份。继续要求裁判为各维度、教学周期和机会窗口提供可读回的消息 ID。整体对话分数可作诊断参考，现有证据契约仍承担验收判定。

## 6. Ragas

### 出处

[Aspect critique](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/aspect_critic/)、[`evaluate()` 参考](https://docs.ragas.io/en/stable/references/evaluate/)、[RunConfig](https://docs.ragas.io/en/stable/references/run_config/)、[`run_config.py`](https://github.com/explodinggradients/ragas/blob/main/src/ragas/run_config.py)、[`executor.py`](https://github.com/explodinggradients/ragas/blob/main/src/ragas/executor.py)。

### 具体内容

- **数据模型与裁判。** `EvaluationDataset` 接收 `SingleTurnSample` 或 `MultiTurnSample`，后者的 `user_input` 可含 human、AI 和 tool 消息。Aspect critique 文档将 `llm_factory("gpt-4o-mini", client=client)` 作为传给 `DiscreteMetric` 的模型示例，用 aspect 和 `strictness` 配置。`evaluate()` 参考将该入口标为弃用，以下 `RunConfig` 行为归于查到的路径。[Schemas](https://docs.ragas.io/en/stable/references/evaluation_schema/) · [Aspect critique](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/aspect_critic/) · [`evaluate()`](https://docs.ragas.io/en/stable/references/evaluate/)
- **可复现性。** `RunConfig.seed=42` 初始化 `np.random.default_rng`。冻结 metric 定义和输入仍需运行方记录。未核实该 seed 向每个生成 provider 的传递，也未核实新版 metric 的端到端确定性。[`run_config.py`](https://github.com/explodinggradients/ragas/blob/main/src/ragas/run_config.py)
- **并发与费用。** 所查 `RunConfig.max_workers=16`，`executor.py` 用它限制 job 执行。旧 `evaluate()` 的 `token_usage_parser` 默认 `None`，该入口此时不算成本和总 token。更高 `strictness` 的具体调用增量未核实。[`executor.py`](https://github.com/explodinggradients/ragas/blob/main/src/ragas/executor.py) [`evaluate()` 参考](https://docs.ragas.io/en/stable/references/evaluate/)
- **超时与重试。** `RunConfig` 默认 `timeout=180` 秒、`max_retries=10`、`max_wait=60` 秒。Tenacity 用 `stop_after_attempt`，10 含首次尝试。`evaluate()` 默认 `raise_exceptions=False`，失败行给 `np.nan`。未核实每个新旧 adapter 是否在相同层执行 `timeout`。[RunConfig](https://docs.ragas.io/en/stable/references/run_config/) [`run_config.py`](https://github.com/explodinggradients/ragas/blob/main/src/ragas/run_config.py) [`evaluate()` 参考](https://docs.ragas.io/en/stable/references/evaluate/)

### 对 TeachArena 的意义

沿用当前区分方式，将缺用量标为未知，将失败裁判保留为故障，将缺少一侧证据的对照差异标为 `null`。若评估后续的自一致性方案，预算需要纳入每个裁判样本的重复次数，且该变更应获得自己的评测身份。

## 7. Braintrust

### 出处

[Run in code](https://docs.braintrust.dev/evaluate/run-in-code.md)、[Trace LLM calls](https://docs.braintrust.dev/instrument/trace-llm-calls.md)、[Compare experiments](https://docs.braintrust.dev/evaluate/compare-experiments.md)、[TS `framework.ts`](https://github.com/braintrustdata/braintrust-sdk/blob/main/js/src/framework.ts)。

### 具体内容

- **数据模型与裁判。** TS `Eval` 分设 `data`、`task` 与 `scores`。案例由 `input`、`expected` 等字段组成，task 产生实际输出，scorer 接收相应数据。模型由 task 或 scorer 代码选择。源码导出可选的 `defaultErrorScoreHandler`，它会给没运行的 scorer 记 0。调用路径只在配置 `errorScoreHandler` 后才调用对应 handler。[Run in code](https://docs.braintrust.dev/evaluate/run-in-code.md) · [TS `framework.ts`](https://github.com/braintrustdata/braintrust-sdk/blob/main/js/src/framework.ts)
- **可复现性。** 文档用 `metadata` 记模型和 prompt 版本，用 `trialCount` 做重复样本。SDK 可显式指定 `baseExperimentId`。比较页对齐基线与候选的用例并展示差异。未核实平台数据集快照 API 的默认版本选择。[Run in code](https://docs.braintrust.dev/evaluate/run-in-code.md) [Compare experiments](https://docs.braintrust.dev/evaluate/compare-experiments.md) [TS `framework.ts`](https://github.com/braintrustdata/braintrust-sdk/blob/main/js/src/framework.ts)
- **并发与费用。** TypeScript 和 Python 的 `maxConcurrency` 默认不设上限，文档建议显式设置以控制 429 和连接数。支持的 provider 自动埋点记录 token 与费用。未核实 pi/OpenRouter 埋点覆盖或逐次尝试的硬预算预留。[Run in code](https://docs.braintrust.dev/evaluate/run-in-code.md) [Trace LLM calls](https://docs.braintrust.dev/instrument/trace-llm-calls.md)
- **超时与重试。** TS evaluator 的 `timeout` 默认 `undefined`，设 0 会立即到期。超时跳过未启动 trial，abort task hook 的 `signal`，并等待进行中的任务。忽略 signal 的工作可拖过时限。未核实通用 scorer 或 provider 重试默认策略。[TS `framework.ts`](https://github.com/braintrustdata/braintrust-sdk/blob/main/js/src/framework.ts)

### 对 TeachArena 的意义

参考 `baseExperimentId` 与逐用例差异组织 S3 报告。对照任务先验证双方收据、评测身份和场景，再读各自目录的证据。测试取消信号时要查真实 HTTP 发请求的边界，并继续把未评分与零分区分开。

## 8. LangSmith

### 出处

[Evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts.md)、[Evaluate an LLM application](https://docs.langchain.com/langsmith/evaluate-llm-application)、[Evaluate an existing experiment](https://docs.langchain.com/langsmith/evaluate-existing-experiment.md)、[Manage datasets](https://docs.langchain.com/langsmith/manage-datasets)、[Evaluator spend](https://docs.langchain.com/langsmith/evaluator-spend.md)、[JS `_runner.ts`](https://github.com/langchain-ai/langsmith-sdk/blob/main/js/src/evaluation/_runner.ts)、[JS `client.ts`](https://github.com/langchain-ai/langsmith-sdk/blob/main/js/src/client.ts)。

### 具体内容

- **数据模型与裁判。** Dataset 的 Example 持有 inputs、reference outputs 和 metadata。`evaluate` 接收 target 与 evaluators。跑过的实验可按名字或 ID 添加 evaluators，读取原实验的输入、输出与已记录的中间步骤。通用自定义 evaluator 的模型由实现决定，托管模型默认值未核实。[Evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts.md) · [Evaluate an existing experiment](https://docs.langchain.com/langsmith/evaluate-existing-experiment.md)
- **可复现性。** 数据集按变更时间生成版本，可用 tag 固定基准。JS `numRepetitions` 能重复样本，实验记录可附模型和 prompt 版本的 metadata。基于原 trace 的重评只见已捕获字段。[Manage datasets](https://docs.langchain.com/langsmith/manage-datasets) [JS `_runner.ts`](https://github.com/langchain-ai/langsmith-sdk/blob/main/js/src/evaluation/_runner.ts) [Evaluate an LLM application](https://docs.langchain.com/langsmith/evaluate-llm-application)
- **并发与费用。** JS 有 `maxConcurrency`，并可单设 `targetConcurrency` 与 `evaluationConcurrency`。托管 evaluator 的周费用限制覆盖已配置价格的支持模型，按完成后记账，进行中的请求可略超。这项文档未给出对 TeachArena 的 OpenRouter 路由和本地 `evaluate()` 的相同保障。[JS `_runner.ts`](https://github.com/langchain-ai/langsmith-sdk/blob/main/js/src/evaluation/_runner.ts) [Evaluator spend](https://docs.langchain.com/langsmith/evaluator-spend.md)
- **超时与重试。** JS `Client` 中 `timeout_ms` 默认 `90_000`，普通和批量 ingest 的 `AsyncCaller` 默认参数是 `maxRetries: 4`。这些控制和 LangSmith 服务通信。target 与自定义 judge 所用 provider 的超时和重试需看各自实现，本次未核实统一默认值。[JS `client.ts`](https://github.com/langchain-ai/langsmith-sdk/blob/main/js/src/client.ts)

### 对 TeachArena 的意义

judge-only 应继续锚定源 run ID、源 manifest 和各格对话哈希。S3 在基准和候选的各自证据可读回后做对齐。将目标生成与裁判阶段的并发分别配置是可借用的设计，实际共享的费用授权仍在发送前扣减。

## 9. Langfuse

### 出处

[Experiments](https://langfuse.com/docs/evaluation/evaluation-methods/experiments)、[LLM-as-a-judge](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)、[Datasets](https://langfuse.com/docs/evaluation/features/datasets)、[Token and cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)、[Python `client.py`](https://github.com/langfuse/langfuse-python/blob/main/langfuse/_client/client.py)、[Python `request_options.py`](https://github.com/langfuse/langfuse-python/blob/main/langfuse/api/core/request_options.py)。

### 具体内容

- **数据模型与裁判。** SDK experiment 将任务、item evaluators 与 `run_evaluators` 分开。TS 的 item 示例有 `input` 与 `expectedOutput`，Python evaluator 参数有 `input`、`output`、`expected_output`、`metadata`。平台 LLM-as-a-judge 把输入、输出和 rubric 映射到 evaluator，返回数值、分类或布尔分数及理由。SDK evaluator 在实验进程运行，平台托管裁判的默认模型未核实。[Experiments](https://langfuse.com/docs/evaluation/evaluation-methods/experiments) · [LLM-as-a-judge](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)
- **可复现性。** SDK 支持本地和托管数据。托管数据默认读最新，也可按 `version` 时间戳回读，包括后来更新或删除的 item。文档指出 dataset schema 变更不产生 item 的新版本。[Experiments](https://langfuse.com/docs/evaluation/evaluation-methods/experiments) [Datasets](https://langfuse.com/docs/evaluation/features/datasets)
- **并发与费用。** TS 示例传 `maxConcurrency`，Python `run_experiment` 的 `max_concurrency` 默认 50。上报的 `costDetails` 优先于基于已上报 usage 和模型价格的推算。未核实 TS 的默认并发和逐次发送前费用限制。[Experiments](https://langfuse.com/docs/evaluation/evaluation-methods/experiments) [Python `client.py`](https://github.com/langfuse/langfuse-python/blob/main/langfuse/_client/client.py) [Token and cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)
- **超时与重试。** Python 客户端 `LANGFUSE_TIMEOUT` 默认 5 秒，适用于 Langfuse API 请求。底层 `RequestOptions` 提供 `timeout_in_seconds` 与 `max_retries`。未核实 TS API 客户端的默认值、托管 judge worker 的超时和重试，或 SDK 对用户 task 中 provider 调用的统一超时策略。[Python `client.py`](https://github.com/langfuse/langfuse-python/blob/main/langfuse/_client/client.py) [Python `request_options.py`](https://github.com/langfuse/langfuse-python/blob/main/langfuse/api/core/request_options.py)

### 对 TeachArena 的意义

可参考将 cases、schema、模型和裁判版本一起纳入评测身份，以及区分 provider 上报、按价格推算与未知费用。在已有本地调用原件可能含私有对话的情况下，S2 与 S3 的研究和验收可直接使用本地收据及脱敏请求字段。

## TeachArena 工程取舍

1. **让兼容接口保持窄。** 保留 `src/models.mjs` 作为 pi/pi-ai 和 OpenRouter 的唯一调用边界。冻结的对话、裁判合约与输入快照是复评证据。模型名、实际路由、裁判参数与预算共同决定比较是否同口径。
2. **让预算限制实际发送。** 控制单次请求、单格和整个授权 run 的三个期限时，分别记录终止发生在哪一层。监控上报的消耗与发送前预留额度承担不同职责。若上层和 provider 都有重试，先核对一次授权尝试最多会产生几次实际请求。
3. **让 S2 文件隔离先于 S3 比较。** 为两侧分开可写根与独立运行收据。S3 先查当前 HEAD 的 `check` 收据、各侧 manifest、评测身份和原件哈希，再以同一场景与裁判维度对齐。任一侧只留下故障或缺证据时，输出故障或不可比较状态。逐维度差异供验收读证据使用。
