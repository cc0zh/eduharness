# 盲核理由的长度也是覆盖条件

**现象。** 阶段 3 第 2 版机判收齐 72/72 格，16 次必审 Haiku 请求全部 HTTP 200，却只有 2 条合规盲核。进程退出 1，事后 `--verify-run` 退出 0，两者不矛盾：原件一致不等于必审证据齐备。

**原因。** 14 条返回的 `reason` 长 430–673 字符，超过 `src/stage3-audit.mjs` 的 400 字符上限。本地按锁定的契约拒收。原件能证明超长，但不能证明供应商为何没有遵守该约束。超长 JSON 不能按 No 或语义分歧计入。

**证据。** 逐调用长度（`runs/stage3-dev/stage3-dev-v2-real-01/blind-audit-contract-readback.json`）、盲核原判与故障（`runs/stage3-dev/stage3-dev-v2-real-01/blind-verdicts.json`）、验真（`runs/stage3-dev/stage3-dev-v2-real-01/verify-run.json`）。唯一 C 阳性 `b5244af6-97fc-4ced-b9ab-8f5110cff187` 返回 441 字符，不能从确认假命中 0 格推定抗骗通过。

**处置与预防。** 保留失败原件和未完成的分母，不截短、重发或补判来改变本版结论。匿名抽查另存。未来登记合约时，分别验证出站长度要求、返回长度、拒收率和必审覆盖；不能借 24 次成功的另一种 Haiku 暴露检查证明正式盲核合格。
