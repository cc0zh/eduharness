# 轻量 S2 方案：两侧 Docker，宿主评分

**验收目标。** 在开发检出之外，让 S0-06 的基线和候选分别冷启动。复核者用两个 run、交叉探针和原件哈希验证写入隔离。S3 用同一边界检验尺子面对优化压力时的表现。依据为 TeachArena `docs/scenarios.md` 的 S2/S3/E5 卡、`docs/status.md` 和 `AGENTS.md`。

## 文件与执行边界

| 位置 | 放入的内容与权限 |
| --- | --- |
| Windows 可信评测进程 | 裁判 prompt、rubric、评分代码、冻结对话、私测、完整任务及学生画像、最终结果和服务凭据都留宿主，不挂载。宿主加载冻结的可信检出，负责学生、教师模型传输、裁判及原件写入。 |
| `old` Linux 容器 | 挂载锁定基线的 `/side-old/harness`，执行时只读。只有本侧的 `/side-old/scratch`、私有临时、HOME、缓存及会话可写。 |
| `changed` Linux 容器 | 改进时 `/side-changed/harness` 可写。新会话由本轮请求和候选工作副本启动。宿主封存允许差异后，用同侧的新执行实例挂载只读快照。`/side-changed/scratch` 和会话等状态独占。 |
| 宿主验收根 | 在开发检出外建 `runs/s2-<日期>-<序号>/`。分别用 `old/` 与 `changed/` 作原有 CLI 的 run 根。宿主写 `s2-old`、`s2-changed` 及各自 `_receipts/`。两侧最终 run 根均不挂载到容器。 |

