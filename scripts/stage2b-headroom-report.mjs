import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runId } from '../contracts/artifacts/schema.mjs';
import { hash, nonblank, record, requireThat } from '../contracts/core/schema.mjs';
import { splitDimensions, splitQuestions } from '../contracts/judge/binary-v3.mjs';
import { atomicBytes, atomicJson } from '../src/receipt-files.mjs';
import { verifyRun } from '../src/run-receipts.mjs';

const scenario = 'stage2b-headroom';
const students = ['default', 'stubborn', 'answer-seeker'];
const repetitions = ['r1', 'r2'];
const statuses = ['scored', 'failed', 'paused', 'not_started'];
const grades = [0, 1, 2, 'N/A'];
const labels = ['误解修复', '增加与撤去支持', '交还主动权', '保留有益试错', '表征转换', '验证或迁移'];
const dimensions = Object.fromEntries(splitDimensions.map((dimension, i) => [dimension, labels[i]]));
const anchors = { M0: 'misconception_repair', R0: 'representation_pivot' };
const knownBoundaries = {
  A1: { title: '跟算可能被判成自主推理', note: '回读学生的步骤及前文教师已经给出的推理。' },
  V1: { title: '事后话术可能掩盖原问句', note: '回读原问句，不用事后自述推翻公开对话。' },
};
const defaultHistory = '.tmp/scratch/stage1-closeout/flip-rates.json';
const table = (keys, fn) => Object.fromEntries(keys.map(key => [key, fn(key)]));
const perDimension = fn => table(splitDimensions, fn);
const ratio = (n, d) => d ? n / d : null;
const applicable = Number.isInteger;
const matches = (matched, pairs) => ({ matched, pairs, rate: ratio(matched, pairs) });
const emptyGrades = () => perDimension(() => null);

function validateCell(cell) {
  const { folder, repetition, taskId, family, student, status } = cell;
  requireThat(typeof taskId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(taskId) && nonblank(family)
    && repetitions.includes(repetition) && students.includes(student) && statuses.includes(status)
    && folder === `${repetition}/${taskId}/${student}`, `invalid cell coordinate: ${folder}`);
}

function historicalRates({ v3 } = {}) {
  function fraction(row, label) {
    requireThat(record(row) && Number.isSafeInteger(row.pairs) && Number.isSafeInteger(row.flips)
      && row.flips >= 0 && row.flips <= row.pairs && row.rate === ratio(row.flips, row.pairs)
      && typeof row.sufficient === 'boolean', `invalid stage 1 flip rate: ${label}`);
    const { pairs, flips, rate, sufficient } = row;
    return { pairs, flips, rate, sufficient };
  }
  return perDimension(dimension => {
    const row = v3?.dimensions?.[dimension];
    return {
      questionBits: fraction(row?.questionBits, `${dimension}/questionBits`),
      anyQuestion: fraction(row?.anyQuestion, `${dimension}/anyQuestion`),
      score: fraction(row?.score, `${dimension}/score`),
      questions: table(Object.keys(splitQuestions[dimension]), id => fraction(v3?.questions?.[id], id)),
    };
  });
}

function callDetails(row) {
  return { callId: row?.callId ?? null, processIndex: row?.processIndex ?? null, attemptPath: row?.attemptPath ?? null };
}

