# Windows 主机 Docker 只读核查

核查时间为本机 `2026-11-19T15:15:59+08:00`。Docker Desktop 已安装。当前 Desktop Linux Engine 不可用，Docker CLI 找不到引擎命名管道。Docker 主机日志确认历史运行走 WSL2。现在对应发行版为 `Stopped`。

| 只读检查 | 实测证据 | 判断 |
| --- | --- | --- |
| `docker version` | Windows amd64 Client 28.5.1、API 1.51、context `desktop-linux`。Server 版本缺失。退出 1。 | CLI 可执行，引擎未连接。 |
| `docker info --format '{{.OSType}} …'` | Linux Engine 管道错误，退出 1。 | 当前无法核对 daemon OS、内核和服务端版本。 |
| `docker context show` | `desktop-linux`，退出 0。 | CLI 指向 Desktop Linux Engine。这个名字本身不能辨别 WSL2 与 Hyper-V。 |
| `wsl -l -v` | `* docker-desktop    Stopped    2`，退出 0。`wsl --version` 返回 `2.5.1.0`，退出 0。 | 此主机有 WSL2，且已有 Docker Desktop 的 WSL2 发行版。 |
| 文件、注册表、进程与服务状态 | `C:\Program Files\Docker\Docker\Docker Desktop.exe` 为 `4.50.0.209931`，安装注册表版本 `4.50.0`。无 `Docker Desktop` 或 `com.docker.backend` 进程。`WslService` 运行，`com.docker.service` 停止。 | 证据符合 Desktop 未启动。服务停止这一条单独不足以诊断后端。 |
| `%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log:10–11` | `2026-10-20T06:19:33Z` 的 `[com.docker.backend.exe.wsl]` 子系统记录 `HEAD /_ping` 请求及返回。 | 这份历史日志直接记录了 WSL 后端处理引擎请求。 |
| `%APPDATA%\Docker\settings-store.json` | `wslEngineEnabled` 字段缺失。旧 `settings.json` 缺失。 | 无持久化显式开关供读回。下次启动时仍需确认当前配置，未观察到活动的 Hyper-V 后端。 |

`docker version` 和 `docker info` 的共同错误如下。

```text
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

Docker 官方说明将 `docker-desktop` 关联到 WSL2 后端，并指出支持 WSL2 的系统上设置通常默认启用，开关可能不显示。可用性目前缺少运行中的 Desktop Linux daemon。后续获准启动 Desktop 后，读取 Settings → General 的 **Use the WSL 2 based engine**，复核 `docker version` 的 Server 段、`docker info` 的 Linux 内核与 `wsl -l -v` 的发行版状态。作业探针须等引擎可用并获准运行容器。 [Docker Desktop WSL 2 backend on Windows](https://docs.docker.com/desktop/features/wsl/)

本次只读取版本、上下文、WSL、进程、服务和配置字段。容器启动、镜像拉取和配置修改均为零。