固定同一 Linux Node 22.19+ 镜像 digest 和依赖锁。镜像内放受信协议入口及依赖。每侧挂独立 harness，使用非 root、只读根文件系统、独占 tmpfs、`--network none`、`--cap-drop ALL`、`no-new-privileges` 和 CPU、内存、PID 限制。任何一侧都不挂开发检出、宿主用户目录、另一侧目录或 Docker socket。启动器记录镜像、容器 ID、挂载及限额。 [Docker run](https://docs.docker.com/reference/cli/docker/container/run/) · [Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)

## 从现有项目切开一处

1. 在可信的 `src/run.mjs` 中给 `createTeacher` 加一个可替换执行边界。今天 `createTeacher` 和 `grade` 在同一 Node 进程。保留学生循环、评分、证据绑定和原件写入。待测模块只在对应容器加载，由宿主按实际挂载快照计算 `identity.sources` 中的教师哈希。参见 `src/run.mjs`、`src/teacher/session.mjs`、`src/judge.mjs`。
2. 通过宿主主动建立的 stdin/stdout 传有长度上限的 JSON 消息。宿主提供公开学生发言和允许公开的部署策略。容器返回教师发言，以及教师模型请求。请求仅能走宿主 `src/models.mjs` 的 `teacher` 路由，宿主固定配置、角色、轮次、次数和 token 上限，按序回传所需 pi 流。学生、裁判、通用命令执行、宿主路径、网络和环境变量都不在协议内。
3. 宿主重建角色、轮次与消息 ID，校验正文、单条及总长度、序列、超时和退出码。容器 stdout 与诊断日志当作不可信输入。模型调用与裁判证据由宿主保存，工具事件注明来源。超时由宿主按本侧容器 ID 停止并清理。终态协议错误按基础设施故障保留，无兜底分数。参见 `src/models.mjs`、`src/run-receipts.mjs`、`contracts/artifacts/README.md`。
4. 离线与真实走同一边界，宿主切换已有 faux/真实 provider。复用 `--run-root`、唯一 `--id`、`--verify-run` 和检查收据。`--judge-only` 的冻结入口依赖已有裁判调用/绑定原件，保留给冻结对话复评。首次评分走现有宿主 `grade`。真实调用须从干净 HEAD 取得检查收据并另获额度授权。参见 `src/cli.mjs`、`src/run.mjs` 的 `frozenDialogue`、`AGENTS.md`。
5. S2 隔离验收可以用预制 harness 差异验证编辑与冷启动。S3 的改进 Agent 使用候选侧编辑实例和单独的宿主模型限额，只接收本轮请求及允许反馈。封存时宿主只复制预登记的普通文件，拒绝链接、额外文件和意外变更。参见 `docs/scenarios.md` 的 S2/S3/E5 卡。

## 交叉探针与证据

1. 宿主先创建双方探针目录并记录规范路径，拒绝重合、父子关系和重解析点。写入每侧独立随机标记。使用和正式运行相同的 UID、镜像、挂载与选项执行双向探针。保留 `docker inspect` 的 mount source、destination 和 `RW`，并核对 IPC 命令表只开放教师消息、模型请求和回传。
2. 每侧读写本侧 scratch 标记应成功。交叉尝试在对侧唯一目标 `/side-<peer>/scratch/probe/` 写入、读取标记，均须非零。宿主先证明对侧源目录在宿主存在。对侧目标在容器中不可见是预期结果，须与挂载清单和禁网结果合读。再对本侧已知存在的只读快照哨兵验证 `EACCES` 或 `EROFS`。编辑模式也测候选 harness 正向可写与交叉写失败。若对侧标记可读或交叉写成功，终止验收。
3. 保存两侧初始私有目录清单、本轮请求与权威原件 SHA256、首个请求脱敏副本和无旧会话加载的证据。封存后哈希候选，再让两侧新启动。宿主复算两边 harness、开发检出约定范围及受保护输入前后 SHA256。探针后查不存在交叉标记。污染、来源漂移或超时都要有侧别及定位。
4. 写 `isolation.md`，索引两侧命令、退出码、manifest、结果、录制原件及 `_receipts/`。核对两份 `taskId` 均为 `S0-06`，逐项核对评测身份，仅允许预登记的 harness 差异及派生哈希。`--verify-run` 复核范围是 CLI 收据和请求原件，隔离证明另看探针。依据为 `docs/scenarios.md` 的 S2 卡和 `contracts/artifacts/README.md`。

## 复用、工作量与取舍

- 直接沿用 TeachArena 的 `src/models.mjs`、`src/judge.mjs`、`src/run-receipts.mjs` 和 `contracts/{judge,artifacts}/`。外部只移植控制做法。Inspect AI 的 Docker `config.py` 提供 `network_mode: none` 模板，`docker.py` 的 `sample_init` 和 `compose.py` 提供独立命名、超时与清理参考。MIT，取配置思路即可。 [Inspect AI Docker 源码](https://github.com/UKGovernmentBEIS/inspect_ai/tree/main/src/inspect_ai/util/_sandbox/docker) · [LICENSE](https://github.com/UKGovernmentBEIS/inspect_ai/blob/main/LICENSE)
- 参考 Evo-Bench `evaluation/runner.py` 的 `public_task_view` 和外部评分接口。Apache-2.0。按当轮教师可见字段写最小 Node 对象。 [源码](https://github.com/RUCAIBox/Evo-Bench/blob/main/evobench/evaluation/runner.py#L60) · [LICENSE](https://github.com/RUCAIBox/Evo-Bench/blob/main/LICENSE)
- 用 autoresearch `program.md` 的单点改动与保留、撤回账本作为后续 S3 模板。其命令执行和自报结果不接入。 [autoresearch `program.md`](https://github.com/karpathy/autoresearch/blob/master/program.md)
- 工程粗估 **3 至 5 人日**。容器启动、探针和留证约 1 日；教师执行边界及 pi 流转发约 1.5 至 3 日；双侧离线回归约 0.5 至 1 日。镜像准备、首次 provider 真实验证和后续 S3 循环随实际环境执行。先跑物理隔离探针，再用正常及坏教师的离线夹具覆盖时限、错侧、坏消息和冷启动。
- `%TEMP%\teacharena\s2-isolation-design.md` §1–5 建议私有 Git 仓库、独立 OS 身份及逐项 ACL。这里用两侧容器、私有快照和无网络代替，保留预登记、哈希、冷启动和交叉探针。旧方案对 `--verify-run` 的「缺失」描述已过时。`src/cli.mjs` 已有入口。容器和宿主交互仍需对协议做校验，Docker 的 Windows 文件映射、进程终止和路径实际权限均待取证。
- 本机 Desktop 4.50.0 已安装，WSL2 的 `docker-desktop` 当前 `Stopped`，详见 `docker-check.md`。场景卡要求双侧执行和隔离证据。离线双跑与真实教学证据分别记录。正式 S3 至少两轮 E5，比较预登记目标动作和绑定消息，结果允许不可判定。私测和冻结反例由宿主在候选封存后使用。依据为 `docs/scenarios.md` 的 S2/S3/E5，以及 `docs/status.md` 的尺子稳定性缺口。
