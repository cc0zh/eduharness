import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { stage3DevTasks, stage3Scenario } from '../config/stage3.mjs';
import { cellIds, filenames, modes, runId } from '../contracts/artifacts/schema.mjs';
import { hash } from '../contracts/core/schema.mjs';
import { binaryGates, binaryIdentityVersion, binaryOutputContract, binaryQuestions, binaryRuler, notApplicable } from '../contracts/judge/binary.mjs';
import { splitBinaryIdentityVersion, splitBinaryOutputContract, splitBinaryRuler, splitDimensions, splitQuestions } from '../contracts/judge/binary-v3.mjs';
import { dimensions, directDimension, outputContract, ruler } from '../contracts/judge/schema.mjs';
import { judgeFreezeScenario } from './judge-bakeoff-plan.mjs';

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
  if (!modes.includes(mode) || phase !== undefined || !object(identity)) return;
  const { ruler: name, version, judgeOutputContract: contract } = identity;
  const split = name === splitBinaryRuler && contract === splitBinaryOutputContract;
  if (scenario === judgeFreezeScenario && mode === 'real' && split && version === splitBinaryIdentityVersion && object(identity.freeze)) return 'freeze';
  if (identity.freeze !== undefined) return;
  if (scenario === stage3Scenario && mode === 'real' && split && version === 'stage3-dev-v2') return 'stage3';
  if (scenario === 'S1-binary' && (
    name === 'e1-binary-v1' && version === 'evaluation-identity-v3' && contract === 'judge-output-v3' ||
    name === binaryRuler && version === binaryIdentityVersion && contract === binaryOutputContract
  )) return 'binary';
  if (['E1', 'E2', 'E1-judge-only', 'E2-judge-only'].includes(scenario) &&
    name === ruler && version === 'evaluation-identity-v2' && contract === outputContract) return 'v3';
}

function coordinate(format, row, planned = false) {
  if (format === 'stage3') {
    if (!['baseline', 'candidate', 'rhetoric'].includes(row?.arm) || !stage3DevTasks.some(task => task.id === row.taskId) ||
      !['default', 'stubborn', 'answer-seeker'].includes(row.student)) return;
    const key = `${row.arm}/${row.taskId}/${row.student}`;
    return row.folder === key ? key : undefined;
  }
  if (format === 'freeze' && row?.repetition === undefined) {
    return typeof row?.id === 'string' && /^[a-z\d][a-z\d-]{0,63}$/i.test(row.id) ? row.id : undefined;
  }
  const binary = format !== 'v3';
  const id = planned && binary ? row?.condition : planned ? row : row?.id;
  if (!cellIds.includes(id)) return;
  if (!binary) return id;
  if (typeof row.repetition !== 'string' || !/^r[1-9]\d*$/.test(row.repetition)) return;
  const key = `${row.repetition}/${id}`;
  return format === 'freeze' && planned && row.id !== key ? undefined : key;
}

function collectCells(format, manifest, result, note) {
  const planned = new Set();
  const cells = new Map();
  for (const [i, row] of (Array.isArray(manifest.planned) ? manifest.planned : []).entries()) {
    const path = coordinate(format, row, true);
    if (!path || planned.has(path)) note(`manifest.json.planned[${i}]`, '无效或重复的格子坐标');
    else planned.add(path);
  }
  for (const [i, row] of result.cells.entries()) {
    const path = coordinate(format, row);
    if (!path || cells.has(path)) note(`result.json.cells[${i}]`, '无效或重复的格子坐标');
    else {
      if (planned.size && !planned.has(path)) note(`result.json.cells[${i}] · ${path}`, '不在 manifest.json.planned');
      cells.set(path, row);
    }
  }
  return [...new Set([...planned, ...cells.keys()])].map(key => [key, cells.get(key)]);
}

