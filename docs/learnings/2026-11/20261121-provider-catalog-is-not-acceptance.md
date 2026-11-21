# 公开端点参数表不证明真实请求可用

**现象。** ①h 对 Claude Haiku 5.5 和 Gemini 3.8 Flash 查询 OpenRouter 的 models/endpoints 元数据。所选端点都列出 JSON Schema 和 reasoning 参数。真实运行仍在全部六次请求中返回 HTTP 403，因连续三次供应商失败按预登记停线。

**已知与未知。** 请求原件和接收日志证明固定路由发出并收到 403。供应商响应正文没有保存在原件中，所以无法区分模型访问权限、端点策略或请求级拒绝；不能声称已查明根因。元数据只证明参数被列出，不证明该 key、端点及完整参数组合已验证可用。

**处置。** 按原判线保留两批失败格，不放松 `require_parameters`，不启用 fallback，不静默换供应商或模型。停止候选选择，不启动冻结复测。

**证据。** 提交 `1a73c45e6db859268472b32887cc5555844e1505` 的 `config/judge-bakeoff.mjs` 锁定端点。真实运行的 [Haiku 请求日志](../../../runs/_receipts/round2-bakeoff-haiku-01.requests.jsonl)、[Gemini 请求日志](../../../runs/_receipts/round2-bakeoff-gemini-01.requests.jsonl)、[Haiku 验真](../../../runs/round2-bakeoff-report/round2-bakeoff-haiku-01.verify-run.json) 及 [Gemini 验真](../../../runs/round2-bakeoff-report/round2-bakeoff-gemini-01.verify-run.json) 均可核对六次 403 与日志收据。候选和参数见[①h 比较报告](../../../runs/round2-bakeoff-report/bakeoff-report.md)。

**预防。** 公共 models/endpoints 清单用于筛选参数候选，不替代同身份真实请求验收。记录实际 HTTP 状态、固定端点、模型标识、预算和可回读错误正文；若供应商没有提供正文，保留原因未知。换路由或模型须在请求前另行登记，不能事后把失败候选改成通过。
