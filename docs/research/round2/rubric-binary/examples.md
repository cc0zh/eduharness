# 二元尺子的训练片段与手工评分

本页是设计者直接读原对话的判例，没有单独调用模型或裁判，不是独立盲标，也不宣称训练一致性。`#n` 是原始 `transcript.json` 的 1 基位置，T 为老师、L 为学生。短引文只截取相邻原字；判定仍看上下文。反例针对所引事件，并不表示整条对话一定没有另一个正事件。

## 原件索引

以下文件在 `D:/Code/eduharness`。所有片段来自这 15 条训练对话中的原件，不把 S1、测试或 A/B 对话充作训练样例。

| 题号 | 条件 | 片段来源 |
| --- | --- | --- |
| S0-01 | `no_teach` | `runs/ruler-train-gen-v1/S0-01/no_teach/transcript.json` |
| S0-06 | `answer_dump` | `runs/ruler-train-gen-v1/S0-06/answer_dump/transcript.json` |
| S0-44 | `answer_dump` | `runs/ruler-train-gen-v1/S0-44/answer_dump/transcript.json` |
| S0-49 | `no_teach` | `runs/ruler-train-gen-v1/S0-49/no_teach/transcript.json` |
| S0-59 | `lecture` | `runs/ruler-train-gen-v1/S0-59/lecture/transcript.json` |
| S0-77 | `sycophant_close` | `runs/ruler-train-gen-v1/S0-77/sycophant_close/transcript.json` |
| S0-80 | `lecture` | `runs/ruler-train-gen-v1/S0-80/lecture/transcript.json` |
| S0-82 | `normal` | `runs/ruler-train-gen-v1/S0-82/normal/transcript.json` |
| S0-84 | `normal` | `runs/ruler-train-gen-v1/S0-84/normal/transcript.json` |
| S0-92 | `normal` | `runs/ruler-train-gen-v1/S0-92/normal/transcript.json` |
| S0-102 | `no_teach` | `runs/ruler-train-gen-v1/S0-102/no_teach/transcript.json` |

## 19 题的正例和反例

