import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { cellIds, filenames, modes, runId } from '../contracts/artifacts/schema.mjs';
import { hash } from '../contracts/core/schema.mjs';
import { binaryGates, binaryIdentityVersion, binaryOutputContract, binaryQuestions, binaryRuler, notApplicable } from '../contracts/judge/binary.mjs';
import { dimensions, directDimension, outputContract, ruler } from '../contracts/judge/schema.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim() !== '';
const count = value => Number.isSafeInteger(value) && value >= 0;
const number = Number.isFinite;
const picked = (value, fields, keep) => Object.fromEntries(fields.flatMap(key => keep(value?.[key]) ? [[key, value[key]]] : []));
const shown = value => object(value) || Array.isArray(value) ? '（结构值）' : JSON.stringify(value);
const usageFields = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'totalTokens'];
const verifyFields = ['verified', 'conclusion', 'acceptance', 'mode', 'head', 'exitCode', 'requestCount', 'observedRequestCount', 'missing', 'invalid'];
const assessmentFields = ['passed', 'ratePasses', 'targetHits', 'paired'];

function files(root, id, note) {
  function open(path, required, parse) {
    const parts = [resolve(root), id, ...path.split('/')];
    try {
      let file = '';
      for (const [index, part] of parts.entries()) {
        file = join(file, part);
        const stat = lstatSync(file);
        if (stat.isSymbolicLink()) throw Error('拒绝链接（symlink）');
        if (!(index === parts.length - 1 ? stat.isFile() : stat.isDirectory())) throw Error('不是对应的文件或目录');
      }
      return parse(readFileSync(file, 'utf8'));
    } catch (error) {
      if (required) throw Error(`${path}: ${error.code === 'ENOENT' ? '原件不存在' : error.message}`);
      if (error.code !== 'ENOENT') note(path, error.code ?? error.message);
    }
  }
  return {
    json: (path, valid = object, required = false) => open(path, required, source => {
      let data;
      try { data = JSON.parse(source); }
      catch { throw Error('不是完整的 JSON'); }
      if (!valid(data)) throw Error('JSON 结构不符');
      return data;
    }),
    markdown: path => open(path, false, source => source),
  };
}

function formatOf({ scenario, mode, phase, identity }) {
  if (!modes.includes(mode) || phase !== undefined || !object(identity) || identity.freeze !== undefined) return;
  const { ruler: name, version, judgeOutputContract: contract } = identity;
  if (scenario === 'S1-binary' && (
    name === 'e1-binary-v1' && version === 'evaluation-identity-v3' && contract === 'judge-output-v3' ||
    name === binaryRuler && version === binaryIdentityVersion && contract === binaryOutputContract
  )) return 'binary';
  if (['E1', 'E2', 'E1-judge-only', 'E2-judge-only'].includes(scenario) &&
    name === ruler && version === 'evaluation-identity-v2' && contract === outputContract) return 'v3';
}

function coordinate(binary, row, planned = false) {
  const id = planned && binary ? row?.condition : planned ? row : row?.id;
  if (!cellIds.includes(id)) return;
  if (!binary) return id;
  if (typeof row?.repetition === 'string' && /^r[1-9]\d*$/.test(row.repetition)) return `${row.repetition}/${id}`;
}

function collectCells(binary, manifest, result, note) {
  const planned = new Set();
  const cells = new Map();
  for (const [i, row] of (Array.isArray(manifest.planned) ? manifest.planned : []).entries()) {
    const path = coordinate(binary, row, true);
    if (!path || planned.has(path)) note(`manifest.json.planned[${i}]`, '无效或重复的格子坐标');
    else planned.add(path);
  }
  for (const [i, row] of result.cells.entries()) {
    const path = coordinate(binary, row);
    if (!path || cells.has(path)) note(`result.json.cells[${i}]`, '无效或重复的格子坐标');
    else {
      if (planned.size && !planned.has(path)) note(`result.json.cells[${i}] · ${path}`, '不在 manifest.json.planned');
      cells.set(path, row);
    }
  }
  return [...new Set([...planned, ...cells.keys()])].map(key => [key, cells.get(key)]);
}

