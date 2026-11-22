# 分档稳定时仍要找出实际失分的题位

**现象。** 阶段 2b 的交还主动权失 47 分，两遍同档 23/24。若只看这一维的均分，容易把余量误读为学生还没有做过任何推理。

**原因与边界。** 本批 A1 全部被判 Yes，只有一格 A2=Yes；不是 A1=No 造成低档。唯一的 2 分格中，学生 #7 先提议检验偶数项列表，#9 自己选列表并核算。另一些 1 分格的 A1 引文包括教师给出关键依据后的跟算，档位稳定不证明 A1 语义正确。

**证据。** `runs/stage2b-headroom-real-01/headroom.json` 的 `cells[].questions` 和 `consistency.overall.agency_handoff`。唯一 2 分的调用（`runs/stage2b-headroom-real-01/r1/TA2B-F18-A/default/calls/judge-4-3-1.json`） 与需核对跟算的调用（`runs/stage2b-headroom-real-01/r2/TA2B-F01-B/stubborn/calls/judge-4-3-1.json`）。[阶段 2b 候选表](../../archive/stage2b-headroom.md#阶段-3-候选不作选择)保留原始分档。

**处置与预防。** 只列候选，不重标或选维。为下一阶段设计改动前，同时回读实际失分题位、学生是否发起决定、以及教师前文给了哪些依据。不用单次分数或同档率替代这些证据。