function projectCell(cell, { transcript, judge, telemetry = [] } = {}) {
  const { folder, taskId, family, student, repetition, status } = cell;
  requireThat(Array.isArray(telemetry) && telemetry.every(record), `invalid telemetry: ${folder}`);
  const failedAttempts = telemetry.filter(row => nonblank(row.failureKind)).map(row => ({
    ...callDetails(row), role: row.role ?? null, turn: row.turn ?? null, call: row.call ?? null, attempt: row.attempt ?? null,
    failureKind: row.failureKind, validationCode: row.validationCode ?? null, stopReason: row.stopReason ?? null, httpStatus: row.httpStatus ?? null,
  }));
  const output = { folder, taskId, family, student, repetition, status, failure: cell.failure ?? null,
    failedAttempts, scores: emptyGrades(), unobserved: {}, questions: {}, publicInputSha256: null };
  if (status !== 'scored') {
    output.unobserved = perDimension(() => cell.failure?.kind ?? status);
    return output;
  }

  requireThat(Array.isArray(transcript) && transcript.length > 0 && transcript.every(row => record(row) && nonblank(row.id)
    && ['teacher', 'learner'].includes(row.role) && nonblank(row.text))
    && new Set(transcript.map(row => row.id)).size === transcript.length, `invalid public transcript: ${folder}`);
  requireThat(!judge?.binding?.messageIds || JSON.stringify(judge.binding.messageIds) === JSON.stringify(transcript.map(row => row.id)),
    `judge binding and transcript differ: ${folder}`);
  output.publicInputSha256 = hash(transcript.map(({ role, text }) => [role, text]));
  const { verdict } = judge ?? {};
  for (const dimension of splitDimensions) {
    const score = verdict?.scoring?.scores?.[dimension];
    if (grades.includes(score)) output.scores[dimension] = score;
    else output.unobserved[dimension] = score == null ? 'missing_judgment' : 'invalid_score';

    const coordinate = callDetails(judge?.binding?.dimensions?.[dimension]);
    for (const id of Object.keys(splitQuestions[dimension])) {
      const row = verdict?.answers?.[id];
      const evidence = { ...row?.evidence, ...verdict?.anchors?.[anchors[id]] };
      output.questions[id] = { answer: typeof row?.answer === 'boolean' ? row.answer : null,
        messageIds: table(Object.keys(evidence), slot => {
          const n = evidence[slot];
          requireThat(n === null || Number.isInteger(n) && n >= 1 && n <= transcript.length,
            `invalid citation ${id}.${slot} at ${folder}`);
          return n === null ? null : transcript[n - 1].id;
        }), ...coordinate };
    }
  }
  return output;
}

function summarize(cells, dimension) {
  const observed = cells.map(cell => cell.scores[dimension]).filter(score => score !== null);
  const scores = observed.filter(applicable);
  const points = scores.reduce((sum, score) => sum + score, 0);
  const possible = scores.length * 2;
  return { planned: cells.length, observed: observed.length, applicable: scores.length,
    applicableRate: ratio(scores.length, observed.length), missing: cells.length - observed.length,
    counts: table(grades, score => observed.filter(value => value === score).length), mean: ratio(points, scores.length),
    points, possible, headroom: possible - points, meanHeadroom: ratio(possible - points, scores.length) };
}

function summarizePairs(pairs, dimension) {
  const both = pairs.filter(pair => pair.r1?.scores[dimension] != null && pair.r2?.scores[dimension] != null);
  const bothApplicable = both.filter(pair => repetitions.every(rep => applicable(pair[rep].scores[dimension])));
  const oneSided = pairs.filter(pair => (pair.r1?.scores[dimension] == null) !== (pair.r2?.scores[dimension] == null)).length;
  const equal = pair => pair.r1.scores[dimension] === pair.r2.scores[dimension];
  const absoluteDifference = bothApplicable.reduce((sum, pair) => sum + Math.abs(pair.r1.scores[dimension] - pair.r2.scores[dimension]), 0);
  return { planned: pairs.length, observed: both.length, oneSided, neither: pairs.length - both.length - oneSided,
    applicability: matches(both.filter(pair => applicable(pair.r1.scores[dimension]) === applicable(pair.r2.scores[dimension])).length, both.length),
    score: matches(both.filter(equal).length, both.length), bothApplicable: matches(bothApplicable.filter(equal).length, bothApplicable.length),
    meanAbsoluteDifference: ratio(absoluteDifference, bothApplicable.length) };
}

