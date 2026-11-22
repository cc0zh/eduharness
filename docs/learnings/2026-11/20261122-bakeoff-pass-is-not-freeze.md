# 构造题零错不替代冻结复测

**现象。** Gemini 在代理补跑中唯一通过 a–e，99 个确定布尔位零错。用同一裁判指纹另行登记复测后，51 格都出齐，S1 方向和五对复跑均达要求，定向和 `normal` 检查仍未达冻结线。

**证据。** 选优报告（`runs/round2-bakeoff-proxy-report/bakeoff-report.md`）和复测报告（`runs/round2-binary-v3-freeze-gemini-01/freeze-retest-report.md`）可核对分母。`A1-only-proposes` 的 A1 将 #9 判为 Yes，第二遍同样误判：首遍（`runs/round2-binary-v3-freeze-gemini-01/_processes/1/A1-only-proposes/calls/judge-4-3-1.json`）与第二遍（`runs/round2-binary-v3-freeze-gemini-01/_processes/1/A1-only-proposes-r2/calls/judge-4-3-1.json`）。`V2-normal-claim` 的 V2 符合 No，但漏判 #4 的 V1，验证维降为 0：原件（`runs/round2-binary-v3-freeze-gemini-01/_processes/1/V2-normal-claim/calls/judge-4-6-1.json`）。

**原因与边界。** 选优的构造位和冻结的定向案例检验不同。合规引用不代表语义正确，两遍一致也可能是同一个错误。原件能定位漏判或误判，不能据此断言模型为何作出该判断。

**处置。** Gemini 保留为胜出候选，不冻结尺子。下一轮若获授权，另锁真值、同批基线和判线；核对目标位与连带题，复跑一致性只作描述。不能用零错的选优表覆盖冻结失败。
