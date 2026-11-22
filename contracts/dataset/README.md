# Dataset

`schema.mjs` 校验 E1 使用的任务投影；[数据原件](../../data/README.md) 不修改。`example.json` 摘自旧 S0-01 开场题对话 m9/m10。43 来自 `f(1)=6` 和两组各重复六次的值：`78 = 36 + 6(a²+b²)`，所以 `36+a²+b²=43`。该校验不是私测答案键，也不把变式当原题。

## 补尺子划分

[锁定清单](../../data/ruler-expand-v1.json)包含初筛通过的 40 道 S0 原题。旧库的 28 道封存题保留在 [s0-v1](../../data/s0-v1.json) 的 `holdout`。待校正的 20 题和暂缓的 5 题维持原状。S0-49 的旧私测题干把 2.2 秒称为一个时间常数，键内算式为 1.1 秒。评测只使用该题的原始开场及画像。

`ruler-expand.mjs` 从学科和题族重算名单。训练名额按各学科题数乘以 15/40 后向下取整。剩余名额按余数降序分配，同余数按学科码升序。S0-01 和 S0-06 预占本学科名额，同族题目整组入选。以种子 `teacharena-ruler-expand-v1` 和 `:split:<题族ID>` 的 SHA256 决定取组的顺序。划分后用 `:train:<题ID>` 和 `:test:<题ID>` 分别排序。名单哈希取 UTF-8，每行一个 ID，含末尾 LF。

| 名单 | 题数 | SHA256 |
| --- | ---: | --- |
| 训练 | 15 | `7d499be025438c8ac37a9410b0340c061c3e6b5512b0d983c045675d4f9381c3` |
| 测试 | 25 | `5ba6f198751577c5a622c2c8d748cf2072f566b28001c5ca52524b356b24a3c8` |

训练每题一条对话，按名单顺序以 `no_teach`、`normal`、`answer_dump`、`lecture`、`sycophant_close` 循环。测试每题一条 `normal`，按测试名单顺序加一条坏教师对话，以 `answer_dump`、`lecture`、`sycophant_close`、`no_teach` 循环。测试只读锁定测试名单，须通过[尺子冻结记录](../../docs/archive/status-log-2026-11.md#冻结记录)的准入核对。

`npm run check` 对当前尺子的 schema、评分说明和裁判提示词检查指纹。变更须递增尺子版本，并在 `contracts/judge/ruler-change.json` 绑定当前 `ruler`、`fingerprint`、前版真实训练 `trainingRunId`、`trainingReceiptSha256` 及锁定的 `labelsSha256`。检查从训练 run 下读取 `labels-locked.csv`。