每行的 Yes 主证据和定位号按 [设计表](design.md#六维题目与-yes-引用) 读。例如 S2 Yes 的证据是 #4、#5、#6、#7，覆盖先前支持、做成、撤去和后续学生发言。

| ID | 正例 | 反例 |
| --- | --- | --- |
| M0 | S0-92 #1 「3/2 plus 3 is 9/2, so a^(9/2).」数值碰巧对，但公然选了错误的运算规则，#2 有回应。 | S0-82 #3 「but I don’t yet see how that separates this from the」只表示不知道怎样区分，单凭这一句没有新的错因。 |
| M1 | S0-06 #2 「the length of the shortest segment from」对应 #1 将顶点距离当边距，指出最短线段须垂直边。即使 M3 也成立，M1 仍为 Yes。 | S0-77 #2 「that bond energy as heat is right on」回应 #1 的断键放热说，附和并未提供能揭穿错因的依据。 |
| M2 | S0-82 #5 「tan x generates sec²x, while the log expression generates sec x.」学生自行给出约分和区别，对应 #1 的错选。 | S0-06 #3 「I get that AE is from E to vertex A, but I don’t see why the distance to side AD is just x.」承认教师 #2 的区分，未自行修正理由。 |
| M3 | S0-06 #1 提出错因后，#2 「Set coordinates for the square:」「Subtract the first equation from the second:」随后消元并给 `25/13`，未留修正步骤。 | S0-82 #2 「Work it out, don't recall it」虽然先确认了原题答案，但没有写完求导对照，仍留错因的修正工作。 |
| S0 | S0-49 #3 「I’m trying, but I’m honestly stuck」明确求助 63% 的基准，#4 尚能调支架。 | S0-77 #7 「I’m set for the quiz.」仅重复提交计划，未显露待推进的子步或请求调整。 |
| S1 | S0-92 #2 「Write that one out as repeated multiplication」，#3 「that's a^5, right?」，#4 「Count the a² factors. There are three of them, not two.」从只要求展开变为明确因子个数，仍留加总。 | S0-49 #3 「what does the 63% actually refer to at t = tau?」之后 #4 「Keep going; you can work through this.」无新增支架。 |
| S2 | S0-82 #4 「You'll need the chain rule with u = sec x + tan x」，#5 「the factor (sec x + tan x) cancels, so I get sec x.」，#6 「what would you guess ∫sec²(3x) dx is」，#7 「So I should divide by 3: (1/3)tan(3x) + C.」学生自选候选和比例，#8 只核对已做完的步。 | S0-92 #5 「and 2 times 3 is also 6」后，#6 说「multiply this time」，#7 「ok so multiply」，老师没有归还关键操作的选择。 |
| S3 | S0-06 #2 「Subtract the first equation from the second:」是开场实质回答的一部分，末尾已得到原题答案。 | S0-82 #2 「Your answer is right — tan x + C — but let's build the principle」只确认结果，尚未给全解。 |
| A1 | S0-92 #3 「it's a^2 times a^2 times a^2」自行展开教师尚未给出的三个因子，随后算错不抹掉这一步。 | S0-06 #5 「AD is vertical so x is horizontal」只复述 #4 已给关系，接着仍问 AH 怎么对应垂距。 |
| A2 | S0-82 #7 「which is too big by a factor of 3. So I should divide by 3」自选调整候选式并说明为什么；#7 位于末段。 | S0-102 #7 「could you ask me just one tiny question to check my thinking」学生拟出让教师问的题，没有给自选检查的依据或结果。 |
| P0 | S0-82 #1 「I can't tell you WHY it's the tan one and not the log one.」即使结果猜对，仍有可尝试的推理，#2 可回应。 | S0-77 #9 「I’ll stop second-guessing it and just go take the quiz.」没有留给老师回应的待做步骤；这是机会题的局部反例，不是整条判 N/A。 |
| P1 | S0-82 #2 「Your answer is right — tan x + C」在验证前先把题目结果定下来；虽未推导，仍是揭底。 | S0-92 #2 「but I want to check the operation itself before we call it done.」只肯定加法算术，未同意原题的解法或最终结果。 |
| P2 | S0-92 #1 「i just did the exponents」，#2 「Write that one out as repeated multiplication」，#3 「it's a^2 times a^2 times a^2」，同一个错误有明确提示和实际尝试。 | S0-01 #6 「You can do this.」之后 #7 「I also multiplied S by z」，有学生努力，但未受到针对性提示。 |
| P3 | S0-84 #3 「why is 0.30 × 0.60 the one I should trust instead of using the overall late rate 0.25?」之后 #4 「The overall late rate is 0.30×0.60 + 0.70×0.10 = 0.18 + 0.07 = 0.25.」老师在学生尝试新卡点前给出关键结果和独立性条件。 | S0-82 #8 「That's it exactly — you adjusted the constant by the chain-rule factor」是在 #7 附完整检验之后确认，不是抢做。 |
| R0 | S0-06 #2 「Set coordinates for the square:」，#3 「I don’t see why the distance to side AD is just x.」同一坐标表示没有解释通，#4 可回。 | S0-102 #4 「keep trusting yourself and keep going!」，#5 「Could you ask me one small question to help me check that」有卡点，但前面没有老师给过的表征。 |
| R1 | S0-06 #2 坐标消元、#3 质疑 x，#4 「The projection of」在直角三角形里构造投影并给出 AH 与距离的映射。#2 只提直角校对，没有用这种投影解法。 | S0-06 #5 追问投影，#6 「Therefore corresponding sides give」导回 #4 已给的投影比；就 #5 触发的机会看，补证同一映射，没有换表示。 |
| R2 | S0-44 #5 卡在积分到平均值；#6 「Picture: split the disk into inner and outer halves by area」，#7 「That looks like it’s using the disk result we’re trying to prove, so it feels a little circular to me.」学生实际用新分区定位对内盘结论的循环依赖。 | S0-80 #7 「it’s a real stored value, not just printing.」只复述 #6 的结论，未用十六进制或整数比作任何新推论。 |
| V1 | S0-82 #6 「what would you guess ∫sec²(3x) dx is — and how would you confirm it's right without a table?」提出真正留给学生的变式。 | S0-59 #2 「The larger section pulls the overall average toward its own average.」教师已演示并算完 25/75 的 84，未把变式交给学生。 |
| V2 | S0-82 #7 「Checking: d/dx[(1/3)tan(3x)] = (1/3)·sec²(3x)·3 = sec²(3x).」独立补了未公布的比例并验证，对应 #6。 | S0-92 #6 「multiply this time」，#7 「2/3 times 2 is 4/3」只完成指定的乘法，没有自己选择或解释关键运算。 |

## 三条手工逐题作答

选择 S0-92 作正常教师，S0-06 作坏教师，S0-82 作有明确两档分歧的样例。`Y #n [#m]` 表主证据和可选定位；没有括号时定位为空。`N` 后的文字是手工核对备注，不是输出字段。N/A 由代码从门控推出，并非模型的第三个答案。三个视图均为 9 条，末三分之一从 #7 起。

| ID | S0-92 normal | S0-06 answer_dump | S0-82 normal（分歧） |
| --- | --- | --- | --- |
| M0 | Y #1；把外层幂判成指数相加 | Y #1；直接认 AE 为到 AD 的距离 | Y #1；明说可能把 tan 当作普通 sec 的原函数，提出了具体错选 |
| M1 | Y #4 [#1]；用三份因子拆分所加的对象 | Y #2 [#1]；顶点距离与垂距的区别 | Y #2 [#1]；给出反向求导、匹配被积函数的判据 |
| M2 | N；#5/#7 给数，未自行区分规则 | N；#3/#5 只跟到已给结论，#9 仍不能解释 | Y #5 [#1]；自得约分结果，判清两条原函数分别对应什么 |
| M3 | N；#2 留展开，#4 留加总 | Y #2 [#1]；开场给完坐标解 | N；#2 确认原答案，没有代做决定错因的求导 |
| S0 | Y #3；相乘因子写对，通则仍卡住 | Y #3；不能把坐标 x 连到垂距 | Y #3；正切求导做成，尚要处理另一候选 |
| S1 | Y #2,#3,#4；同一步由提示展开变为明确计数 | N；#2/#4/#6/#8 持续给完整解，没有留下更多可试脚手架 | N；#4 对另一个函数首次给换元，不是在同一待求导步骤上增加原有支持 |
| S2 | N；#6 仍代选乘法 | N；无可定位的做成后撤去 | Y #4,#5,#6,#7；从指定链式法则到让学生自选候选、补系数并验，#8 未收回未做步骤 |
| S3 | N；#2 未给全解 | Y #2；开场有完整坐标消元 | N；#2 只确认结果，未代做推导 |
| A1 | Y #3；自行展开因子，不是照抄老师列出的式子 | N；#5 复述横纵，#7 只请求另种讲法，#9 请求给代入式 | Y #7；发现系数并重新检查候选 |
| A2 | N；#7 按 #6，#9 只想结束 | N；#7/#9 想要简单方法，不选择并说明理由 | Y #7；自选候选和三倍修正，实际执行同条 A1 |
| P0 | Y #1；答得碰巧对，理由仍可检验 | Y #1；学生露出问题并明确求助 | Y #1；要理解正确答案为何成立 |
| P1 | N；#2 只肯定算术，尚不肯定原题 | Y #2；首答写出 25/13 | Y #2；在试做前就确认 tan x + C |
| P2 | Y #1,#2,#3；留出因子展开并实际尝试 | N；解释和演算没有实际留步 | Y #1,#2,#3；已报结果，但仍留正切求导且学生完成，P1 仍否决定档 |
| P3 | N；#6 归纳通则在 #3/#5 真试过同一判断后 | Y #7,#8；未让学生试所提面积路线就给完整新推导 | N；#4 给路线不代做，#6/#8 只总结已做部分或提出新题 |
| R0 | Y #2,#3；教师给重复相乘表征，学生仍把指数算错 | Y #2,#3；原坐标投影关系没讲通 | N；开场查表是学生的，#3 能用老师的反求导，只未应用到第二个函数；没有它已失败的明确实例 |
| R1 | N；#4 仍数同一组因子，#6 改数不换表示 | Y #4 [#2,#3]；从坐标到几何投影 | N；门控 N/A，无合格受阻窗口，不打分 |
| R2 | N；没有新表征可用 | N；#5 说不懂 AH，#9 仍连接不上 | N；门控 N/A，无合格受阻窗口，不打分 |
| V1 | Y #2；把平方的立方作为未替答的检查；#6 也发起，但指定乘法 | N；#2 的 quick check 和 #8 的面积法都由教师自己完成 | Y #6；留下 sec²(3x) 及验证 |
| V2 | N；#3 答错，#5/#7 只完成指定算术 | N；#9 仍请求代入式，未自行解释 | Y #7 [#6]；自行调整三倍系数，并求导确认 |

支架与表征有三个易翻位点：S0-82 #4 若把“另一候选的求导”视为同一障碍上的加档，S1 可能变 Yes；本设计要求同一未完成步骤。S0-92 #6 是否抢做，取决于 #3/#5 是否已给学生试错机会；本次算有。S0-82 #3 不懂的是第二个对象，不是已经使用的反求导表征失效。这三点应进入盲标边界说明，而不是宣称客观无歧义。

## 旧尺对照

顺序为 M/S/A/P/R/V。v3 `judge.json` 从 `runs/ruler-train-score-v1/<题>/<条件>/` 读；锁定标签来自同一初评的 `blind-mapping.json` 和 `labels.csv`（SHA256 `3498764b4c9844ff8dae9ee9ba8033affacdf0500239f67e63b7644b13f4e841`）。后者是 AI 预标后用户复核，0/90 被改，不是人工独立金标。

| 题 | 匿名 ID | 手工新版六维 | 手工总分 | v3 机器六维 | v3 总分 | 锁定六维 | 锁定总分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S0-92 | `dfa02e351280` | 1/1/1/2/0/1 | 6/12 | 1/2/1/2/2/2 | 10/12 | 1/1/1/2/2/2 | 9/12 |
| S0-06 | `46ef48b019d6` | 0/0/0/0/1/0 | 1/12 | 1/1/0/0/1/0 | 3/12 | 1/1/0/0/1/1 | 4/12 |
| S0-82 | `b1038ef64b6d` | 2/1/2/0/N/A/2 | 7/10 | 2/2/2/2/2/2 | 12/12 | 2/1/2/0/2/2 | 9/12 |

- **S0-92。** S=1 同锁定标签：#6 给定乘法，不算撤去决策支持。V 从双方旧 2 变 1：#7 在新题只做了指定运算。R 从双方旧 2 变“有机会、没再换”=0：#2 是初次改讲；#3 表明该讲法仍遇阻，#4 并未另换。这个 0 不是旧 0 的直接等价物。
- **S0-06。** M=0 保留 M1 的事实，但完整解否决，区分“讲清了差异”和“学生修了错因”。S 没有可比加档或撤去，从旧 1 变 0。R 保留 1：确实从坐标换投影，未见学生用；V=0 与旧机器同，旧标签把教师自查计 1。A=0 对照的是没自主做过，不是只看教师话长。
- **S0-82。** P=0 与锁定标签一致，纠正 v3（亦是 v4）的 2：先公布答案与仍留推导同时成立。R 是 N/A 而非 0，旧 2 来自把学生自带查表当作老师一次失败表征；A/V 保留 2，因为 #7 真做了新题检验。含 N/A 的总分不能跨版本减法。这三条只能说明规则差异，不能估 κ，也不是同题教师 A/B。

## 23 格分歧对新题的约束

来源 `runs/ruler-train-rescore-v4-20261120-01/calibration-report.md` 的「23 个不一致格」。以下是双方理由的分界，不把 v4 分档当真值。

| 维度 / 格数 | 两端理由的冲突与新检查 |
| --- | --- |
| M / 2 | S0-44：学生接受“小于环”是否足以回答“为什么一半”；S0-58：复述同一拷贝分母、另提反例是否等于独立解释。M2 要同一错因及没被给过的推论。 |
| S / 3 | S0-55：继续给完整代码对照算不算加支持；S0-82：对另一函数指定链式法则到底是增援还是撤去；S0-84：#6 留镜像、#4 已报乘积、#8 又由老师核对。S1/S2 要同任务证据、留决策和后续未代做。 |
| A / 5 | S0-01：学生自选路线但没有原教师计划；S0-59：#5 有中段推论却只看末段复述；S0-96：开场代回和后续疑问是否够 1；S0-102：拟检查但没做；S0-49：条件试算是否算主导。A1 看开场后实做，A2 看末段自选理由和执行。 |
| P / 2 | S0-82：确认答案不等于没揭底；S0-49：只有鼓励和不揭底不等于有益引导。P1 识别先确认，P2 要真的提示和尝试。 |
| R / 3 | S0-59：同一代数中的差值恒等式是否换表征；S0-80：换位级证据后只复述存储值；S0-58：两步抽样解释后仍按拷贝数复述。R0/R1/R2 分开定位受阻、换法、使用。 |
| V / 8 | S0-01、S0-96、S0-49、S0-93：学生先或自发查证，老师没要求；S0-59、S0-80、S0-06：教师示范已算完，学生没检验；S0-92：教师点名乘法后学生算出新数。分别核对 V1 发起及 V2 是否独立，同一对才升 2。 |

取舍复查：若要把学生自带失败表征也纳入 R0，须事先改定义和资格判线，重做 R 的盲标；不能因为本页 S0-92 或 S0-82 降档就临时把它们纳回。若保留保守门控，报告分类计数，否则 N/A 可能掩盖过多机会缺失。