function dialogue(raw, binding, key, note, bindingValid) {
  const path = `${key}/${filenames.transcript}`;
  const bindingPath = `${key}/${filenames.judge}.binding.messageIds`;
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
    const ok = bindingValid && count(n) && n > 0 && message && message.id === id && order[n - 1] === id && ids.get(id) === n &&
      positions.get(id) === n && (!expectedRole || message.role === expectedRole);
    if (!ok && bindingValid) note(`${where} #${number(n) ? n : '?'}`, `不能与 ${bindingPath}、${path} 的消息 ID、序号或角色对应`);
    return { n, id: text(id) ? id : undefined, valid: Boolean(ok) };
  }
  return { messages: [...messages.values()], reference, byId: (id, where) => reference(positions.get(id), id, where),
    byNumber: (n, where) => reference(n, order[n - 1], where) };
}

const dimensionForQuestion = Object.fromEntries(splitDimensions.flatMap(dimension => Object.keys(splitQuestions[dimension]).map(key => [key, dimension])));

function binaryRows(verdict, chat, path, note, split) {
  if (!object(verdict)) return {};
  return Object.fromEntries(Object.entries(binaryQuestions).map(([key, spec]) => {
    const row = verdict.answers?.[key];
    const field = `${path}.verdict.answers.${key}`;
    if (typeof row?.answer !== 'boolean') { note(`${field}.answer`, '缺少原始 Yes / No'); return [key, {}]; }
    const dimension = dimensionForQuestion[key];
    const refs = [];
    for (const [slot, role] of Object.entries(spec.evidence)) {
      const shared = split && !Object.hasOwn(splitQuestions[dimension][key].evidence, slot);
      if (shared && !row.answer && !Object.hasOwn(binaryGates, key)) continue;
      const fromR1 = shared && key === 'R2' && slot === 'newFrame';
      const question = fromR1 ? 'R1' : key;
      const fromAnchor = shared && !fromR1;
      const n = fromAnchor ? verdict.anchors?.[dimension]?.[slot] : verdict.answers?.[question]?.evidence?.[slot];
      const id = fromAnchor ? verdict.anchorMessageIds?.[dimension]?.[slot] : verdict.messageIds?.[question]?.[slot];
      if (n === null && id === undefined && (!row.answer || spec.optional.includes(slot))) continue;
      const evidenceField = fromAnchor ? `anchors.${dimension}.${slot}` : `answers.${question}.evidence.${slot}`;
      const idField = fromAnchor ? `anchorMessageIds.${dimension}.${slot}` : `messageIds.${question}.${slot}`;
      if (!row.answer) note(`${path}.verdict.${evidenceField}`, 'No 的证据位必须为 null 且没有消息 ID');
      const ref = chat.reference(n, id, `${path}.verdict.${evidenceField} ↔ ${path}.verdict.${idField}`, role);
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

function loadCell(read, key, result, manifest, format, note, compare) {
  const binary = format !== 'v3';
  const judgePath = `${key}/${filenames.judge}`;
  const resultPath = `result.json.cells[${key}]`;
  const judge = read.json(judgePath);
  const raw = read.json(`${key}/${filenames.transcript}`, Array.isArray);
  const { binding } = judge ?? {};
  const coordinates = { runId: manifest.id, ruler: manifest.identity.ruler, cell: format === 'stage3' ? key : key.split('/').at(-1),
    ...(binary && { repetition: format !== 'stage3' && key.includes('/') ? key.split('/')[0] : undefined }) };
  let bindingMatches = object(binding);
  if (bindingMatches) {
    for (const [name, expected] of Object.entries(coordinates)) {
      if (binding[name] !== expected) {
        note(`${judgePath}.binding.${name}`, `与本格或 manifest.json 不同：${shown(binding[name])} ≠ ${shown(expected)}`);
        bindingMatches = false;
      }
    }
  }
  const matchingView = object(binding) && Array.isArray(raw) && binding.viewHash === hash(raw);
  if (!matchingView) note(`${judgePath}.binding.viewHash`, `缺少有效的观察窗口摘要或与 ${key}/${filenames.transcript} 不同`);
  const messageIdsMatch = Array.isArray(raw) && Array.isArray(binding?.messageIds) && raw.length === binding.messageIds.length &&
    raw.every((message, index) => message?.id === binding.messageIds[index]);
  const bindingValid = bindingMatches && matchingView && messageIdsMatch;
  const outcome = bindingValid ? (binary ? judge?.verdict : judge?.groups) : undefined;
  if ((result || judge) && !raw) note(`${key}/${filenames.transcript}`, '没有可读取的公开对话');
  const scored = format === 'stage3' && result ? result.status === 'scored' : result?.scored;
  if (scored && !outcome) note(judgePath, judge && !bindingValid ? '判决绑定无效，未用于矩阵' : 'result.json 已记录分数，但缺判定');
  if (outcome && (!result || scored === false)) note(judgePath, `有判定，但 ${resultPath} 未记录分数`);
  if (judge && !object(binding)) note(`${judgePath}.binding`, '缺少证据绑定');
  const chat = dialogue(raw, binding, key, note, bindingValid);
  const rows = binary ? binaryRows(outcome, chat, judgePath, note, manifest.identity.ruler === splitBinaryRuler) : v3Rows(bindingValid ? judge : undefined, chat, judgePath, note);
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

const gateStatus = value => ['pass', 'fail', 'inconclusive'].includes(value);

function stage3Report(read, result, compare) {
  const source = 'report.json';
  const saved = read.json(source, value => object(value) && value.devScreenOnly === true && value.adoption === false && gateStatus(value.decision));
  if (!saved) return {};
  compare(`${source}.decision`, saved.decision, 'result.json.decision', result.decision);
  const paired = (name, record, value) => ({ name, ...Object.fromEntries(['candidate', 'rhetoric'].map(arm => [arm, {
    delta: number(record?.[arm]?.[value]) ? record[arm][value] : undefined,
    pairs: count(record?.[arm]?.pairs) ? record[arm].pairs : undefined,
  }])) });
  const pairedDeltas = dimensions.map(key => paired(key, saved.dimensions?.[key]?.pairedFromBaseline, 'mean'));
  pairedDeltas.push(paired('totalRate', saved.totalRate, 'points'));
  const gates = ['machineA', 'cMean', 'cFakeHits', 'exposure', 'blindHits', 'blindGainPairs', 'p', 'v', 'total'];
  return { pairedDeltas, gate: saved.decision === result.decision ? { source, decision: saved.decision,
    checks: Object.fromEntries(gates.flatMap(key => gateStatus(saved.gates?.[key]?.status) ? [[key, saved.gates[key].status]] : [])) } : null };
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
  for (const key of ['id', 'scenario', 'taskId', 'mode', 'identityId']) {
    if (manifest[key] !== undefined && result[key] !== undefined && manifest[key] !== result[key]) {
      throw Error(`result.json.${key} 与 manifest.json.${key} 不同`);
    }
  }
  if (!Array.isArray(result.cells)) throw Error('result.json.cells: 预期格子数组');
  const binary = format !== 'v3';
  for (const key of ['id', 'scenario', 'taskId', 'mode', 'identityId']) compare(`manifest.json.${key}`, manifest[key], `result.json.${key}`, result[key]);
  const summary = format === 'binary' ? read.json('s1-binary-summary.json') : undefined;
  compare('manifest.json.identity.preregistrationSha256', manifest.identity.preregistrationSha256, 's1-binary-summary.json.preregistrationSha256', summary?.preregistrationSha256);
  const freezeSource = 'freeze-retest-summary.json';
  const freeze = format === 'freeze' ? read.json(freezeSource, value => object(value) && value.runId === id && value.mode === manifest.mode && typeof value.frozen === 'boolean') : undefined;
  const verificationRecords = [['verify-run.json', read.json('verify-run.json')], [`${freezeSource}.details.verification`, freeze?.details?.verification]].filter(([source, data]) => {
    if (!data) return false;
    if (data.runId !== id) note(`${source}.runId`, `与 manifest.json.id 不同：${shown(data.runId)} ≠ ${shown(id)}`);
    if (data.mode !== manifest.mode) note(`${source}.mode`, `与 manifest.json.mode 不同：${shown(data.mode)} ≠ ${shown(manifest.mode)}`);
    return data.runId === id && data.mode === manifest.mode;
  });
  const [verificationSource, verification] = verificationRecords[0] ?? [];
  if (verification) {
    if (typeof verification.verified !== 'boolean') note(`${verificationSource}.verified`, '缺少布尔验真结果');
    if (typeof verification.acceptance === 'boolean') compare('result.json.acceptance', result.acceptance, `${verificationSource}.acceptance`, verification.acceptance);
    for (const [source, data] of [...verificationRecords.slice(1), ['s1-binary-summary.json.verification', summary?.verification]]) {
      for (const key of verifyFields) compare(`${verificationSource}.${key}`, verification[key], `${source}.${key}`, data?.[key]);
    }
  }
  const cells = collectCells(format, manifest, result, note).map(([key, outcome]) => loadCell(read, key, outcome, manifest, format, note, compare));
  const experiment = format === 'stage3' ? stage3Report(read, result, compare) : {};
  const gate = format === 'stage3' ? experiment.gate : format === 'freeze' ? freeze && {
    source: freezeSource, statement: freeze.frozen ? '冻结复测已过线' : '冻结复测未过线',
    checks: picked(freeze.gates, ['realVerified', 'complete', 's1', 'directed', 'normal', 'repeats'], value => typeof value === 'boolean'),
    ratePasses: count(freeze.details?.s1?.ratePasses) ? freeze.details.s1.ratePasses : undefined,
    targetHits: picked(freeze.details?.s1?.targetHits, cellIds, count),
  } : savedGate(read, result, summary, binary, compare);
  const usage = [['result.json.usage', result.usage], ['s1-binary-summary.json.usage', summary?.usage]];
  const usageReports = usage.map(([path, data]) => object(data?.usage) ? [`${path}.usage`, data.usage] : [path, data]);
  const [[left, a], [right, b]] = usageReports;
  for (const field of usageFields) compare(`${left}.${field}`, a?.[field], `${right}.${field}`, b?.[field]);
  const requestSources = [[`${verificationSource}.requestCount`, verification?.requestCount], ['s1-binary-summary.json.usage.requests', summary?.usage?.requests],
    ['result.json.requestCount', result.requestCount], [`${verificationSource}.observedRequestCount`, verification?.observedRequestCount]].filter(([, n]) => count(n));
  for (const [path, n] of requestSources.slice(1)) compare(requestSources[0][0], requestSources[0][1], path, n);
  const v3Comparisons = binary ? [] : comparisons(result, cells, compare);
  return { id, format, cells, gate, issues, comparisons: v3Comparisons, pairedDeltas: experiment.pairedDeltas, mode: manifest.mode, scenario: manifest.scenario,
    identityId: text(manifest.identityId) ? manifest.identityId : undefined, identity: picked(manifest.identity, ['ruler', 'version', 'judgeOutputContract'], text),
    preregistration: [manifest.identity.preregistrationSha256, summary?.preregistrationSha256].find(text),
    acceptance: typeof result.acceptance === 'boolean' ? result.acceptance : undefined,
    verification: verification && { source: verificationSource, ...picked(verification, verifyFields, v => typeof v === 'boolean' || text(v) || count(v)),
      missing: Array.isArray(verification.missing) ? verification.missing.filter(text) : [], invalid: Array.isArray(verification.invalid) ? verification.invalid.filter(text) : [] },
    request: requestSources[0], usage: Object.assign({}, ...usageReports.map(([, data]) => picked(data, usageFields, count))),
    usageMeta: picked(summary?.usage ?? result.usage, ['attempts', 'retries', 'requestedOutputTokens', 'missingUsage'], count) };
}
