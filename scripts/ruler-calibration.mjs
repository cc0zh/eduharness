import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { runId } from '../contracts/artifacts/schema.mjs';
import { hash, infraFailure, nonblank, requireThat } from '../contracts/core/schema.mjs';
import { trainingPlan } from '../contracts/dataset/ruler-expand.mjs';
import { dimensions, ruler } from '../contracts/judge/schema.mjs';
import { verifyRun } from '../src/run-receipts.mjs';

const columns = ['opaqueId', 'dim', 'score', 'msgNums', 'opportunity', 'reason', 'confidence'];
const levels = [0, 1, 2];
const draws = 2000;
const key = ({ taskId, condition }) => `${taskId}/${condition}`;
const refs = value => [...new Set([...value.matchAll(/#(\d+)/g)].map(m => Number(m[1])))];
const isUncertain = row => row.uncertain;
const isExact = row => row.labelScore !== null && row.labelScore === row.machineScore;

function readJson(path, bytes = readFileSync(path)) {
  try { return JSON.parse(bytes); }
  catch (error) { throw new Error(`${path}: ${error.message}`); }
}

function indexBy(rows, getKey, name) {
  requireThat(Array.isArray(rows), `invalid ${name}: expected an array`);
  const index = new Map();
  for (const row of rows) {
    const id = getKey(row);
    requireThat(!index.has(id), `duplicate ${name} entry ${id}`);
    index.set(id, row);
  }
  return index;
}

function parseLabels(bytes, name) {
  const csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const rows = [];
  const field = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r?\n|$)/y;
  for (let offset = 0, row = []; offset < csv.length || row.length;) {
    field.lastIndex = offset;
    const match = field.exec(csv);
    requireThat(match, `${name}: malformed CSV at row ${rows.length + 1}`);
    offset = field.lastIndex;
    row.push(match[1]?.replaceAll('""', '"') ?? match[2]);
    if (match[3] !== ',') { rows.push(row); row = []; }
  }
  requireThat(JSON.stringify(rows.shift()) === JSON.stringify(columns), `${name}: invalid CSV header`);
  const labels = rows.map((row, i) => {
    requireThat(row.length === columns.length, `${name}: wrong field count at row ${i + 2}`);
    const [id, dim, score] = row;
    requireThat(dimensions.includes(dim) && (score === '' || /^[012]$/.test(score)), `${name}: invalid label score or dimension at ${id}/${dim}`);
    return Object.fromEntries(columns.map((column, j) => [column, row[j]]));
  });
  return indexBy(labels, row => `${row.opaqueId}/${row.dim}`, name);
}

function scoreStats(rows) {
  const matrix = levels.map(() => [0, 0, 0]);
  for (const { labelScore, machineScore } of rows) {
    if (labelScore !== null && machineScore !== null) matrix[labelScore][machineScore]++;
  }
  const labelCounts = matrix.map(row => row.reduce((a, b) => a + b));
  const machineCounts = levels.map(j => matrix.reduce((sum, row) => sum + row[j], 0));
  const paired = labelCounts.reduce((a, b) => a + b);
  const exact = levels.reduce((n, i) => n + matrix[i][i], 0);
  let observed = 0, expected = 0;
  for (const i of levels) for (const j of levels) {
    observed += matrix[i][j] * Math.abs(i - j);
    expected += labelCounts[i] * machineCounts[j] * Math.abs(i - j);
  }
  const kappa = expected === 0 ? null : 1 - paired * observed / expected;
  return { paired, exact, kappa, twoApart: matrix[0][2] + matrix[2][0], labelCounts, machineCounts, matrix };
}

function tally(rows) {
  return { planned: rows.length, paired: rows.filter(row => row.labelScore !== null && row.machineScore !== null).length, exact: rows.filter(isExact).length };
}

function describe(rows) {
  const stats = scoreStats(rows);
  const lockedLevels = levels.map(level => rows.filter(r => r.labelScore === level));
  const lockedLabelCounts = lockedLevels.map(level => level.length);
  const labelFamilyCounts = lockedLevels.map(level => new Set(level.map(r => r.family)).size);
  return { ...stats, planned: rows.length, lockedLabelCounts, labelFamilyCounts,
    missingLabel: rows.filter(row => row.labelScore === null).length,
    missingMachine: rows.filter(row => row.machineScore === null).length,
    uncertain: tally(rows.filter(isUncertain)), notUncertain: tally(rows.filter(row => !isUncertain(row))),
  };
}

function bootstrap(rows, seed) {
  const families = [...new Set(rows.map(row => row.family))].sort();
  const clusters = families.map(family => rows.filter(row => row.family === family));
  const outputs = Object.fromEntries([...dimensions, 'pooled'].map(dim => [dim, []]));
  for (let i = 0; i < draws; i++) {
    const sample = clusters.flatMap((_, j) => {
      const u = parseInt(hash(`${seed}:ci:${i}:${j}`).slice(0, 8), 16) / 2 ** 32;
      return clusters[Math.floor(u * clusters.length)];
    });
    for (const [dim, values] of Object.entries(outputs)) {
      const { kappa } = scoreStats(dim === 'pooled' ? sample : sample.filter(row => row.dimension === dim));
      if (kappa !== null) values.push(kappa);
    }
  }
  return Object.fromEntries(Object.entries(outputs).map(([dim, values]) => {
    values.sort((a, b) => a - b);
    const percentile = p => {
      const i = p * (values.length - 1), lo = Math.floor(i);
      return values[lo] + (i - lo) * (values[Math.ceil(i)] - values[lo]);
    };
    return [dim, { ci95: values.length ? [percentile(0.025), percentile(0.975)] : null, undefinedDraws: draws - values.length }];
  }));
}

function readRescore(root, id, initial, planned, expectedRuler) {
  const verification = verifyRun(root, runId(id));
  requireThat(id !== initial.id && verification.verified && typeof verification.acceptance === 'boolean', `rescore receipts did not verify for ${id}: ${[...verification.missing, ...verification.invalid].join(', ')}`);
  const file = name => readJson(join(root, id, name));
  const manifest = file('manifest.json'), result = file('result.json');
  const { identity } = manifest;
  const scenario = 'ruler-expand-judge-only';
  requireThat(identity.ruler === expectedRuler, `rescore ruler mismatch for ${id}: expected ${expectedRuler}, got ${identity.ruler}`);
  requireThat([manifest, result].every(row => row.id === id && row.phase === 'train' && row.scenario === scenario && row.mode === initial.mode) &&
    hash(manifest.planned) === hash(planned) && ['dataset', 'dialogueSource', 'policy', 'routes', 'judgeOutputContract'].every(field => hash(identity[field]) === hash(initial.identity[field])) &&
    manifest.identityId === hash({ mode: manifest.mode, scenario, identity }), `rescore changes the frozen training inputs or policy: ${id}`);
  const receiptPath = run => join(root, '_receipts', `${run}.json`);
  const receiptBytes = readFileSync(receiptPath(id));
  const receipt = readJson(receiptPath(id), receiptBytes);
  const sourcePath = receiptPath(runId(identity.dialogueSource.runId));
  const sourceBytes = readFileSync(sourcePath);
  requireThat(hash(sourceBytes) === identity.dialogueSource.evaluationSha256 && receipt.identityId === manifest.identityId && hash(receipt.source) === hash(identity.dialogueSource), 'rescore source receipt mismatch');
  const frozen = indexBy(readJson(sourcePath, sourceBytes).frozen, key, 'frozen dialogue');
  const results = indexBy(result.cells, key, 'rescore result');
  const grades = indexBy(receipt.graded, key, 'rescore grade');
  const coordinates = new Set(planned.map(key));
  requireThat([results, grades, frozen].every(index => [...index.keys()].every(id => coordinates.has(id))) && frozen.size === planned.length, 'rescore has unmatched training coordinates');
  const missingScores = [];
  const machine = planned.map(row => {
    const coord = key(row), cell = results.get(coord), grade = grades.get(coord);
    const sourceMessageIds = frozen.get(coord).messageIds;
    if (!grade) {
      requireThat(!cell || (cell.status === infraFailure && !cell.scored && !cell.validTotal && cell.total === null), `rescore result missing a grade at ${coord}`);
      missingScores.push({ ...row, reason: cell?.failure?.kind ?? 'not_run', attemptPath: cell?.failure?.attemptPath ?? null });
      return { ...row, judgement: null, sourceMessageIds };
    }
    const judgement = file(grade.path);
    requireThat(cell?.validTotal && hash(judgement.binding.messageIds) === hash(sourceMessageIds), `rescore score has a different frozen message order at ${coord}`);
    return { ...row, result: cell, judgement };
  });
  requireThat(verification.acceptance === (missingScores.length === 0), 'rescore acceptance contradicts grade coverage');
  return { manifest, machine, machineSha256: hash(receiptBytes), missingScores, verification };
}

function align(planned, mapping, machine, manifest, split, labels, ai) {
  const byTask = indexBy(mapping.entries, key, 'blind mapping');
  const grades = indexBy(machine, key, 'machine scores');
  requireThat(byTask.size === planned.length && grades.size === planned.length, 'incomplete mapping or machine scores');
  requireThat(labels.size === planned.length * dimensions.length && labels.size === ai.size, 'incomplete label sheet');
  const edits = [];
  const conditionTotals = {};
  const rows = planned.flatMap(entry => {
    const { taskId, condition } = entry, id = key(entry);
    const opaqueId = byTask.get(id)?.opaqueId;
    const family = split.items[taskId]?.family;
    requireThat(nonblank(family) && nonblank(mapping.blindSalt) && opaqueId === hash(`${split.seed}:opaque:${mapping.blindSalt}:${taskId}:${condition}`).slice(0, 12), `invalid mapping or family for ${id}`);
    const grade = grades.get(id);
    const binding = grade?.judgement?.binding;
    const missing = grade?.judgement === null && Array.isArray(grade.sourceMessageIds);
    requireThat(missing || (binding?.runId === manifest.id && binding.ruler === manifest.identity.ruler && binding.sourceRunId === manifest.identity.dialogueSource.runId && key(binding) === id && Array.isArray(binding.messageIds) && key(grade.result) === id), `grade binding mismatch at ${id}`);
    const machineDims = missing ? null : indexBy(Object.values(grade.judgement.groups).flatMap(Object.entries), ([dim]) => dim, `machine dimensions at ${id}`);
    requireThat(missing || machineDims.size === dimensions.length, `invalid machine dimension count at ${id}`);
    const messageIds = missing ? grade.sourceMessageIds : binding.messageIds;
    const cells = dimensions.map(dimension => {
      const coord = `${opaqueId}/${dimension}`;
      const label = labels.get(coord), draft = ai.get(coord);
      requireThat(label && draft, `label missing at ${coord}`);
      const fields = Object.fromEntries(columns.slice(2).filter(c => label[c] !== draft[c]).map(c => [c, { ai: draft[c], locked: label[c] }]));
      if (Object.keys(fields).length) edits.push({ taskId, opaqueId, condition, dimension, fields });
      const value = missing ? { score: null } : machineDims.get(dimension)?.[1];
      requireThat(value && (levels.includes(value.score) || value.score === null), `invalid machine score at ${id}/${dimension}`);
      const labelScore = label.score === '' ? null : Number(label.score);
      const machineScore = value.score;
      const labelRefs = refs(label.msgNums), labelReasonRefs = refs(label.reason), machineReasonRefs = refs(value.reason ?? '');
      requireThat([...labelRefs, ...labelReasonRefs, ...machineReasonRefs].every(n => n > 0 && n <= messageIds.length) &&
        (labelScore === null || (labelReasonRefs.length && nonblank(label.reason))) &&
        (machineScore === null || machineReasonRefs.length), `invalid reason references at ${id}/${dimension}`);
      return { taskId, opaqueId, condition, dimension, family, labelScore, machineScore, uncertain: label.reason.startsWith('存疑'),
        labelOpportunity: label.opportunity, labelReason: label.reason, labelRefs, labelReasonRefs, machineReason: value.reason ?? '', machineReasonRefs };
    });
    const labelValid = cells.every(c => c.labelScore !== null), machineValid = cells.every(c => c.machineScore !== null);
    const sum = field => cells.reduce((n, cell) => n + cell[field], 0);
    requireThat(missing || (grade.result.scored === cells.some(c => c.machineScore !== null) && grade.result.validTotal === machineValid &&
      grade.result.total === (machineValid ? sum('machineScore') : null)), `machine total mismatch for ${id}`);
    const totals = (conditionTotals[condition] ??= { dialogues: 0, labelTotal: 0, machineTotal: 0 });
    totals.dialogues++;
    totals.labelTotal = labelValid && totals.labelTotal !== null ? totals.labelTotal + sum('labelScore') : null;
    totals.machineTotal = machineValid && totals.machineTotal !== null ? totals.machineTotal + sum('machineScore') : null;
    return cells;
  });
  return { rows, edits, conditionTotals };
}

function calibrate(run, draftPath, planPath, splitPath, rescoreId, expectedRuler) {
  const bytes = name => readFileSync(join(run, name));
  const json = name => readJson(join(run, name));
  const lock = json('label-lock.json');
  const locked = bytes('labels.csv'), draft = readFileSync(draftPath);
  requireThat(lock.file === 'labels.csv' && lock.sha256 === hash(locked), 'locked label SHA256 mismatch');
  requireThat(lock.aiDraftSha256 === hash(draft) && lock.byteEqual === locked.equals(draft), 'AI draft does not match the label lock');
  requireThat(lock.planSha256 === hash(readFileSync(planPath)), 'preregistered plan SHA256 mismatch');
  const labels = parseLabels(locked, 'labels.csv'), ai = parseLabels(draft, 'labels.ai.csv');
  const split = readJson(splitPath), initial = json('manifest.json');
  const { seed, train, trainSha256 } = split;
  requireThat(nonblank(seed) && train?.length && new Set(train).size === train.length && trainSha256 === hash(`${train.join('\n')}\n`) &&
    initial.id === lock.runId && initial.phase === 'train' && initial.identity.dataset.trainSha256 === trainSha256 && initial.identity.dataset.seed === seed, 'training manifest or split mismatch');
  const planned = trainingPlan('train', split);
  requireThat(hash(planned) === hash(initial.planned), 'training schedule mismatch');
  const mappingBytes = bytes('blind-mapping.json');
  const scored = rescoreId ? readRescore(dirname(resolve(run)), rescoreId, initial, planned, expectedRuler) : (() => {
    const machineBytes = bytes('machine-scores.json');
    return { manifest: initial, machine: readJson('machine-scores.json', machineBytes), machineSha256: hash(machineBytes), missingScores: [] };
  })();
  const { manifest, machine, machineSha256, missingScores, verification } = scored;
  const { rows, edits, conditionTotals } = align(planned, readJson('blind-mapping.json', mappingBytes), machine, manifest, split, labels, ai);
  const ci = bootstrap(rows, seed);
  const byDimension = {}, sameScoreAudit = {};
  for (const dim of dimensions) {
    const cells = rows.filter(row => row.dimension === dim);
    const stats = describe(cells);
    byDimension[dim] = { ...stats, ...ci[dim], criteria: {
      paired: stats.paired * 10 >= stats.planned * 9,
      coverage: levels.every(i => stats.lockedLabelCounts[i] >= 2 && stats.labelFamilyCounts[i] >= 2),
      kappa: stats.kappa !== null && stats.kappa >= 0.60,
      exact: stats.exact * 10 >= stats.paired * 7 && stats.paired > 0,
      twoApart: stats.twoApart <= 1,
    } };
    sameScoreAudit[dim] = cells.filter(isExact).map(row => [hash(`${seed}:audit:${dim}:${row.opaqueId}`), row])
      .sort(([a], [b]) => a.localeCompare(b)).slice(0, 3).map(([, row]) => row);
  }
  const judge = manifest.identity.routes?.judge;
  return { lock, sourceRunId: manifest.identity.dialogueSource.runId, scoreRunId: manifest.id, ruler: manifest.identity.ruler, judge: judge ? { provider: judge.provider, id: judge.id } : null,
    inputSha256: { mapping: hash(mappingBytes), ...(rescoreId ? { scoreReceipt: machineSha256 } : { machine: machineSha256 }), train: trainSha256 },
    bootstrap: { draws, seed, families: new Set(rows.map(row => row.family)).size },
    dimensions: byDimension, pooled: { ...describe(rows), ...ci.pooled },
    uncertain: tally(rows.filter(isUncertain)), notUncertain: tally(rows.filter(row => !isUncertain(row))),
    conditionTotals, edits, missingScores, verification, mismatches: rows.filter(row => row.labelScore !== null && row.machineScore !== null && !isExact(row)), sameScoreAudit,
  };
}

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { rescore: { type: 'string' }, 'rescore-ruler': { type: 'string' } } });
  const [run, draft, plan, split = new URL('../data/ruler-expand-v1.json', import.meta.url)] = positionals;
  requireThat(run && draft && plan && positionals.length <= 4, 'usage: node scripts/ruler-calibration.mjs <score-run-dir> <labels.ai.csv> <plan.md> [split.json] [--rescore <id> [--rescore-ruler <version>]]');
  const { rescore, 'rescore-ruler': expectedRuler = ruler } = values;
  requireThat(values['rescore-ruler'] === undefined || (nonblank(rescore) && nonblank(expectedRuler)), '--rescore-ruler requires --rescore and a nonempty ruler version');
  console.log(JSON.stringify(calibrate(run, draft, plan, split, rescore, expectedRuler), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
