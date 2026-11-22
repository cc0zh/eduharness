import { writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { binaryQuestions, binaryRuler } from '../contracts/judge/binary.mjs';
import { splitBinaryRuler } from '../contracts/judge/binary-v3.mjs';
import { dimensions } from '../contracts/judge/schema.mjs';
import { readReport } from './report-artifacts.mjs';

const labels = {
  misconception_repair: '误解修复', support_escalation_and_fading: '增加与撤去支持', agency_handoff: '交还主动权',
  productive_struggle: '保留有益试错', representation_pivot: '表征转换', verification_or_transfer: '验证或迁移',
  M0: '有可回应的具体误解', M1: '教师给出辨析依据', M2: '学生独立修正同一错因', M3: '全解抢先替代修复',
  S0: '受阻或完成一步后仍有可推进步骤', S1: '同一卡点增加支持且仍留步骤', S2: '学生成功后交还决定并持续放手', S3: '首个实质回应给出全解',
  A1: '学生完成实质推理或检验', A2: '学生自己提出选择并说明理由或后果',
  P0: '有未完成的实质任务和回应机会', P1: '首个实质回应揭底', P2: '针对卡点提示且学生实际尝试', P3: '下一卡点过早替做',
  R0: '学生卡在教师已使用的表征', R1: '针对同一关系换表征', R2: '学生用新表征解释、推导或发现问题',
  V1: '要求解释或近迁移，未代做关键推理', V2: '学生独立说明正确依据或完成近迁移',
  teacher: '教师', learner: '学生', judge: '裁判', normal: '正常', answer_dump: '首答揭底', lecture: '讲授', sycophant_close: '附和收尾', no_teach: '无教学',
  baseline: 'B · 线性基线', candidate: 'S · 状态驱动候选', rhetoric: 'C · 话术负对照', default: '默认学生', stubborn: '顽固误解型', 'answer-seeker': '伸手要答案型',
  realVerified: '真实运行验真', complete: '必需格完整性', s1: 'S1 方向', directed: '定向可靠性', repeats: '重复配对完整性',
  machineA: 'A 交还主动权', cMean: 'C 均差', cFakeHits: 'C 假命中', exposure: 'C 有效暴露', blindHits: '盲核真命中', blindGainPairs: '盲核净真命中',
  p: 'P 保留有益试错', v: 'V 验证或迁移', total: '总适用分率', totalRate: '共同适用分率（百分点）',
  execution_success: '执行成功', infra_failure: '基础设施故障', input: '输入', output: '输出', cacheRead: '缓存读入', cacheWrite: '缓存写入',
  reasoning: '推理', totalTokens: '合计', attempts: '尝试', retries: '重试', requestedOutputTokens: '请求输出 token 额度', missingUsage: '缺报用量的次数',
};
const escape = value => String(value ?? '—').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const absent = '<span class="muted">—</span>';
const label = key => labels[key] ?? key;
const dialogueId = cell => `dialogue-${cell.key.replaceAll('/', '-')}`;
const messageId = (cell, n) => `${dialogueId(cell)}-msg-${n}`;
const jump = (cell, n, display, title, tone) =>
  `<a data-jump href="#${n ? messageId(cell, n) : dialogueId(cell)}" class="${tone}" title="${escape(title)}">${escape(display)}</a>`;

function decision(cell, refs, display, tone) {
  const cited = refs?.find(ref => ref.valid);
  return jump(cell, cited?.n, display, cited ? `定位证据 #${cited.n}` : '无可定位的单条引用，打开观察窗口', tone);
}

function citation(cell, ref) {
  const display = Number.isFinite(ref.n) ? `#${ref.n}` : ref.id ?? '#?';
  if (!ref.valid) return `<span class="issue" title="引用无法回读">${escape(display)}</span>`;
  const title = ref.conflict ? `未列在同维度的 evidence 中：${ref.id}` : ref.slot ? `证据位 ${ref.slot}：${ref.id}` : ref.id;
  return jump(cell, ref.n, display, title, ref.conflict ? 'ref issue' : 'ref');
}

const citations = (cell, refs) => refs?.length ? `<div class="refs">${refs.map(ref => citation(cell, ref)).join(' ')}</div>` : '';

function binaryRow(cell, key) {
  const row = cell.rows[key];
  if (row?.answer === undefined) return '<span class="muted">缺判定</span>';
  const label = row.answer ? 'Yes' : 'No';
  const status = decision(cell, row.refs, label, `mark ${row.answer ? 'yes' : 'no'}`);
  const applicability = row.gated && !row.answer ? decision(cell, [], 'N/A', 'mark muted') : '';
  return `${status} ${applicability}${citations(cell, row.refs)}`;
}

function binaryScore(cell, key, prefix) {
  const value = cell.scoring.scores[key];
  if (value === undefined) return absent;
  const refs = value === 'N/A' ? [] : Object.entries(cell.rows).flatMap(([question, row]) => question.startsWith(prefix) ? row.refs ?? [] : []);
  return decision(cell, refs, value, 'mark');
}

function v3Row(cell, key) {
  const row = cell.rows[key];
  if (row?.score === undefined) return '<span class="muted">缺判定</span>';
  const citedReason = row.reason.split(/(#[1-9]\d*\b)/g).map((part, i) => {
    if (i % 2 === 0) return escape(part);
    const ref = row.reasonRefs.find(x => x.n === Number(part.slice(1)));
    return ref ? citation(cell, ref) : `<span class="issue">${escape(part)}</span>`;
  }).join('');
  return `${decision(cell, row.refs, row.score ?? '未定档', 'mark')} ${citations(cell, row.refs)}${citedReason ? `<p class="reason">${citedReason}</p>` : ''}`;
}

const runName = (cell, format) => {
  const parts = cell.key.split('/');
  const id = format === 'stage3' ? parts[0] : parts.at(-1);
  return `<strong>${escape(label(id))}</strong><br><code>${escape(id)}</code><small>${jump(cell, undefined, '查看对话', '打开本格公开对话', 'ref')}</small>`;
};

function matrix(cells, format, caption, showQuestionText) {
  const binary = format !== 'v3';
  const cols = cells.map(cell => `<th scope="col">${runName(cell, format)}${cell.status ? `<small>${escape(label(cell.status))}</small>` : '<small>未记录</small>'}${cell.failure ? `<small class="issue">${escape(cell.failure)}</small>` : ''}</th>`).join('');
  const row = (heading, content, attr = '') => `<tr${attr}><th scope="row">${heading}</th>${cells.map(cell => `<td>${content(cell)}</td>`).join('')}</tr>`;
  const dimension = key => `${escape(label(key))}<small><code>${escape(key)}</code></small>`;
  const scores = dimensions.map((key, i) => row(dimension(key), cell => binary ? binaryScore(cell, key, 'MSAPRV'[i]) : v3Row(cell, key))).join('');
  const questions = binary ? Object.keys(binaryQuestions).map(key => row(`<b>${key}</b>${showQuestionText ? ` ${escape(label(key))}` : ''}`, cell => binaryRow(cell, key), ` data-question="${key}"`)).join('') : '';
  const total = row(binary ? '适用分率' : '有效总分', cell => {
    if (!binary) return cell.total === undefined ? absent : `<strong>${cell.total} / 12</strong>`;
    const { points, possible, rate } = cell.scoring;
    return points === undefined && possible === undefined && rate === undefined ? absent : `<strong>${escape(rate)}</strong><small>${escape(points)} / ${escape(possible)}</small>`;
  });
  return `<div class="table-scroll"><table><caption>${escape(caption)}</caption><thead><tr><th scope="col">${binary ? '是非题与维度' : '评分维度'}</th>${cols}</tr></thead>${binary ? `<tbody>${questions}</tbody>` : ''}
    <tbody><tr class="subhead"><th scope="colgroup" colspan="${cells.length + 1}">${binary ? '代码算出的维度分' : '原始分档（0–2）'}</th></tr>${scores}${total}</tbody></table></div>`;
}

function comparisons(report) {
  if (!report.comparisons.length) return '';
  const cells = new Map(report.cells.map(cell => [cell.key, cell]));
  const side = (key, value, dimension) => {
    const cell = cells.get(key);
    return value === undefined ? absent : cell ? decision(cell, cell.rows[dimension]?.refs, value, 'mark') : escape(value);
  };
  return `<details><summary>目标维度对照 · result.json.comparisons</summary><div class="table-scroll"><table><thead><tr><th>条件</th><th>目标维度</th><th>正常格</th><th>对照格</th><th>原件分差</th></tr></thead><tbody>${report.comparisons.map(row =>
    `<tr><th scope="row">${escape(label(row.cell))}</th><td>${escape(label(row.dimension))}</td><td>${side('normal', row.normal, row.dimension)}</td><td>${side(row.cell, row.variant, row.dimension)}</td><td>${escape(row.delta)}</td></tr>`).join('')}</tbody></table></div></details>`;
}

function pairedComparisons(rows) {
  if (!rows?.length) return '';
  const side = ({ delta, pairs }) => {
    const display = delta === undefined ? '—' : `${delta < 0 ? '−' : delta > 0 ? '+' : ''}${Math.abs(delta).toFixed(3)}`;
    return `${display}${pairs === undefined ? '' : `<small>${pairs} 对</small>`}`;
  };
  return `<div class="table-scroll"><table><caption>同题、同画像配对差 · report.json</caption><thead><tr><th scope="col">维度</th><th scope="col">S − B</th><th scope="col">C − B</th></tr></thead><tbody>
    ${rows.map(row => `<tr><th scope="row">${escape(label(row.name))}</th><td>${side(row.candidate)}</td><td>${side(row.rhetoric)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function dialogue(cells) {
  return `<aside class="dialogue" aria-labelledby="dialogue-title"><h2 id="dialogue-title">原对话</h2>
    ${cells.map((cell, i) => `<section id="${dialogueId(cell)}" data-dialogue="${escape(cell.key)}" tabindex="-1"${i ? ' hidden' : ''}><h3><code>${escape(cell.key)}</code></h3>${cell.messages.map(message =>
      `<article tabindex="-1" id="${messageId(cell, message.n)}" data-message="${escape(message.id)}" class="message"><h4>#${message.n} <span>${escape(label(message.role))}</span> <small>轮次 ${message.turn}</small></h4><p class="message-body">${escape(message.text)}</p><code class="muted">${escape(message.id)}</code></article>`).join('') || '<p class="muted">无可读取的公开对话。</p>'}</section>`).join('') || '<p class="muted">无格子记录。</p>'}</aside>`;
}

const details = values => `<dl>${values.map(([key, value]) => `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join('')}</dl>`;
const metrics = fields => Object.entries(fields).map(([key, value]) => [label(key), value]);

function usage(report) {
  const stored = metrics(report.usage);
  return `<section><h2>请求数与用量</h2><p><strong>请求数 ${escape(report.request?.[1] ?? '原件未记录')}</strong>${report.request ? `<small><code>${escape(report.request[0])}</code></small>` : ''}</p>
    ${stored.length ? details([...stored, ...metrics(report.usageMeta)]) : '<p class="muted">原件未记录用量汇总。</p>'}</section>`;
}

function telemetry(report) {
  const attempts = report.cells.flatMap(cell => cell.telemetry.map(row => ({ ...row, key: cell.key })));
  return attempts.length ? `<details><summary>逐次遥测 · telemetry.json</summary><div class="table-scroll"><table><thead><tr><th>格子</th><th>角色</th><th>轮次 / 调用 / 尝试</th><th>实报用量（token）</th></tr></thead><tbody>${attempts.map(row =>
    `<tr><td><code>${escape(row.key)}</code></td><td>${escape(label(row.role))}</td><td>${escape(row.turn)} / ${escape(row.call)} / ${escape(row.attempt)}</td><td>${metrics(row.usage).map(([name, value]) => `${escape(name)} ${escape(value)}`).join(' · ') || '未上报'}</td></tr>`).join('')}</tbody></table></div></details>` : '';
}

function runSummary(report) {
  const { gate, verification: ver, acceptance } = report;
  const gateLabel = value => ({ pass: '已过线', fail: '未过线', inconclusive: '不可判定', true: '已过线', false: '未过线' })[value];
  const gateStatus = !gate ? '本 run 无判线' : gate.decision ? `开发集筛选：${gateLabel(gate.decision)}（${gate.decision}）` : gate.statement ?? gateLabel(gate.passed);
  const verificationStatus = !ver ? '未验真' : ver.verified === true ? '已验真' : ver.conclusion === 'unfinished' ? '未正常收尾' : '验真未通过';
  const listed = [...(ver?.missing ?? []).map(value => `缺失：${value}`), ...(ver?.invalid ?? []).map(value => `无效：${value}`)];
  return `<header><p class="eyebrow">TeachArena · 离线评测回读</p><h1><code>${escape(report.id)}</code></h1><p class="muted">${escape(report.scenario)} · ${report.mode === 'real' ? '真实运行' : '离线运行'} · 不重算分数，不重新验真</p></header>
    <div class="facts"><section><h2>尺子与评测身份</h2>${details([['尺子', report.identity.ruler], ['评测身份版本', report.identity.version],
      ['裁判输出契约', report.identity.judgeOutputContract], ['评测身份 ID', report.identityId], ['预登记 SHA256', report.preregistration ?? '原件未记录']])}</section>
    <section><h2>判线</h2><p class="headline">${escape(gateStatus)}</p>${gate ? `<small><code>${escape(gate.source)}</code></small>${details([
      ...Object.entries(gate.checks ?? {}).map(([key, value]) => [key === 'normal' ? '常态四格' : label(key), gateLabel(value)]),
      ...(gate.ratePasses !== undefined ? [['分率方向均满足的遍次', gate.ratePasses]] : []), ...Object.entries(gate.targetHits ?? {}).map(([key, value]) => [`目标维命中 · ${label(key)}`, value]),
    ])}` : ''}<p class="muted">运行记录 acceptance：${escape(acceptance)}</p></section>
    <section><h2>验真</h2><p class="headline">${verificationStatus}</p>${ver ? `<small><code>${escape(ver.source)}</code> · 保存结果</small>${details([
      ['结论', ver.conclusion], ['进程退出码', ver.exitCode],
    ])}${listed.length ? `<ul>${listed.map(value => `<li class="issue">${escape(value)}</li>`).join('')}</ul>` : ''}` : ''}</section>${usage(report)}</div>${telemetry(report)}`;
}

const style = `
:root{color-scheme:light;font:15px/1.56 system-ui,sans-serif;--ink:#152c31;--muted:#4c6267;--border:#cbd8d6;--accent:#006763;--issue:#a01e2b}
*{box-sizing:border-box}body{margin:0;background:#eef3f2;color:var(--ink)}main{max-width:112rem;margin:auto;padding:1.5rem clamp(.85rem,2.5vw,2.5rem) 3rem}
h1,h2,h3,h4,p{margin:0 0 .45rem}h1{font-size:1.8rem;overflow-wrap:anywhere}h2{font-size:1.1rem}h3,h4{font-size:1rem}
header{margin-bottom:1rem}.eyebrow{color:var(--accent);font-weight:700}.headline{font-size:1.2rem;font-weight:750}.muted,small{color:var(--muted)}small{display:block;overflow-wrap:anywhere}code{overflow-wrap:anywhere}
.facts{display:grid;grid-template-columns:minmax(0,1.5fr) repeat(3,minmax(0,1fr));gap:.9rem;border-block:1px solid var(--border);padding:.75rem 0;margin-bottom:.85rem}.facts section{min-width:0;overflow-wrap:anywhere}.dialogue,.problems{border:1px solid var(--border);border-radius:.5rem;background:#fff;padding:1rem;margin:.85rem 0}.back-nav{margin-bottom:.75rem}.back-nav a{display:inline-block;padding:.24rem .6rem;border:1px solid var(--border);border-radius:.4rem;background:#fff;text-decoration:none;font-weight:650}
dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.18rem .65rem;margin:.4rem 0}dl:empty{display:none}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
.layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(18rem,32%);gap:1rem;align-items:start;margin-top:1.3rem}
.dialogue{position:sticky;top:.75rem;max-height:calc(100vh - 1.5rem);overflow:auto}.message{border:1px solid var(--border);padding:.8rem;margin-bottom:.7rem;border-radius:.5rem;scroll-margin:.6rem}.message h4 span{color:var(--accent);margin-inline:.3rem}.message h4 small{display:inline}.message-body{white-space:pre-wrap;overflow-wrap:anywhere}.message[aria-current=true]{outline:3px solid var(--accent);background:#d9f3ec}
.table-scroll{overflow:auto;border:1px solid var(--border);border-radius:.5rem;margin:.7rem 0 1rem;background:#fff}table{border-collapse:collapse;width:100%}caption{text-align:left;padding:.65rem .8rem;font-weight:750;color:#fff;background:#245b60}td,th{padding:.45rem .55rem;text-align:left;vertical-align:top;border-bottom:1px solid var(--border)}thead th,.subhead th{background:#e0eeec}tbody th{min-width:9rem}td{min-width:5rem}tbody tr:nth-child(even){background:#f7faf9}.reason{font-size:.88rem;margin:.35rem 0 0;min-width:11rem}
a{color:var(--accent)}a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}summary{cursor:pointer;font-weight:650;color:var(--accent)}.mark{display:inline-block;padding:.04rem .36rem;border-radius:.3rem;background:#e5efec;color:var(--ink);font-weight:700;white-space:nowrap}.mark.yes{background:#ccf0e2;color:#004f47}.mark.no{background:#f4e8df;color:#70351d}.refs{line-height:1.65}.ref{white-space:nowrap;font-size:.86em}.issue{color:var(--issue);font-weight:650}.problems{border:2px solid var(--issue);background:#fff1f1}.problems li{overflow-wrap:anywhere}.problems ul{margin:.5rem 0;padding-left:1.4rem}
[hidden]{display:none!important}@media(max-width:64rem){.facts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:58rem){.layout{grid-template-columns:minmax(0,1fr)}.dialogue{position:static;max-height:none}main{padding-bottom:1.2rem}}@media(max-width:30rem){.facts{grid-template-columns:minmax(0,1fr)}}
`;

const script = `
let selected;
let panel = document.querySelector('[data-dialogue]:not([hidden])');
function reveal(hash) {
  const target = document.getElementById(hash.slice(1));
  const next = target?.closest('[data-dialogue]');
  if (!next) return false;
  if (panel && panel !== next) panel.hidden = true;
  next.hidden = false;
  panel = next;
  selected?.removeAttribute('aria-current');
  selected = target === next ? null : target;
  selected?.setAttribute('aria-current', 'true');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: selected ? 'center' : 'start' });
  return true;
}
if (location.hash) reveal(location.hash);
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-jump]');
  if (link && reveal(link.getAttribute('href'))) event.preventDefault();
});
`;

function validateBackHref(backHref) {
  if (backHref === undefined) return undefined;
  if (typeof backHref !== 'string' || !/^(?:\.\.?\/)*[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.html(?:#[A-Za-z0-9_.-]+)?$/.test(backHref)) {
    throw Error('--back-href 必须是安全的相对 .html 路径（如 ../index.html）');
  }
  return backHref;
}

function render(report, backHref) {
  const { format } = report;
  const binary = format !== 'v3';
  const showQuestionText = [binaryRuler, splitBinaryRuler].includes(report.identity.ruler);
  const tables = new Map();
  for (const cell of report.cells) {
    const [first, task, student] = cell.key.split('/');
    const name = format === 'stage3' ? `${task} · ${label(student)}` : !binary ? '六维 v3' : task ? first : `诊断复测 · ${first.split('-')[0]}`;
    if (!tables.has(name)) tables.set(name, []);
    tables.get(name).push(cell);
  }
  const backNav = backHref ? `<nav class="back-nav" aria-label="返回导航"><a href="${escape(backHref)}">← 返回项目总览</a></nav>` : '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(report.id)} · TeachArena 评测回读</title><style>${style}</style></head><body><main>
${backNav}
${runSummary(report)}
${report.issues.length ? `<section class="problems" aria-labelledby="issues-title"><h2 id="issues-title">原件不一致或无法回读</h2><ul>${report.issues.map(({ path, detail }) => `<li class="issue"><code>${escape(path)}</code> ${escape(detail)}</li>`).join('')}</ul></section>` : ''}
<div class="layout"><div><h2>${binary ? '逐格判定矩阵' : '逐格六维分档'}</h2><p class="muted">${binary ? 'Yes / No 为裁判原始回答；N/A 为不适用，不是零分。' : 'v3 固定满分 12；不可与二元尺子的适用分率比较。'} 缺判定不计为 0。</p>
${comparisons(report)}${pairedComparisons(report.pairedDeltas)}${[...tables].map(([caption, cells]) => matrix(cells, format, caption, showQuestionText)).join('') || '<p>无格子记录。</p>'}</div>${dialogue(report.cells)}</div>
</main><script>${script}</script></body></html>
`;
}

export function exportReport(id, out, root = 'runs', { backHref } = {}) {
  const safeBackHref = validateBackHref(backHref);
  if (out !== undefined && !out.trim()) throw Error('--out 不能为空');
  if (out !== undefined && extname(out).toLowerCase() !== '.html') throw Error('--out 必须使用 .html 扩展名');
  if (out !== undefined && process.platform === 'win32' && out.replace(/^[a-z]:/i, '').includes(':')) {
    throw Error('--out 不支持 Windows alternate data stream（备用数据流）');
  }
  const data = readReport(root, id);
  const path = resolve(out ?? join(root, id, 'report.html'));
  writeFileSync(path, render(data, safeBackHref), { flag: 'wx' });
  return { id, path, issues: data.issues.length };
}