function dialogue(raw, binding, key, note) {
  const path = `${key}/${filenames.transcript}`;
  const bindingPath = `${key}/${filenames.judge}.binding.messageIds`;
  const matchingView = binding?.viewHash === undefined || !raw || binding.viewHash === hash(raw);
  if (!matchingView) note(`${key}/${filenames.judge}.binding.viewHash`, `与 ${path} 的观察窗口摘要不同`);
  const messages = new Map(), ids = new Map();
  for (const [i, message] of (raw ?? []).entries()) {
    const n = i + 1;
    if (!object(message) || !text(message.id) || !['teacher', 'learner'].includes(message.role) || !count(message.turn) || !text(message.text)) {
      note(`${path} #${n}`, '消息 id、role、turn 或 text 不符合公开对话结构');
      continue;
    }
    const { id, role, turn, text: body } = message;
    messages.set(n, { id, role, turn, text: body, n });
    if (ids.has(id)) note(`${path} #${n}.id`, `重复消息 ID：${id}`);
    ids.set(id, ids.has(id) ? null : n);
  }
  const order = Array.isArray(binding?.messageIds) ? binding.messageIds : [];
  const positions = new Map();
  for (const [i, id] of order.entries()) positions.set(id, positions.has(id) ? null : i + 1);
  if (binding) {
    if (!Array.isArray(binding.messageIds) || order.length !== raw?.length) note(bindingPath, `消息数量与 ${path} 不同`);
    for (const [n, message] of messages) if (order[n - 1] !== message.id) note(`${bindingPath} #${n}`, `与 ${path} #${n}.id 不同`);
  }
  function reference(n, id, where, expectedRole) {
    const message = messages.get(n);
    const ok = matchingView && count(n) && n > 0 && message && message.id === id && order[n - 1] === id && ids.get(id) === n &&
      positions.get(id) === n && (!expectedRole || message.role === expectedRole);
    if (!ok && matchingView) note(`${where} #${number(n) ? n : '?'}`, `不能与 ${bindingPath}、${path} 的消息 ID、序号或角色对应`);
    return { n, id: text(id) ? id : undefined, valid: Boolean(ok) };
  }
  return { messages: [...messages.values()], reference, byId: (id, where) => reference(positions.get(id), id, where),
    byNumber: (n, where) => reference(n, order[n - 1], where) };
}

function binaryRows(verdict, chat, path, note) {
  if (!object(verdict)) return {};
  return Object.fromEntries(Object.entries(binaryQuestions).map(([key, spec]) => {
    const row = verdict.answers?.[key];
    const field = `${path}.verdict.answers.${key}`;
    if (typeof row?.answer !== 'boolean') { note(`${field}.answer`, '缺少原始 Yes / No'); return [key, {}]; }
    const ids = verdict.messageIds?.[key];
    const refs = [];
    for (const [slot, role] of Object.entries(spec.evidence)) {
      const n = row.evidence?.[slot];
      const id = ids?.[slot];
      if (n === null && id === undefined && (!row.answer || spec.optional.includes(slot))) continue;
      if (!row.answer) note(`${field}.evidence.${slot}`, 'No 的证据位必须为 null 且没有消息 ID');
      const ref = chat.reference(n, id, `${field}.evidence.${slot} ↔ ${path}.verdict.messageIds.${key}.${slot}`, role);
      refs.push({ ...ref, valid: row.answer && ref.valid, slot });
    }
    const gate = Object.keys(binaryGates).find(gate => binaryGates[gate].includes(key));
    return [key, { answer: row.answer, refs, gated: verdict.answers?.[gate]?.answer === false }];
  }));
}