export function buildHeadroomReport(result, evidenceByFolder, flipJson) {
  requireThat(result?.mode === 'real' && result.scenario === scenario && Array.isArray(result.cells)
    && typeof result.acceptance === 'boolean', 'not a real stage2b-headroom result');
  const history = historicalRates(JSON.parse(flipJson));
  const pairsByKey = new Map();
  const cells = result.cells.map(cell => {
    validateCell(cell);
    const row = projectCell(cell, evidenceByFolder.get(cell.folder));
    const { taskId, family, student, repetition } = row;
    const key = JSON.stringify([taskId, student]);
    if (!pairsByKey.has(key)) pairsByKey.set(key, { taskId, family, student });
    const pair = pairsByKey.get(key);
    requireThat(pair.family === family && !pair[repetition], `inconsistent or duplicate cell: ${cell.folder}`);
    pair[repetition] = row;
    return row;
  });
  const pairs = [...pairsByKey.values()];
  const summaries = {
    overall: perDimension(dimension => summarize(cells, dimension)),
    students: table(students, student => perDimension(dimension => summarize(cells.filter(cell => cell.student === student), dimension))),
    repetitions: table(repetitions, rep => perDimension(dimension => summarize(cells.filter(cell => cell.repetition === rep), dimension))),
  };
  const consistency = {
    overall: perDimension(dimension => summarizePairs(pairs, dimension)),
    students: table(students, student => perDimension(dimension => summarizePairs(pairs.filter(pair => pair.student === student), dimension))),
  };
  const profileDifferences = perDimension(dimension => students.flatMap((first, i) => students.slice(i + 1).map(second => {
    const a = summaries.students[first][dimension];
    const b = summaries.students[second][dimension];
    const difference = a.mean === null || b.mean === null ? null : Math.abs(a.points * b.applicable - b.points * a.applicable) / (a.applicable * b.applicable);
    const { meanAbsoluteDifference, bothApplicable } = consistency.overall[dimension];
    return { students: [first, second], difference, applicable: [a.applicable, b.applicable], pairedApplicable: bothApplicable.pairs,
      meanAbsoluteDifference, withinObservedRepeatDifference: difference === null || meanAbsoluteDifference === null ? null : difference <= meanAbsoluteDifference };
  })));
  return { id: result.id, scenario, mode: result.mode, acceptance: result.acceptance, stop: result.stop ?? null, used: result.used,
    summaries, consistency, profileDifferences, history, cells,
    pairs: pairs.map(({ taskId, family, student, r1, r2 }) => ({ taskId, family, student,
      r1: r1?.folder ?? null, r2: r2?.folder ?? null,
      sameInput: r1?.publicInputSha256 && r2?.publicInputSha256 ? r1.publicInputSha256 === r2.publicInputSha256 : null,
      oneSided: {
        r1: splitDimensions.filter(dim => r1?.scores[dim] != null && r2?.scores[dim] == null),
        r2: splitDimensions.filter(dim => r2?.scores[dim] != null && r1?.scores[dim] == null),
      },
    })),
    knownBoundaries: table(Object.keys(knownBoundaries), id => ({ ...knownBoundaries[id], rows: cells.filter(cell => cell.status === 'scored')
      .map(cell => ({ folder: cell.folder, taskId: cell.taskId, family: cell.family, student: cell.student, repetition: cell.repetition, ...cell.questions[id] })) })),
  };
}

const text = value => value == null ? '—' : String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('|', '&#124;').replaceAll('`', '&#96;').replace(/[\r\n]/g, ' ');
const number = value => value == null ? '—' : value.toFixed(3);
const percent = value => value == null ? '—' : `${(100 * value).toFixed(2)}%`;
const matched = ({ matched, pairs, rate }) => `${matched}/${pairs} (${percent(rate)})`;
const flip = ({ flips, pairs, rate, sufficient }) => `${flips}/${pairs} (${percent(rate)})${sufficient ? '' : '，证据不足'}`;
const shown = row => row.map(text).join(' | ');
const tableLines = (columns, rows) => [`| ${shown(columns)} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${shown(row)} |`), ''];

