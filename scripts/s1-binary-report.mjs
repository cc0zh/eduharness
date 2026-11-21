import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cellIds, runId } from '../contracts/artifacts/schema.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { binaryDimensions, binaryGates, binaryQuestions, notApplicable } from '../contracts/judge/binary.mjs';
import { verifyRun } from '../src/run-receipts.mjs';
import { constructExpectations, s1Path, s1Plan, s1PreregistrationFile, s1Repetitions, s1Scenario } from '../src/s1-binary-plan.mjs';

const counters = () => ({ tp: 0, fn: 0, fp: 0, tn: 0, missingYes: 0, missingNo: 0 });
export function confusion(expectedByCell, samples) {
  const questions = Object.fromEntries(Object.keys(expectedByCell.normal).map(question => [question, counters()]));
  for (const { id, answers } of samples) for (const [question, counts] of Object.entries(questions)) {
    const expected = expectedByCell[id]?.[question];
    if (typeof expected !== 'boolean') continue;
    const observed = answers?.[question]?.answer;
    if (typeof observed !== 'boolean') counts[expected ? 'missingYes' : 'missingNo']++;
    else if (expected) counts[observed ? 'tp' : 'fn']++;
    else counts[observed ? 'fp' : 'tn']++;
  }
  const total = counters();
  for (const row of Object.values(questions)) for (const key of Object.keys(total)) total[key] += row[key];
  const gates = Object.fromEntries(Object.entries(questions).filter(([key]) => Object.hasOwn(binaryGates, key)));
  return { questions, total, gates };
}

function repeatAgreement(samples, fields, get) {
  const pairs = s1Repetitions.flatMap((a, i) => s1Repetitions.slice(i + 1).map(b => [a, b]));
  const lookup = new Map(samples.map(row => [`${row.repetition}/${row.id}`, row]));
  return Object.fromEntries(fields.map(key => [key, Object.fromEntries([...pairs, s1Repetitions].map(repeats => {
    const recorded = cellIds.map(cell => repeats.map(repeat => get(lookup.get(`${repeat}/${cell}`), key))).filter(values => values.every(value => value !== undefined));
    const n = recorded.filter(values => values.every(value => value === values[0])).length;
    return [repeats.length === 3 ? 'all' : repeats.join('/'), [n, recorded.length]];
  }))]));
}

export const agreement = samples => repeatAgreement(samples, binaryDimensions, (sample, key) => sample?.scoring?.scores[key]);

function usageSummary(rows, manifest, verification) {
  const sent = rows.filter(row => Number.isInteger(row.reasoningLimit));
  const known = sent.filter(row => row.usage !== null);
  const usage = ['input', 'cacheRead', 'output', 'totalTokens'].reduce((sum, key) => Object.assign(sum, {
    [key]: known.reduce((total, row) => total + row.usage[key], 0),
  }), {});
  requireThat(verification.requestCount === sent.length, 'provider attempts do not match request receipt');
  return {
    pid: manifest.writer.pid, attempts: rows.length, requests: sent.length, retries: sent.filter(row => row.attempt > 1).length,
    requestedOutputTokens: sent.reduce((sum, row) => sum + row.requestLimit, 0),
    limits: manifest.limits, usage, missingUsage: sent.length - known.length,
    reasoningAboveRequested: sent.filter(row => row.reasoningTokens > row.reasoningLimit).map(row => ({ attemptPath: row.attemptPath, limit: row.reasoningLimit, used: row.reasoningTokens })),
    failures: rows.filter(row => row.failureKind).map(({ attemptPath, failureKind, detail }) => ({ attemptPath, failureKind, detail })),
  };
}

const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
const frac = (n, total) => total ? `${n}/${total}` : '0/0（无样本）';
const rate = scoring => scoring?.possible ? `${scoring.points}/${scoring.possible}` : '—';
const status = { lower: '低于 normal', tie: '同档或同分率', higher: '高于 normal', inconclusive: '不可判定' };
const statRow = ({ tp, fn, fp, tn, missingYes, missingNo }) => [tp, fn, fp, tn, frac(tp, tp + fn), frac(tn, tn + fp), missingYes, missingNo];

