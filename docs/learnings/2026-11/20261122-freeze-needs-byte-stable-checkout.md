# 锁原件摘要也要锁检出字节

**现象。** 阶段 3 独立 worktree 在 Windows 上首次运行 `npm run check` 时，阶段 3 用例通过，但首轮 A/B、留出与报告测试共 21 项失败。错误集中在 `test phase freeze split file digest mismatch` 和 `local frozen source mismatch: contracts/judge/schema.mjs`。

**原因。** 首轮冻结校验读工作树原始字节。四个锁定输入在 `fa6b501` 的 Git blob 都是 LF，摘要与 `contracts/judge/ruler-freeze.json` 相符。宿主 `core.autocrlf=true` 把同样的 Git 内容检出为 CRLF；`git diff` 没有内容变化，但运行器读到不同字节。把工作树原件中的 CRLF 转回 LF，四份都与锁完全相符。

**证据。** 本机阶段 3 工作树 `.tmp/scratch/stage3-state-machine/progress.md` 的检查记录和日志路径。校验入口分别为 `src/ruler-run.mjs:25–31` 和 `scripts/ruler-test-report.mjs` 的 `local frozen source mismatch` 检查。对照 `git ls-files --eol -- data/ruler-expand-v1.json contracts/judge/schema.mjs src/judge.mjs config/e1.mjs`。

**处置与预防。** 根目录 `.gitattributes` 只为四份按字节冻结的文件固定 LF；本次工作树恢复为原 Git blob。没有改文件的 Git 内容、冻结摘要、评分规则或标签。新登记的 Markdown 也固定 LF，不通过放宽校验来接受漂移。
