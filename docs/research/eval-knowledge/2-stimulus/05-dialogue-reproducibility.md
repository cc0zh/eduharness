# 固定试验条件与冻结对话回放

## 温度、seed 和后端版本都要记录

**出处**　OpenAI Cookbook，*How to make your completions outputs reproducible with the new seed parameter*，官方笔记本的 Model level controls。https://raw.githubusercontent.com/openai/openai-cookbook/main/examples/Reproducible_outputs_with_the_seed_parameter.ipynb 。新库 `src/models.mjs:141`、`data/s0-v1.json:6`。

**具体内容**　Cookbook 把 API seed 写作尽力复现，并建议核对 `system_fingerprint`。即使 seed、参数和指纹相同，也不能保证完全相同。示例用 seed 123、temperature 0。TeachArena 在模型调用里设 `temperature: 0`，当前未配置模型采样 seed。S0 划分中的 `seed` 用于决定题目归属。

**对 TeachArena 的意义**　为每次在线生成保存题卡版本、画像版本、开场、模拟器模型与路由、请求参数、时间与实际停因。后端支持时记录采样 seed 和指纹，标清不支持或未回传。对比同一套固定场景上的多条实时轨迹，以观察重跑波动。记录重试次序，避免只留下看起来最像学生的一条。

## 已有 judge-only 支持固定公开文本的复评

**出处**　新库 `src/run.mjs:57`、`src/run.mjs:81`、`src/run.mjs:94`、`src/run.mjs:137`、`docs/status.md:98`。

**具体内容**　源验证核对运行、题目、格子、消息 ID、角色、轮次及原始裁判请求中的消息与哈希。当前四轮是 1 条学生开场加四对师生回复，共 9 条公开消息。单格来源保存原始对话 SHA256。五格模式还保存源身份与 manifest SHA256。冻结分支只调用裁判。状态记录中的一次五格冻结补评与源对话逐字一致。

**对 TeachArena 的意义**　面试可解释如何落盘对话、验证它匹配源请求、记录来源哈希，以及用同一份公开对话回放。固定文本可以复核输入边界。更换教师后，下轮学生应对教师实际话语作答，需要另跑在线互动。若增加学生冻结前缀审计，只固定到被考察的学生回合前，保存当前老师给的反馈及生成出的该回合。

## 管理三种复现证据

**出处**　新库 `README.md:14`、`src/offline.mjs:22`、`src/run.mjs:136`、`docs/status.md:98`、`docs/status.md:116`。Anthropic 对 task、trial、transcript 的定义。https://www.anthropic.com/research/demystifying-evals-for-ai-agents

**具体内容**　离线模式使用固定响应。冻结补评绑定已保存的五格公开文本。完整真实 E2 五格分别生成四轮对话，合计 45 条公开消息，五格共用 1 份题目和画像条件。

**对 TeachArena 的意义**　把离线夹具、冻结真实轨迹、在线重生成标成三种产物。回归复现编排用离线夹具。复核一段已经发生的对话用冻结文本。验证模拟学生遇到不同教师是否有合理反应，用在线重生成和人工回读。
