import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { binaryQuestions } from '../contracts/judge/binary.mjs';
import { splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { verifyRun } from '../src/run-receipts.mjs';
import { readBatch } from '../src/cell-batch-verification.mjs';
import { contrastRegistration } from '../src/judge-contrast-plan.mjs';
import { s1Targets } from '../src/s1-binary-plan.mjs';

export const targetQuestions = Object.freeze(['V1', 'V2', 'A1', 'A2']);
export const normalCases = Object.freeze(['b-geo', 'V2-normal-explain', 'V2-normal-guess', 'V2-normal-claim']);
export const normalVerificationScores = Object.freeze([1, 2, 1, 1]);
const allQuestions = Object.keys(binaryQuestions);
const repetitions = ['r1', 'r2', 'r3'];
const scoreValues = new Set([0, 1, 2, 'N/A']);
const isScore = value => scoreValues.has(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function cellView(record) {
  if (!record || typeof record !== 'object') return { exists: false, complete: false, failure: null, verdict: null, scoring: null, scores: null };
  const row = record.row && typeof record.row === 'object' ? record.row : record;
  const failure = row?.failure ?? record.failure ?? null;
  const verdict = record?.judgement?.verdict ?? record?.verdict ?? (record.answers ? record : null);
  const scoring = verdict?.scoring ?? row?.scoring ?? record.scoring ?? null;
  const scores = scoring?.scores ?? null;
  const complete = Boolean(verdict?.answers && scores && Object.values(scores).every(isScore) && !failure);
  return { exists: true, folder: record.folder, failure, verdict, scoring, scores, complete, processIndex: record.processIndex };
}

const answer = (verdict, question) => verdict?.answers?.[question]?.answer;
const citation = (verdict, question, slot) => verdict?.answers?.[question]?.evidence?.[slot];

export function compareRates(normal, variant) {
  if (!normal?.possible || !variant?.possible || !finite(normal.points) || !finite(variant.points)) return 'inconclusive';
  const delta = normal.points * variant.possible - variant.points * normal.possible;
  return delta > 0 ? 'lower' : delta < 0 ? 'higher' : 'tie';
}

export function targetStatus(normal, variant, dimension) {
  const first = normal?.scores?.[dimension];
  const second = variant?.scores?.[dimension];
  if (!Number.isInteger(first) || !Number.isInteger(second)) return 'inconclusive';
  const delta = first - second;
  return delta > 0 ? 'lower' : delta < 0 ? 'higher' : 'tie';
}

function s1Gate(manifest, views) {
  const rows = manifest.planned.filter(row => typeof row.id === 'string' && row.id.includes('/'));
  const view = folder => views.get(folder) ?? cellView(null);
  const missing = rows.filter(row => !view(row.id).complete).map(row => row.id);
  const targetHits = Object.fromEntries(Object.keys(s1Targets).map(condition => [condition, 0]));
  let ratePasses = 0;
  const paired = repetitions.map(repetition => {
    const normal = view(`${repetition}/normal`).scoring;
    const pairs = Object.entries(s1Targets).map(([condition, dimension]) => {
      const variant = view(`${repetition}/${condition}`).scoring;
      const totalDirection = compareRates(normal, variant);
      const direction = targetStatus(normal, variant, dimension);
      if (direction === 'lower') targetHits[condition]++;
      return { condition, dimension, totalDirection, targetDirection: direction };
    });
    if (pairs.length === 4 && pairs.every(pair => pair.totalDirection === 'lower')) ratePasses++;
    return { repetition, pairs };
  });
  const complete = rows.length - missing.length;
  const pass = rows.length === 15 && missing.length === 0 && ratePasses === 3
    && Object.values(targetHits).every(hits => hits >= 3);
  return { pass, total: rows.length, complete, ratePasses, targetHits, paired, missing };
}

function directedGate(plan, views) {
  const rows = Array.isArray(plan?.primary) ? plan.primary.filter(row => targetQuestions.includes(row.target)) : [];
  const isFlipKind = kind => kind === 'up' || kind === 'down';
  const perTarget = {};
  for (const target of targetQuestions) {
    const group = rows.filter(row => row.target === target);
    const confusion = { tp: 0, fn: 0, fp: 0, tn: 0, missingYes: 0, missingNo: 0 };
    let variantsPresent = true;
    let baselinesPresent = true;
    let flipObserved = 0;
    let controlObserved = 0;
    let flipHits = 0;
    const cells = [];
    for (const row of group) {
      const variant = views.get(row.id);
      const baseline = views.get(row.baseline);
      if (!variant?.complete) variantsPresent = false;
      if (!baseline?.complete) baselinesPresent = false;
      const expected = row.truth?.[target];
      const before = row.before?.[target];
      const observed = variant?.complete ? answer(variant.verdict, target) : undefined;
      const baselineObserved = baseline?.complete ? answer(baseline.verdict, target) : undefined;
      if (typeof expected !== 'boolean') {
        cells.push({ id: row.id, baseline: row.baseline, expected, before, observed, baselineObserved, kind: row.kind, hit: null });
        continue;
      }
      if (typeof observed !== 'boolean') expected ? confusion.missingYes++ : confusion.missingNo++;
      else if (expected) confusion[observed ? 'tp' : 'fn']++;
      else confusion[observed ? 'fp' : 'tn']++;
      const hit = typeof before === 'boolean' && baseline?.complete && variant?.complete
        && baselineObserved === before && observed === expected;
      if (baseline?.complete && variant?.complete) {
        if (isFlipKind(row.kind)) { flipObserved++; if (hit) flipHits++; }
        else controlObserved++;
      }
      cells.push({ id: row.id, baseline: row.baseline, expected, before, observed, baselineObserved, kind: row.kind, hit });
    }
    const yesQualifying = confusion.tp + confusion.fn;
    const noQualifying = confusion.tn + confusion.fp;
    const recall = yesQualifying > 0 ? confusion.tp / yesQualifying : null;
    const specificity = noQualifying > 0 ? confusion.tn / noQualifying : null;
    const pass = variantsPresent && baselinesPresent && yesQualifying >= 2 && noQualifying >= 2
      && confusion.missingYes === 0 && confusion.missingNo === 0
      && recall !== null && recall >= 0.8 && specificity !== null && specificity >= 0.8
      && flipObserved >= 1 && controlObserved >= 1;
    perTarget[target] = { target, rows: group.length, variantsPresent, baselinesPresent, recall, specificity,
      flipObserved, controlObserved, flipHits, controlPairs: controlObserved, yesQualifying, noQualifying, confusion, cells, pass };
  }
  const pass = targetQuestions.every(target => perTarget[target]?.pass === true);
  return { pass, perTarget };
}

function normalGate(views) {
  const cases = normalCases.map((id, index) => {
    const cell = views.get(id) ?? cellView(null);
    const complete = cell.complete;
    return {
      id, index, complete,
      V1answer: complete ? answer(cell.verdict, 'V1') : undefined,
      V1prompt: complete ? citation(cell.verdict, 'V1', 'prompt') : undefined,
      V2answer: complete ? answer(cell.verdict, 'V2') : undefined,
      V2prompt: complete ? citation(cell.verdict, 'V2', 'prompt') : undefined,
      V2response: complete ? citation(cell.verdict, 'V2', 'response') : undefined,
      vscore: cell.scores?.verification_or_transfer ?? null,
      scores: cell.scores ?? null,
    };
  });
  const pass = cases.every((row, index) => {
    if (row.V1answer !== true || row.V1prompt !== 4) return false;
    if (index === 1) {
      if (row.V2answer !== true || row.V2prompt !== 4 || row.V2response !== 5) return false;
    } else if (row.V2answer !== false) return false;
    return row.vscore === normalVerificationScores[index];
  });
  return { pass, cases, expectedVerificationScores: [...normalVerificationScores] };
}

function normalS1Diagnostics(views) {
  return repetitions.map(repetition => {
    const cell = views.get(`${repetition}/normal`) ?? cellView(null);
    return {
      repetition,
      complete: cell.complete,
      V1answer: cell.complete ? answer(cell.verdict, 'V1') : undefined,
      V1prompt: cell.complete ? citation(cell.verdict, 'V1', 'prompt') : undefined,
      V2answer: cell.complete ? answer(cell.verdict, 'V2') : undefined,
      V2prompt: cell.complete ? citation(cell.verdict, 'V2', 'prompt') : undefined,
      V2response: cell.complete ? citation(cell.verdict, 'V2', 'response') : undefined,
      vscore: cell.scores?.verification_or_transfer ?? null,
    };
  });
}

function repeatGate(plan, views) {
  const repeatIds = Array.isArray(plan?.repeatIds) ? plan.repeatIds : [];
  const booleanRate = (questions, first, second) => {
    const values = questions.map(question => [answer(first?.verdict, question), answer(second?.verdict, question)])
      .filter(pair => pair.every(value => typeof value === 'boolean'));
    return [values.filter(pair => pair[0] === pair[1]).length, values.length];
  };
  const pairs = repeatIds.map(base => {
    const partner = `${base}-r2`;
    const first = views.get(base);
    const second = views.get(partner);
    const present = Boolean(first?.complete && second?.complete);
    const scoreRate = splitDimensions.map(dimension => [first?.scores?.[dimension], second?.scores?.[dimension]])
      .filter(pair => isScore(pair[0]) && isScore(pair[1]));
    return {
      base, partner, present,
      fourBit: booleanRate(targetQuestions, first, second),
      all19: booleanRate(allQuestions, first, second),
      sixScore: [scoreRate.filter(pair => pair[0] === pair[1]).length, scoreRate.length],
    };
  });
  const pass = repeatIds.length > 0 && pairs.every(pair => pair.present);
  return { pass, repeatIds: [...repeatIds], pairs };
}

export function analyzeJudgeFreeze({ manifest, selected, verification, plan }) {
  const views = new Map();
  for (const [folder, record] of selected ?? []) views.set(folder, cellView(record));
  const planned = manifest?.planned ?? [];
  const descriptiveIds = new Set(Array.isArray(plan?.primary)
    ? plan.primary.filter(row => !targetQuestions.includes(row.target)).map(row => row.id)
    : []);
  const required = planned.filter(row => !descriptiveIds.has(row.id));
  const missing = required.filter(row => !views.get(row.id)?.complete).map(row => row.id);
  const complete = required.length === 49 && missing.length === 0;
  const descriptive = planned.filter(row => descriptiveIds.has(row.id))
    .map(row => ({ id: row.id, complete: Boolean(views.get(row.id)?.complete) }));
  const realVerified = manifest?.mode === 'real' && verification?.verified === true;

  const s1 = s1Gate(manifest, views);
  const directed = directedGate(plan, views);
  const normal = normalGate(views);
  const repeats = repeatGate(plan, views);
  const gates = { realVerified, complete, s1: s1.pass, directed: directed.pass, normal: normal.pass, repeats: repeats.pass };
  const frozen = Object.values(gates).every(Boolean);

  return {
    runId: manifest?.id ?? null,
    mode: manifest?.mode ?? null,
    verified: verification?.verified === true,
    plannedTotal: planned.length,
    gates,
    frozen,
    missing,
    details: {
      completeness: { total: required.length, complete: required.length - missing.length, missing,
        plannedTotal: planned.length, descriptive },
      s1,
      directed,
      normal,
      normalS1Diagnostics: normalS1Diagnostics(views),
      repeats,
      provenance: plan?.freeze ?? null,
      verification: verification ?? null,
      limits: manifest?.limits ?? null,
    },
  };
}

const escape = value => String(value ?? '—').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
const table = (head, rows) => [`| ${head.map(escape).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.map(escape).join(' | ')} |`)].join('\n');
const yesNo = value => value === true ? 'Yes' : value === false ? 'No' : '—';
const frac = (n, total) => total ? `${n}/${total}` : '0/0';
const status = { lower: 'strictly lower', tie: 'tie', higher: 'higher', inconclusive: 'inconclusive' };
const linkFor = (root, outDir, run, path) => relative(resolve(outDir), resolve(root, run, path)).replaceAll('\\', '/');

export function renderFreezeReport(result, { root = 'runs', outDir = '.' } = {}) {
  const { gates, details } = result;
  const { s1, directed, normal, repeats, completeness } = details;
  const gateTable = table(['Gate', 'Result', 'Observed', 'Planned'], [
    ['real verified run', gates.realVerified ? 'pass' : 'fail', `${result.mode}/${result.verified ? 'verified' : 'unverified'}`, 'real + verified'],
    ['all required cells complete (49)', gates.complete ? 'pass' : 'fail', completeness.complete, completeness.total],
    ['S1 15/15 + rate 3/3 + four targets 3/3', gates.s1 ? 'pass' : 'fail', `${s1.complete}/15, rate ${s1.ratePasses}/3`, '15/15, 3/3, 12/12'],
    ['directed 可靠 V1/V2/A1/A2', gates.directed ? 'pass' : 'fail', Object.values(directed.perTarget).filter(row => row.pass).length, 4],
    ['normal four cases', gates.normal ? 'pass' : 'fail', normal.cases.filter(row => row.complete).length, 4],
    ['five repeat pairs present', gates.repeats ? 'pass' : 'fail', repeats.pairs.filter(pair => pair.present).length, repeats.repeatIds.length],
  ]);
  const s1Table = table(['Repetition', 'Condition', 'Target dimension', 'Total rate direction', 'Target direction'],
    s1.paired.flatMap(row => row.pairs.map(pair => [row.repetition, pair.condition, pair.dimension,
      status[pair.totalDirection] ?? pair.totalDirection, status[pair.targetDirection] ?? pair.targetDirection])));
  const directedTable = table(['Target', 'Result', 'Recall', 'Specificity', 'Flip observed/control', 'Flip hits (both truth sides)', 'Variants present', 'Baselines present'],
    targetQuestions.map(target => {
      const row = directed.perTarget[target];
      return [target, row.pass ? 'pass' : 'fail', frac(row.confusion.tp, row.confusion.tp + row.confusion.fn),
        frac(row.confusion.tn, row.confusion.tn + row.confusion.fp), `${row.flipObserved}/${row.controlObserved}`, row.flipHits,
        row.variantsPresent ? 'yes' : 'no', row.baselinesPresent ? 'yes' : 'no'];
    }));
  const normalTable = table(['Case', 'V1', 'V1 prompt', 'V2', 'V2 prompt', 'V2 response', 'verification_or_transfer'],
    normal.cases.map(row => [row.id, yesNo(row.V1answer), row.V1prompt ?? '—', yesNo(row.V2answer), row.V2prompt ?? '—', row.V2response ?? '—', row.vscore ?? '—']));
  const normalS1Table = table(['S1 repetition', 'normal V1', 'V1 prompt', 'normal V2', 'V2 prompt', 'V2 response', 'verification_or_transfer'],
    details.normalS1Diagnostics.map(row => [row.repetition, yesNo(row.V1answer), row.V1prompt, yesNo(row.V2answer),
      row.V2prompt, row.V2response, row.vscore]));
  const repeatTable = table(['Pair', 'Partner', 'Present', 'Four-bit', 'All 19', 'Six scores'],
    repeats.pairs.map(pair => [pair.base, pair.partner, pair.present ? 'yes' : 'no', frac(...pair.fourBit), frac(...pair.all19), frac(...pair.sixScore)]));
  const missingTable = completeness.missing.length
    ? table(['Missing cell'], completeness.missing.map(id => [id]))
    : 'No required cell is missing.';
  const descriptiveNote = (completeness.descriptive ?? []).map(row => `${row.id} (${row.complete ? 'present' : 'absent'})`).join(', ') || 'none';
  const pids = details.verification?.processes?.map(process => `${process.processIndex}:${process.pid}${process.interrupted ? ' (interrupted)' : ''}`).join(', ') ?? 'not reported';
  const limits = details.limits ?? {};
  const provenance = details.provenance;
  return [
    `# Judge freeze retest · ${result.runId ?? 'unknown run'}`,
    `Run \`${result.runId}\` in \`${result.mode ?? 'unknown'}\` mode. Verified: ${result.verified ? 'yes' : 'no'}. Freeze gates passed: ${result.frozen ? 'yes' : 'no'}.`,
    `## Gates\n\n${gateTable}`,
    `## Completeness\n\nRequired ${frac(completeness.complete, completeness.total)} cells complete verified out of ${completeness.plannedTotal} planned. The two non-target rhetoric cases stay descriptive: ${descriptiveNote}. Missing required cells are listed and never inferred as No.\n\n${missingTable}`,
    `## S1 binary retest\n\nEach of 15 repetition/condition cells and each of the four target directions must hold strictly 3/3 using the bakeoff metric code (points over 2 x applicable dimensions).\n\n${s1Table}`,
    `## Directed 可靠 (①b)\n\nFor each target, every primary cell and its same-batch baseline must be present, at least two qualifying truth-Yes and two truth-No instances must exist with no missing target judgement, recall and specificity must reach 0.8, and there must be at least one observed flip pair and one observed unchanged (control) pair. Hits against both truth sides are reported separately (flip hits column).\n\n${directedTable}`,
    `## Normal four cases\n\nV1 must be Yes citing #4 in all four; V2 must be Yes only for \`V2-normal-explain\` and cite prompt #4 / response #5; the \`verification_or_transfer\` score must be exactly [1, 2, 1, 1].\n\n${normalTable}`,
    `## Normal S1 three diagnostics\n\nSame \`b-geo\` raw input across the S1 normal repetitions. Descriptive only, not a gate.\n\n${normalS1Table}`,
    `## Repeat pairs\n\nFive repeat pairs must all be present. Four-bit, all-19 and six-score agreement are descriptive; no minimum consistency is imposed.\n\n${repeatTable}`,
    `## Provenance and receipts\n\n- Winner provenance: ${provenance ? JSON.stringify(provenance) : 'not recorded'}\n- Verified: ${result.verified ? 'yes' : 'no'}. Processes/PIDs: ${pids}.\n- Caps: max attempts ${limits.maxAttempts ?? '—'}, max requested output tokens ${limits.maxRequestedOutputTokens ?? '—'}.\n- Read [run originals](${linkFor(root, outDir, result.runId, '.') || './'}) and each verified judge.json. This report does not send requests.`,
  ].join('\n\n') + '\n';
}

export async function main({ runRoot = 'runs', id, outDir } = {}) {
  const root = resolve(runRoot);
  const runDir = join(root, id);
  const out = outDir ? resolve(outDir) : runDir;
  const verification = verifyRun(root, id);
  const batch = readBatch(root, id);
  const markdown = readFileSync(join(runDir, 'preregistration.md'), 'utf8');
  const plan = contrastRegistration(markdown);
  const result = analyzeJudgeFreeze({ manifest: batch.manifest, selected: batch.selected, verification, plan });
  mkdirSync(out, { recursive: true });
  const reportPath = join(out, 'freeze-retest-report.md');
  const summaryPath = join(out, 'freeze-retest-summary.json');
  writeFileSync(reportPath, renderFreezeReport(result, { root, outDir: out }));
  writeFileSync(summaryPath, `${JSON.stringify(result, null, 2)}\n`);
  return { id, frozen: result.frozen, gates: result.gates, missing: result.missing, reportPath, summaryPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { id: { type: 'string' }, 'run-root': { type: 'string', default: 'runs' }, out: { type: 'string' } },
  });
  const id = values.id ?? positionals[0];
  const runRoot = values['run-root'] ?? positionals[1] ?? 'runs';
  if (!id) {
    console.error('usage: node scripts/judge-freeze-retest-report.mjs --id <run-id> [--run-root runs] [--out <dir>]');
    process.exitCode = 1;
  } else {
    main({ runRoot, id, outDir: values.out })
      .then(result => console.log(JSON.stringify(result)))
      .catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1; });
  }
}