export function renderHeadroomReport(report) {
  const { summaries, consistency, history } = report;
  const groups = [['整体', summaries.overall], ...Object.entries(summaries.students), ...Object.entries(summaries.repetitions)];
  const pairs = [['整体', consistency.overall], ...Object.entries(consistency.students)];
  const same = report.pairs.filter(pair => pair.sameInput === true).length;
  const different = report.pairs.filter(pair => pair.sameInput === false).length;
  const missingCells = report.cells.filter(cell => Object.keys(cell.unobserved).length || cell.failedAttempts.length);
  return [
    '# 阶段 2b · 旧 normal 开发集余量', '',
    `运行 ${text(report.id)}。真实原件验真后生成。运行验收字段为 ${report.acceptance}。验收未通过也保留实际观察。`,
    `停止记录 ${text(report.stop == null ? '无' : JSON.stringify(report.stop))}。已用 ${text(report.used?.attempts)} 次预留尝试、${text(report.used?.requestedOutputTokens)} 请求输出 token。`,
    '本报告不设采用线、不选定目标维，不把工作评分器用于排名。', '',
    '## 分档和余量', '',
    '适用率以已观测格为分母。仅在适用格累计实得、满分和失分；无适用格时不报均值。N/A 是观察到的不适用，不是 0 分。缺失不计分。', '',
    ...tableLines(['分组', '维度', '计划', '已观测', '适用', '适用率', '未观测', '0 档', '1 档', '2 档', 'N/A', '均分', '实得 / 满分', '失分合计', '均值余量'],
      groups.flatMap(([group, byDimension]) => splitDimensions.map(dim => {
        const x = byDimension[dim];
        return [group, dimensions[dim], x.planned, x.observed, x.applicable, percent(x.applicableRate), x.missing, ...grades.map(score => x.counts[score]),
          number(x.mean), `${x.points} / ${x.possible}`, x.headroom, number(x.meanHeadroom)];
      }))),
    '## 两遍配对', '',
    '按题号和画像配对。适用状态和原始分档一致率只用双侧有合法分档的对，原始分档包括 N/A。双适用统计只用双侧均为整数分档的对。',
    `公开角色和正文 SHA256 相同 ${same} 对，不同 ${different} 对，无法比较 ${report.pairs.length - same - different} 对。消息 ID 不参加哈希。`,
    '新生成对话的分差混合了教师、学生和裁判波动，不能当作同输入裁判噪声。相同输入对和只有单侧有判决的维度见 [headroom.json](headroom.json) 的 pairs。', '',
    ...tableLines(['分组', '维度', '计划对', '双侧有判', '单侧有判', '双侧无判', '适用一致', '含 N/A 同档', '双适用同档', '双适用平均绝对分差'],
      pairs.flatMap(([group, byDimension]) => splitDimensions.map(dim => {
        const x = byDimension[dim];
        return [group, dimensions[dim], x.planned, x.observed, x.oneSided, x.neither, matched(x.applicability), matched(x.score),
          matched(x.bothApplicable), number(x.meanAbsoluteDifference)];
      }))),
    '## 历史 v3 同输入翻转和画像差', '',
    '历史翻转来自阶段 1 的同输入、同请求重复判定。历史无翻转、分母不足或两遍配对不足都不等于无噪声。', '',
    ...tableLines(['维度', '历史题位', '历史任一题', '历史分档', '对应二元题翻转', '历史注记'], splitDimensions.map(dim => {
      const x = history[dim];
      const note = x.score.flips ? '差异可能含裁判噪声' : x.questionBits.flips ? '观察到题位翻转，分档未动' : '未见翻转，不能认作无噪声';
      return [dimensions[dim], flip(x.questionBits), flip(x.anyQuestion), flip(x.score),
        Object.entries(x.questions).map(([id, rate]) => `${id} ${flip(rate)}`).join('；'), note];
    })),
    ...tableLines(['维度', '画像对', '画像适用数', '均分绝对差', '双适用对数', '两遍平均绝对分差', '可读范围'],
      splitDimensions.flatMap(dim => report.profileDifferences[dim].map(row => [dimensions[dim], row.students.join(' / '), row.applicable.join(' / '),
        number(row.difference), row.pairedApplicable, number(row.meanAbsoluteDifference),
        row.withinObservedRepeatDifference === null ? '缺适用分母或双侧适用对' : row.withinObservedRepeatDifference
          ? '只报告可见差异，不声称区分画像' : '差值较大，仍只作描述']))),
    '## 逐格证据', '',
    '分档和位置如下。每题的回答、引用消息 ID、callId、processIndex 和 attemptPath 见 [headroom.json](headroom.json) 的 cells → questions。', '',
    ...tableLines(['格目录', '题', '家族', '画像', '遍次', '状态', ...labels], report.cells.map(cell => [cell.folder, cell.taskId, cell.family,
      cell.student, cell.repetition, cell.status, ...splitDimensions.map(dim => cell.scores[dim])])),
    '### 缺格、缺判与调用失败', '',
    ...tableLines(['格目录', '状态', '终止故障', '未观测维度及分类', '失败尝试及分类'], missingCells.map(cell => [cell.folder, cell.status,
      [cell.failure?.kind, cell.failure?.role, cell.failure?.callId ?? cell.failure?.attemptPath].filter(Boolean).join('；'),
      Object.entries(cell.unobserved).map(([dim, reason]) => `${dimensions[dim]} ${reason}`).join('；'),
      cell.failedAttempts.map(row => `${row.callId ?? row.attemptPath ?? [row.role, row.turn, row.call, row.attempt].join(':')} ${row.failureKind}`).join('；')])),
    ...Object.entries(report.knownBoundaries).flatMap(([id, { title, note, rows }]) => [
      `### ${id} 已知边界：${title}`, '', note, '下表是回读索引，不把局部边界当作真实行为结论。按格目录打开 transcript.json 和 judge.json。', '',
      ...tableLines(['格目录', '回答', '引用消息 ID', 'callId'], rows.map(row => [row.folder, row.answer,
        Object.entries(row.messageIds).map(([slot, messageId]) => `${slot}=${messageId ?? '无引用'}`).join('；'), row.callId])),
    ]),
    '## 候选依据待人工回读', '',
    '实跑后按逐格证据表回读可定位的失分。记录相关维度的适用覆盖、r1 与 r2 各自余量、两遍一致性和历史分档翻转率。',
    '本段不写候选归属或采用阈值。历史零翻转不是通过证据。', '',
  ].join('\n');
}