function v3Rows(judge, chat, path, note) {
  if (!judge) return {};
  return Object.fromEntries(dimensions.map((key, i) => {
    const group = i < 4 ? 'teaching' : 'consolidation';
    const row = judge.groups?.[group]?.[key];
    const field = `${path}.groups.${group}.${key}`;
    if (![0, 1, 2, null].includes(row?.score)) { note(`${field}.score`, '缺少原始分档'); return [key, {}]; }
    const storedRefs = Array.isArray(row.evidence) ? row.evidence.map(id => chat.byId(id, `${field}.evidence`)) : [];
    const slots = Array.isArray(row.evidence_groups) ? row.evidence_groups.flatMap(group => Object.values(group?.slots ?? {})) : [];
    const refs = [...storedRefs];
    for (const slot of slots) for (const name of ['message_ids', 'opportunity_message_ids']) {
      if (Array.isArray(slot?.[name])) for (const id of slot[name]) if (!refs.some(ref => ref.id === id)) refs.push(chat.byId(id, `${field}.evidence_groups.${name}`));
    }
    const reason = text(row.reason) ? row.reason : '';
    const reasonRefs = [...new Set([...reason.matchAll(/#([1-9]\d*)\b/g)].map(([, n]) => Number(n)))].map(n => {
      const stored = storedRefs.find(ref => ref.n === n);
      if (stored) return stored;
      note(`${field}.reason #${n}`, '未列在同维度的 evidence 中');
      return { ...chat.byNumber(n, `${field}.reason`), conflict: true };
    });
    return [key, { score: row.score, reason, reasonRefs, refs }];
  }));
}

function loadCell(read, key, result, manifest, binary, note, compare) {
  const judgePath = `${key}/${filenames.judge}`;
  const resultPath = `result.json.cells[${key}]`;
  const judge = read.json(judgePath);
  const raw = read.json(`${key}/${filenames.transcript}`, Array.isArray);
  const { binding } = judge ?? {};
  const outcome = binary ? judge?.verdict : judge?.groups;
  if ((result || judge) && !raw) note(`${key}/${filenames.transcript}`, '没有可读取的公开对话');
  if (result?.scored && !outcome) note(judgePath, 'result.json 已记录分数，但缺判定');
  if (outcome && (!result || result.scored === false)) note(judgePath, `有判定，但 ${resultPath}.scored 未记录分数`);
  if (judge && !object(binding)) note(`${judgePath}.binding`, '缺少证据绑定');
  if (object(binding)) for (const [name, expected] of [['runId', manifest.id], ['ruler', manifest.identity.ruler], ['cell', key.split('/').at(-1)], ...(binary ? [['repetition', key.split('/')[0]]] : [])]) {
    if (binding[name] !== expected) note(`${judgePath}.binding.${name}`, `与本格或 manifest.json 不同：${shown(binding[name])} ≠ ${shown(expected)}`);
  }
  const chat = dialogue(raw, binding, key, note);
  const rows = binary ? binaryRows(outcome, chat, judgePath, note) : v3Rows(judge, chat, judgePath, note);
  let scoring;
  if (binary) {
    const a = outcome?.scoring, b = result?.scoring;
    for (const field of ['ruler', 'points', 'possible', 'rate', 'applicable']) compare(`${judgePath}.verdict.scoring.${field}`, a?.[field], `${resultPath}.scoring.${field}`, b?.[field]);
    for (const key of dimensions) compare(`${judgePath}.verdict.scoring.scores.${key}`, a?.scores?.[key], `${resultPath}.scoring.scores.${key}`, b?.scores?.[key]);
    compare(`${judgePath}.verdict.scoring.rate`, a?.rate, `${resultPath}.rate`, result?.rate);
    compare(`${resultPath}.scoring.rate`, b?.rate, `${resultPath}.rate`, result?.rate);
    const saved = a ?? b;
    scoring = { ...picked(saved, ['points', 'possible', 'rate'], number), scores: picked(saved?.scores, dimensions, value => [0, 1, 2, notApplicable].includes(value)) };
    for (const [path, record] of [[`${judgePath}.verdict.scoring`, a], [`${resultPath}.scoring`, b]]) {
      if (record) compare(`${path}.ruler`, record.ruler, 'manifest.json.identity.ruler', manifest.identity.ruler);
    }
  } else {
    compare(`${judgePath}.groups.teaching.${directDimension}.score`, rows[directDimension]?.score, `${resultPath}.directAnswer`, result?.directAnswer);
  }
  const telemetry = (read.json(`${key}/telemetry.json`, Array.isArray) ?? []).filter(object).map(row => ({
    role: ['teacher', 'learner', 'judge'].includes(row.role) ? row.role : undefined,
    ...picked(row, ['turn', 'call', 'attempt'], count), usage: picked(row.usage, usageFields, count),
  }));
  return { key, messages: chat.messages, rows, scoring, telemetry, total: number(result?.total) ? result.total : undefined,
    status: text(result?.status) ? result.status : undefined, failure: text(result?.failure?.kind) ? result.failure.kind : undefined };
}

function savedGate(read, result, summary, binary, compare) {
  const candidates = [['result.json.assessment', result.assessment], ['result.json.report', result.report], ['s1-binary-summary.json', summary]];
  const gates = candidates.filter(([, item]) => object(item) && typeof item.passed === 'boolean');
  for (const [otherPath, other] of gates.slice(1)) for (const field of assessmentFields) {
    compare(`${gates[0][0]}.${field}`, gates[0][1][field], `${otherPath}.${field}`, other[field]);
  }
  const markdown = binary ? 's1-binary-report.md' : 'review.md';
  const section = read.markdown(markdown)?.match(/^#{1,6} (?:预登记)?判线[^\S\r\n]*\r?\n\s*([^\r\n#][^\r\n]*)/m);
  const statement = section?.[1].trim();
  const flag = statement?.match(/^(?:\*\*)?(?:机器判线)?(已过线|未过线)/)?.[1];
  if (gates.length && flag) compare(`${gates[0][0]}.passed`, gates[0][1].passed, `${markdown} § 预登记判线`, flag === '已过线');
  const [source, data] = gates[0] ?? [];
  if (data) return { source, passed: data.passed, ratePasses: count(data.ratePasses) ? data.ratePasses : undefined,
    targetHits: picked(data.targetHits, cellIds, count) };
  if (statement) return { source: markdown, statement };
  return null;
}

function comparisons(result, cells, compare) {
  if (!Array.isArray(result.comparisons)) return [];
  const byKey = new Map(cells.map(cell => [cell.key, cell]));
  return result.comparisons.flatMap((row, i) => {
    if (!cellIds.includes(row?.cell) || !dimensions.includes(row?.dimension)) return [];
    const { cell, dimension, delta } = row;
    const readSide = (name, key) => {
      const value = row[name]?.score;
      compare(`result.json.comparisons[${i}].${name}.score`, value, `${key}/judge.json.groups.${dimension}.score`, byKey.get(key)?.rows[dimension]?.score);
      return number(value) ? value : undefined;
    };
    return [{ cell, dimension, normal: readSide('normal', 'normal'), variant: readSide('variant', cell), delta: number(delta) ? delta : undefined }];
  });
}

export function readReport(root, id) {
  const issues = [];
  const note = (path, detail) => issues.push({ path, detail });
  const compare = (left, a, right, b) => {
    if (a !== undefined && b !== undefined && !same(a, b)) note(left, `与 ${right} 不同：${shown(a)} ≠ ${shown(b)}`);
  };
  const read = files(root, runId(id), note);
  const manifest = read.json(filenames.manifest, object, true);
  const format = formatOf(manifest);
  if (!format || manifest.id !== id) throw Error('manifest.json: scenario、identity 或 id 不是支持的公开评测身份');
  const result = read.json(filenames.result, object, true);
  if (!Array.isArray(result.cells)) throw Error('result.json.cells: 预期格子数组');
  const binary = format === 'binary';
  for (const key of ['id', 'scenario', 'taskId', 'mode', 'identityId']) compare(`manifest.json.${key}`, manifest[key], `result.json.${key}`, result[key]);
  const summary = binary ? read.json('s1-binary-summary.json') : undefined;
  compare('manifest.json.identity.preregistrationSha256', manifest.identity.preregistrationSha256, 's1-binary-summary.json.preregistrationSha256', summary?.preregistrationSha256);
  const verification = read.json('verify-run.json');
  if (verification) {
    if (typeof verification.verified !== 'boolean') note('verify-run.json.verified', '缺少布尔验真结果');
    compare('manifest.json.id', id, 'verify-run.json.runId', verification.runId);
    compare('manifest.json.mode', manifest.mode, 'verify-run.json.mode', verification.mode);
    if (typeof verification.acceptance === 'boolean') compare('result.json.acceptance', result.acceptance, 'verify-run.json.acceptance', verification.acceptance);
    for (const key of verifyFields) compare(`verify-run.json.${key}`, verification[key], `s1-binary-summary.json.verification.${key}`, summary?.verification?.[key]);
  }
  const cells = collectCells(binary, manifest, result, note).map(([key, outcome]) => loadCell(read, key, outcome, manifest, binary, note, compare));
  const gate = savedGate(read, result, summary, binary, compare);
  const usage = [['result.json.usage', result.usage], ['s1-binary-summary.json.usage', summary?.usage]];
  const usageReports = usage.map(([path, data]) => object(data?.usage) ? [`${path}.usage`, data.usage] : [path, data]);
  const [[left, a], [right, b]] = usageReports;
  for (const field of usageFields) compare(`${left}.${field}`, a?.[field], `${right}.${field}`, b?.[field]);
  const requestSources = [['verify-run.json.requestCount', verification?.requestCount], ['s1-binary-summary.json.usage.requests', summary?.usage?.requests],
    ['result.json.requestCount', result.requestCount], ['verify-run.json.observedRequestCount', verification?.observedRequestCount]].filter(([, n]) => count(n));
  for (const [path, n] of requestSources.slice(1)) compare(requestSources[0][0], requestSources[0][1], path, n);
  const v3Comparisons = binary ? [] : comparisons(result, cells, compare);
  return { id, format, cells, gate, issues, comparisons: v3Comparisons, mode: manifest.mode, scenario: manifest.scenario,
    identityId: text(manifest.identityId) ? manifest.identityId : undefined, identity: picked(manifest.identity, ['ruler', 'version', 'judgeOutputContract'], text),
    preregistration: [manifest.identity.preregistrationSha256, summary?.preregistrationSha256].find(text),
    acceptance: typeof result.acceptance === 'boolean' ? result.acceptance : undefined,
    verification: verification && { ...picked(verification, verifyFields, v => typeof v === 'boolean' || text(v) || count(v)),
      missing: Array.isArray(verification.missing) ? verification.missing.filter(text) : [], invalid: Array.isArray(verification.invalid) ? verification.invalid.filter(text) : [] },
    request: requestSources[0], usage: Object.assign({}, ...usageReports.map(([, data]) => picked(data, usageFields, count))),
    usageMeta: picked(summary?.usage ?? result.usage, ['attempts', 'retries', 'requestedOutputTokens', 'missingUsage'], count) };
}