export function writeS1Report(root, id) {
  const dir = join(root, id);
  const ver = verifyRun(root, id);
  requireThat(ver.verified, `S1 receipt verification failed: ${[...ver.missing, ...ver.invalid].join(', ')}`);
  const read = path => JSON.parse(readFileSync(join(dir, path)));
  const manifest = read('manifest.json'), result = read('result.json');
  requireThat(manifest.scenario === s1Scenario, 'expected an S1 binary run');
  const preregistration = readFileSync(join(dir, s1PreregistrationFile));
  const expected = constructExpectations(preregistration.toString('utf8'));
  const actual = new Map(result.cells.map(row => [`${row.repetition}/${row.id}`, row]));
  const telemetry = [];
  const samples = s1Plan.map(coordinate => {
    const { repetition, condition: id } = coordinate;
    const path = s1Path(coordinate);
    const outcome = actual.get(path);
    if (outcome) telemetry.push(...read(`${path}/telemetry.json`));
    if (!outcome || outcome.failure) return { repetition, id, failure: outcome?.failure, unstarted: !outcome };
    return { repetition, id, ...read(`${path}/judge.json`).verdict };
  });
  const lookup = new Map(samples.map(row => [`${row.repetition}/${row.id}`, row]));
  const { paired, targetHits, ratePasses, passed } = result.assessment;
  const gatedOpeningDumps = samples.filter(row => row.answers?.P1.answer && !row.answers.P0.answer).map(row => `${row.repetition}/${row.id}`);
  const dimAgreement = agreement(samples);
  const bitAgreement = repeatAgreement(samples, Object.keys(binaryQuestions), (sample, key) => sample?.answers?.[key]?.answer);
  const matrix = confusion(expected, samples);
  const usage = usageSummary(telemetry, manifest, ver);
  const summary = { verification: ver, preregistrationSha256: hash(preregistration), ...result.assessment, dimensionAgreement: dimAgreement, questionAgreement: bitAgreement, matrix, gatedOpeningDumps, usage };

  const dimensionHeads = ['遍次', '条件', ...binaryDimensions.map(key => ({ misconception_repair: 'M', support_escalation_and_fading: 'S', agency_handoff: 'A', productive_struggle: 'P', representation_pivot: 'R', verification_or_transfer: 'V' })[key]), '得分 / 适用满分', '状态'];
  const dimensionTable = table(dimensionHeads, samples.map(row => [row.repetition, row.id, ...binaryDimensions.map(key => row.scoring?.scores[key] ?? '—'), rate(row.scoring), row.failure?.kind ?? (row.unstarted ? '未启动' : '已评分')]));
  const applicability = table(['维度', 'N/A', '适用', '技术缺失或未启动'], binaryDimensions.map(key => {
    const ruled = samples.filter(row => row.scoring);
    const na = ruled.filter(row => row.scoring.scores[key] === notApplicable).length;
    return [key, na, ruled.length - na, samples.length - ruled.length];
  }));
  const pairedTable = table(['遍次', '条件', '(a) 逐侧适用分率方向', '共同维数', '共同维分差 / 满分', '目标维', 'normal → 坏侧', '(b) 目标方向'], paired.flatMap(({ repetition, pairs }) => pairs.map(row => [
    repetition, row.condition, status[row.totalDirection], row.commonDimensions.length, row.commonPossible ? `${row.pairedDeltaPoints}/${row.commonPossible}` : '—', row.dimension,
    `${row.normal ?? '缺分'} → ${row.variant ?? '缺分'}`, status[row.targetStatus],
  ])));
  const agreementTable = rows => table(['判定', 'r1/r2', 'r1/r3', 'r2/r3', '三遍全同'], Object.entries(rows).map(([key, values]) => [key, ...Object.values(values).map(([n, total]) => frac(n, total))]));
  const matrixTable = table(['题', '预期 Y / 裁判 Y', '预期 Y / 裁判 N', '预期 N / 裁判 Y', '预期 N / 裁判 N', '召回率', '特异度', '缺失预期 Y', '缺失预期 N'], [...Object.entries(matrix.questions), ['合并', matrix.total]].map(([key, row]) => [key, ...statRow(row)]));
  const gatesTable = table(['门控', '有机会判对', 'N/A 判对', '错把适用判 N/A', '错把 N/A 判适用', '缺失'], Object.entries(matrix.gates).map(([key, row]) => [key, frac(row.tp, row.tp + row.fn), frac(row.tn, row.tn + row.fp), row.fn, row.fp, row.missingYes + row.missingNo]));
  const answersTable = s1Repetitions.map(repeat => `### ${repeat}\n\n${table(['题', ...cellIds.map(cell => `[${cell}](${repeat}/${cell}/transcript.json)`)], Object.keys(binaryQuestions).map(key => [key, ...cellIds.map(cell => {
    const row = lookup.get(`${repeat}/${cell}`).answers?.[key];
    if (!row) return '—';
    if (!row.answer) return 'No';
    return `Yes ${Object.entries(row.evidence).filter(([, n]) => n !== null).map(([role, n]) => `${role}=#${n}`).join(' ')}`;
  })]))}`).join('\n\n');
  const v3 = table(['条件', 'M', 'S', 'A', 'P', 'R', 'V', 'v3 总分'], cellIds.map(cell => {
    let old;
    try { old = JSON.parse(readFileSync(join(root, manifest.source.runId, cell, 'judge.json'))).groups; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const values = binaryDimensions.map(key => (old?.teaching?.[key] ?? old?.consolidation?.[key])?.score);
    return [cell, ...values.map(value => value ?? '缺分'), values.every(Number.isInteger) ? `${values.reduce((sum, value) => sum + value, 0)}/12` : '缺分'];
  }));
  const report = [
    '# S1 二元尺子五格复判',
    `${manifest.identity.ruler} / ${manifest.identity.judgeOutputContract} / ${manifest.identity.version}。运行 ${id}，源 ${manifest.source.runId}，identityId ${manifest.identityId}。预登记 SHA256 ${summary.preregistrationSha256}。 [manifest](manifest.json) · [预登记](preregistration.md)`,
    `## 预登记判线\n\n**${passed ? '已过线' : '未过线'}。**\n\n- (a) 五格总分率对照有 ${ratePasses}/3 遍四个坏侧均低于 normal。\n- (b) 目标维严格低于 normal 的次数为 ${Object.entries(targetHits).map(([condition, n]) => `${condition} ${n}/3`).join('、')}。同档及不可判定都留在三遍的计划分母。\n- (c) 下表给出逐维分档及逐题是非的一致次数。\n\n` + pairedTable,
    `## 六维和适用分率\n\n${dimensionTable}\n\n${applicability}\n\n首答揭底但试错门控 No（P1=Yes 且 P0=No）：${gatedOpeningDumps.length ? gatedOpeningDumps.join('、') : '无'}。这类有效判决的 P 维为 N/A，不计入目标命中。`,
    `## 三遍一致性\n\n分档 0、1、2、N/A 各算一类。每列每行原计划 5 格。分母为该列双方均有判决或三遍都有判决的格数。\n\n${agreementTable(dimAgreement)}\n\n### 逐题回答\n\n${agreementTable(bitAgreement)}`,
    `## 构造真值混淆矩阵\n\n计入预登记为 Yes 或 No 的坏教师格，每格计划三次。不定格排除，技术缺失另列。召回率为预期 Yes 中判 Yes 的次数，特异度为预期 No 中判 No 的次数。分母为相应预期下有合规判决的样本数。真值来自有明确约束的极端坏教师构造。准确度只覆盖这些易判条件。\n\n${matrixTable}\n\n### 门控和 N/A\n\n门控 No 等价于本维 N/A。\n\n${gatesTable}`,
    `## 各格逐题回答\n\nYes 后的 #n 是同列对话消息号。No 表示查完对应公开视图仍无合格证据。空格符号表示没有发布裁判判决。\n\n${answersTable}`,
    `## v3 口径\n\n源运行 v3 直接判六维的 0–2，固定满分 12，旧表征无机会记 0。新版先回答 19 题，代码按机会门、红线和同一证据链算分。表征机会只来自教师实际使用后遇阻的讲法。同题配对用共同适用维。两表各用原口径，禁止跨版相减。\n\n${v3}`,
    `## 收据和用量\n\n- --verify-run 为 ${ver.verified}，进程退出 ${ver.exitCode}，机器收齐判决 ${ver.acceptance}。manifest、启动、进程及所有遥测的 PID 为 ${usage.pid}。\n- 计划 15 次常规裁判。记录尝试 ${usage.attempts}，发请求 ${usage.requests}/${usage.limits.maxAttempts}，其中重试 ${usage.retries}。出站请求输出额度 ${usage.requestedOutputTokens}/${usage.limits.maxRequestedOutputTokens} token。\n- 供应商实报输入 ${usage.usage.input}，缓存读入 ${usage.usage.cacheRead}，输出 ${usage.usage.output}，合计 ${usage.usage.totalTokens} token。${usage.missingUsage} 次缺报。实报推理超过出站参数 ${usage.reasoningAboveRequested.length} 次。\n- 尝试故障 ${usage.failures.length} 次。详见 [复算 JSON](s1-binary-summary.json) · [启动](../_receipts/${id}.start.json) · [进程](../_receipts/${id}.process.json) · [请求日志](../_receipts/${id}.requests.jsonl)。`,
  ].join('\n\n');
  writeFileSync(join(dir, 's1-binary-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, 's1-binary-report.md'), `${report}\n`);
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const id = runId(process.argv[2]);
    const root = process.argv[3] ?? 'runs';
    const { ratePasses, targetHits, usage } = writeS1Report(root, id);
    console.log(JSON.stringify({ id, ratePasses, targetHits, requests: usage.requests, pid: usage.pid }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