function inside(parent, candidate) {
  const path = relative(parent, candidate);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}

export function writeHeadroomReport(id, root = 'runs', flipPath = defaultHistory) {
  runId(id);
  const verification = verifyRun(root, id);
  requireThat(verification.verified && verification.mode === 'real' && verification.scenario === scenario && verification.stage2b?.planned === 48,
    `expected a verified real stage2b-headroom run: ${id}`);
  const parent = realpathSync(root);
  const dir = realpathSync(join(parent, id));
  requireThat(dir !== parent && inside(parent, dir), `run directory escapes run root: ${id}`);
  function read(name, optional = false) {
    try {
      const path = realpathSync(join(dir, name));
      requireThat(inside(dir, path), `artifact escapes run directory: ${name}`);
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      if (!optional || error.code !== 'ENOENT') throw new Error(`cannot read ${name}: ${error.message}`);
    }
  }
  const result = read('result.json');
  requireThat(result?.id === id && result.mode === 'real' && result.scenario === scenario && result.acceptance === verification.acceptance
    && Array.isArray(result.cells) && result.cells.length === 48, 'not a verified stage2b-headroom result with 48 planned cells');
  const evidence = new Map(result.cells.map(cell => {
    validateCell(cell);
    const base = cell.folder;
    const telemetry = cell.status === 'not_started' ? undefined : read(`${base}/telemetry.json`, cell.status !== 'scored');
    return [base, { telemetry, ...(cell.status === 'scored' && {
      transcript: read(`${base}/transcript.json`), judge: read(`${base}/judge.json`),
    }) }];
  }));
  const flipBytes = readFileSync(flipPath);
  const report = buildHeadroomReport(result, evidence, flipBytes.toString('utf8'));
  report.identityId = verification.stage2b.identityId;
  report.historySource = { path: flipPath, sha256: hash(flipBytes), ruler: 'e1-binary-v3' };
  atomicJson(join(dir, 'headroom.json'), report, true);
  atomicBytes(join(dir, 'headroom-report.md'), Buffer.from(renderHeadroomReport(report)), true);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    requireThat(args.length >= 1 && args.length <= 3,
      'usage: node scripts/stage2b-headroom-report.mjs <run-id> [run-root] [stage1-flip-json]');
    writeHeadroomReport(...args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
