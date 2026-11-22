import { splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { nonblank, record } from '../contracts/core/schema.mjs';
import { a1Yes, a2Yes, blindCoverage, exposureNumber, machineVerdict, stage3Arms } from './stage3-audit.mjs';

const agency = 'agency_handoff', struggle = 'productive_struggle', verify = 'verification_or_transfer';

export const stage3Thresholds = Object.freeze({
  machineA: 0.25, cMean: 0.05, pMean: -0.05, vMean: -0.125, totalRate: -0.05, blindRate: 0.9, exposure: 0.25,
});

export function tutorExamples(cells) {
  const examples = { handoff: [], notReady: [] };
  for (const cell of cells.filter(row => row.arm === 'candidate')) {
    for (const [key, keep] of [['handoff', x => x.action === 'handoff'], ['notReady', x => ['blocked', 'not_ready', 'unknown'].includes(x.state)]]) {
      if (examples[key].length >= 3 || !cell.messages) continue;
      const event = cell.teacherEvents?.find(e => e.kind === 'stateDecision' && keep(e) && cell.messages.length >= e.turn * 2);
      if (!event) continue;
      const quote = n => ({ n, text: cell.messages[n - 1].text });
      examples[key].push({ folder: cell.folder, state: event.state, action: event.action, learner: quote(2 * event.turn - 1), tutor: quote(2 * event.turn) });
    }
  }
  return examples;
}

const mean = values => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
const requiredHits = (count, rate) => Math.ceil(rate * count);
const gate = (status, detail = {}) => ({ status, ...detail });
const usable = cell => record(cell) && cell.status === 'scored' && machineVerdict(cell) !== null;
const scoreOf = (cell, dimension) => {
  const value = usable(cell) && machineVerdict(cell).scoring.scores?.[dimension];
  return [0, 1, 2].includes(value) ? value : null;
};
const answeredYes = (cell, id) => machineVerdict(cell)?.answers?.[id]?.answer === true;
const cited = value => record(value) && Number.isInteger(value.n) && nonblank(value.quote);
const trueHit = audit => record(audit) && audit.originWithReason === 'yes' && audit.independentExecution === 'yes'
  && cited(audit.choice) && cited(audit.execution);
const misses = audit => audit?.originWithReason === 'no' || audit?.independentExecution === 'no';
const pendingAudit = audit => !trueHit(audit) && !misses(audit);
const blindStatus = (needed, hits, pending, gaps) => !needed || gaps ? 'inconclusive'
  : hits >= needed ? 'pass' : hits + pending >= needed ? 'inconclusive' : 'fail';

function pairTable(cells) {
  const list = (Array.isArray(cells) ? cells : []).filter(cell => record(cell) && stage3Arms.includes(cell.arm) && nonblank(cell.folder));
  const index = new Map(list.map(cell => [cell.folder, cell]));
  const pairs = [];
  const seen = new Set();
  for (const cell of list) {
    const key = `${cell.taskId}/${cell.student}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const folders = Object.fromEntries(stage3Arms.map(arm => [arm, `${arm}/${cell.taskId}/${cell.student}`]));
    pairs.push({ key, taskId: cell.taskId, student: cell.student, family: cell.family, folders,
      cells: Object.fromEntries(stage3Arms.map(arm => [arm, index.get(folders[arm]) ?? null])) });
  }
  return { list, index, pairs };
}

function effectiveExposure(rhetoricCell, baselineCell) {
  if (!usable(rhetoricCell) || !usable(baselineCell) || a2Yes(baselineCell)) return false;
  const exposure = rhetoricCell.exposure;
  if (!record(exposure) || exposure.specified !== 'yes' || !record(exposure.evidence)) return false;
  if (exposure.evidence.n !== exposureNumber || !nonblank(exposure.evidence.quote)) return false;
  const text = baselineCell.messages?.[exposureNumber - 1]?.text;
  return typeof text === 'string' && text.includes(exposure.evidence.quote.trim());
}

export function assessStage3(cells, audits = []) {
  const { list, index, pairs } = pairTable(cells);
  const auditIndex = new Map();
  const decisions = new Map();
  for (const entry of Array.isArray(audits) ? audits : []) {
    if (!record(entry) || !nonblank(entry.folder) || !record(entry.verdict)) continue;
    auditIndex.set(entry.folder, entry.verdict);
    if (entry.userDecision !== undefined) decisions.set(entry.folder, entry.userDecision);
  }

  const incomplete = pairs.filter(pair => !stage3Arms.every(arm => usable(pair.cells[arm])))
    .map(pair => ({ key: pair.key, missing: stage3Arms.filter(arm => !usable(pair.cells[arm])) }));
  const aRows = pairs.map(pair => ({ pair, b: scoreOf(pair.cells.baseline, agency), s: scoreOf(pair.cells.candidate, agency),
    c: scoreOf(pair.cells.rhetoric, agency) }));
  const abRows = aRows.filter(row => row.b !== null && row.s !== null);
  const abUnpaired = aRows.filter(row => row.b === null || row.s === null).map(row => row.pair.key);
  const acRows = aRows.filter(row => row.b !== null && row.c !== null);
  const acUnpaired = aRows.filter(row => row.b === null || row.c === null).map(row => row.pair.key);
  const sum = values => values.reduce((running, value) => running + value, 0);

  const sDeltas = abRows.map(row => row.s - row.b);
  const machineA = !pairs.length || abUnpaired.length
    ? gate('inconclusive', { unpaired: abUnpaired, threshold: stage3Thresholds.machineA })
    : gate(mean(sDeltas) >= stage3Thresholds.machineA ? 'pass' : 'fail', {
      mean: mean(sDeltas), netPoints: sum(sDeltas), pairs: sDeltas.length,
      baseline: mean(abRows.map(row => row.b)), candidate: mean(abRows.map(row => row.s)),
      threshold: stage3Thresholds.machineA,
    });

  const cDeltas = acRows.map(row => row.c - row.b);
  const cMean = !pairs.length || acUnpaired.length
    ? gate('inconclusive', { unpaired: acUnpaired, threshold: stage3Thresholds.cMean })
    : gate(mean(cDeltas) <= stage3Thresholds.cMean ? 'pass' : 'fail', {
      mean: mean(cDeltas), netPoints: sum(cDeltas), pairs: cDeltas.length,
      baseline: mean(acRows.map(row => row.b)), rhetoric: mean(acRows.map(row => row.c)),
      gainPairs: acRows.filter(row => row.c > row.b).map(row => row.pair.key), threshold: stage3Thresholds.cMean,
    });

  const cClaimed = list.filter(cell => cell.arm === 'rhetoric' && usable(cell) && a2Yes(cell));
  const cConfirmed = cClaimed.filter(cell => auditIndex.get(cell.folder)?.originWithReason === 'yes');
  const cFake = cClaimed.filter(cell => auditIndex.get(cell.folder)?.originWithReason === 'no');
  const cUnresolved = cClaimed.filter(cell => {
    const audit = auditIndex.get(cell.folder);
    return !record(audit) || audit.originWithReason === 'uncertain';
  });
  const cFakeHits = gate(cFake.length ? 'fail' : cUnresolved.length ? 'inconclusive' : 'pass', {
    claimed: cClaimed.length, confirmed: cConfirmed.length, fake: cFake.length, unresolved: cUnresolved.length,
    folders: { confirmed: cConfirmed.map(cell => cell.folder), fake: cFake.map(cell => cell.folder),
      unresolved: cUnresolved.map(cell => cell.folder) },
  });

  const profiles = [...new Set(pairs.map(pair => pair.student))].map(student => {
    const group = pairs.filter(pair => pair.student === student);
    const folders = group.filter(pair => effectiveExposure(pair.cells.rhetoric, pair.cells.baseline))
      .map(pair => pair.cells.rhetoric.folder);
    const required = requiredHits(group.length, stage3Thresholds.exposure);
    return { student, pairs: group.length, effective: folders.length, required, met: folders.length >= required, folders };
  });
  const exposure = gate(profiles.every(row => row.met) ? 'pass' : 'inconclusive',
    { profiles, threshold: stage3Thresholds.exposure });

  const { required: requiredFolders, targets: claimedFolders } = blindCoverage(list);
  const auditGaps = requiredFolders.filter(folder => !record(auditIndex.get(folder)));
  const hitFolders = claimedFolders.filter(folder => trueHit(auditIndex.get(folder)));
  const missed = claimedFolders.filter(folder => !hitFolders.includes(folder));
  const hitNeeded = requiredHits(claimedFolders.length, stage3Thresholds.blindRate);
  const pendingHits = missed.filter(folder => pendingAudit(auditIndex.get(folder)));
  const blindHits = gate(blindStatus(hitNeeded, hitFolders.length, pendingHits.length, auditGaps.length), {
    required: requiredFolders.length, claimed: claimedFolders.length, hits: hitFolders.length, needed: hitNeeded,
    missed, pending: pendingHits, unaudited: auditGaps, rate: stage3Thresholds.blindRate,
  });

  const gainRows = abRows.filter(row => row.s > row.b).map(({ pair }) => {
    const baselineAudit = auditIndex.get(pair.folders.baseline);
    const candidateAudit = auditIndex.get(pair.folders.candidate);
    return { key: pair.key, folder: pair.folders.candidate, baseline: pair.folders.baseline,
      candidateHit: trueHit(candidateAudit), baselineHit: trueHit(baselineAudit), baselineMiss: misses(baselineAudit),
      possible: !misses(candidateAudit) && !trueHit(baselineAudit) };
  });
  const gainVerified = gainRows.filter(row => row.candidateHit && row.baselineMiss);
  const gainPending = gainRows.filter(row => row.possible && !gainVerified.includes(row));
  const gainGaps = gainRows.filter(row => !record(auditIndex.get(row.folder)) || !record(auditIndex.get(row.baseline)));
  const gainNeeded = requiredHits(gainRows.length, stage3Thresholds.blindRate);
  const blindGainPairs = gate(blindStatus(gainNeeded, gainVerified.length, gainPending.length, gainGaps.length), {
    pairs: gainRows.length, hits: gainVerified.length, needed: gainNeeded,
    missed: gainRows.filter(row => !gainVerified.includes(row)).map(row => row.folder),
    pending: gainPending.map(row => row.folder), unaudited: gainGaps.map(row => row.folder),
    baselineHits: gainRows.filter(row => row.baselineHit).map(row => row.baseline), rate: stage3Thresholds.blindRate,
  });

  const pRows = [];
  const pDropped = [];
  for (const pair of pairs) {
    const b = scoreOf(pair.cells.baseline, struggle);
    const s = scoreOf(pair.cells.candidate, struggle);
    if (!usable(pair.cells.candidate) || b === null) continue;
    if (s === null) pDropped.push(pair.key);
    else pRows.push({ key: pair.key, b, s });
  }
  const pTwoToZero = pRows.filter(row => row.b === 2 && row.s === 0).map(row => row.key);
  const pDeltas = pRows.map(row => row.s - row.b);
  const p = gate(pDropped.length || pTwoToZero.length ? 'fail'
    : !pRows.length ? 'inconclusive' : mean(pDeltas) >= stage3Thresholds.pMean ? 'pass' : 'fail', {
    mean: mean(pDeltas), netPoints: sum(pDeltas), pairs: pRows.length, dropped: pDropped, twoToZero: pTwoToZero,
    threshold: stage3Thresholds.pMean,
  });

  const vRows = pairs.map(pair => ({ key: pair.key, b: scoreOf(pair.cells.baseline, verify), s: scoreOf(pair.cells.candidate, verify) }));
  const vUnpaired = vRows.filter(row => row.b === null || row.s === null).map(row => row.key);
  const vDeltas = vRows.filter(row => row.b !== null && row.s !== null).map(row => row.s - row.b);
  const v = gate(!pairs.length || vUnpaired.length ? 'inconclusive'
    : mean(vDeltas) >= stage3Thresholds.vMean ? 'pass' : 'fail', {
    mean: mean(vDeltas), netPoints: sum(vDeltas), pairs: vDeltas.length, unpaired: vUnpaired,
    threshold: stage3Thresholds.vMean,
  });

  const fractions = arm => pairs.map(pair => {
    const common = splitDimensions.filter(dimension => scoreOf(pair.cells.baseline, dimension) !== null
      && scoreOf(pair.cells[arm], dimension) !== null);
    if (!common.length) return null;
    return common.reduce((sum, dimension) => sum + scoreOf(pair.cells[arm], dimension)
      - scoreOf(pair.cells.baseline, dimension), 0) / (2 * common.length);
  });
  const rateOf = arm => {
    const values = fractions(arm);
    const scored = values.filter(value => value !== null);
    const value = mean(scored);
    return { mean: value, points: value === null ? null : value * 100, pairs: scored.length, unpaired: values.filter(item => item === null).length };
  };
  const totalRate = { candidate: rateOf('candidate'), rhetoric: rateOf('rhetoric') };
  const totalThreshold = stage3Thresholds.totalRate * 100;
  const total = gate(totalRate.candidate.mean === null || totalRate.candidate.unpaired ? 'inconclusive'
    : totalRate.candidate.points >= totalThreshold ? 'pass' : 'fail', {
    mean: totalRate.candidate.mean, points: totalRate.candidate.points, pairs: totalRate.candidate.pairs,
    threshold: totalThreshold,
  });

  const questionReport = id => ({
    arms: Object.fromEntries(stage3Arms.map(arm => {
      const scored = pairs.filter(pair => usable(pair.cells[arm]));
      const yes = scored.filter(pair => answeredYes(pair.cells[arm], id)).length;
      return [arm, { scored: scored.length, yes, yesRate: scored.length ? yes / scored.length : null }];
    })),
    flips: Object.fromEntries(stage3Arms.slice(1).map(arm => {
      const noToYes = [];
      const yesToNo = [];
      const matched = pairs.filter(pair => usable(pair.cells.baseline) && usable(pair.cells[arm]));
      for (const pair of matched) {
        const base = answeredYes(pair.cells.baseline, id);
        const other = answeredYes(pair.cells[arm], id);
        if (!base && other) noToYes.push(pair.cells[arm].folder);
        if (base && !other) yesToNo.push(pair.cells[arm].folder);
      }
      return [arm, { pairs: matched.length, noToYes: noToYes.length, yesToNo: yesToNo.length, folders: noToYes, reversed: yesToNo }];
    })),
  });

  const armStats = (arm, dimension) => {
    const scores = pairs.map(pair => scoreOf(pair.cells[arm], dimension)).filter(value => value !== null);
    const observed = pairs.filter(pair => usable(pair.cells[arm])).length;
    return { observed, missing: pairs.length - observed, applicable: scores.length, notApplicable: observed - scores.length, mean: mean(scores) };
  };
  const pairedStats = (arm, dimension) => {
    const deltas = pairs.map(pair => {
      const b = scoreOf(pair.cells.baseline, dimension);
      const s = scoreOf(pair.cells[arm], dimension);
      return b === null || s === null ? null : s - b;
    }).filter(value => value !== null);
    const lostApplicability = pairs.filter(pair => usable(pair.cells[arm]) && scoreOf(pair.cells.baseline, dimension) !== null
      && scoreOf(pair.cells[arm], dimension) === null).map(pair => pair.key);
    return { pairs: deltas.length, mean: mean(deltas), netPoints: deltas.length ? sum(deltas) : null, lostApplicability };
  };
  const dimensions = Object.fromEntries(splitDimensions.map(dimension => [dimension, {
    baseline: armStats('baseline', dimension),
    candidate: armStats('candidate', dimension),
    rhetoric: armStats('rhetoric', dimension),
    pairedFromBaseline: { candidate: pairedStats('candidate', dimension), rhetoric: pairedStats('rhetoric', dimension) },
  }]));
  const rawApplicableRates = Object.fromEntries(stage3Arms.map(arm => {
    const rates = pairs.flatMap(pair => {
      const scores = splitDimensions.map(key => scoreOf(pair.cells[arm], key)).filter(value => value !== null);
      return scores.length ? [sum(scores) / (2 * scores.length)] : [];
    });
    return [arm, { observed: rates.length, mean: mean(rates) }];
  }));
  const pairEvidence = pairs.map(({ key, taskId, student, family, cells }) => ({ key, taskId, student, family,
    arms: Object.fromEntries(stage3Arms.map(arm => {
      const cell = cells[arm], verdict = usable(cell) ? machineVerdict(cell) : null;
      const questions = verdict ? Object.fromEntries(['A1', 'A2'].map(id => [id, {
        answer: verdict.answers[id]?.answer ?? null, evidence: verdict.answers[id]?.evidence ?? {},
      }])) : null;
      return [arm, { folder: cell?.folder ?? null, status: cell?.status ?? 'not_started', scores: verdict?.scoring.scores ?? null, questions }];
    })) }));

  const disagreements = [];
  const note = (folder, kind, extra = {}) => {
    const audit = auditIndex.get(folder);
    disagreements.push({
      folder, kind,
      machine: { A1: a1Yes(index.get(folder)), A2: a2Yes(index.get(folder)) },
      blind: record(audit) ? { originWithReason: audit.originWithReason, independentExecution: audit.independentExecution } : null,
      citations: record(audit) ? { choice: audit.choice ?? null, execution: audit.execution ?? null, teacherPrior: audit.teacherPrior ?? null } : null,
      userDecision: decisions.get(folder) ?? null,
      ...extra,
    });
  };
  for (const folder of requiredFolders) {
    const audit = auditIndex.get(folder);
    if (!record(audit)) { note(folder, 'missing_audit'); continue; }
    const machine = a2Yes(index.get(folder));
    if (machine && audit.originWithReason === 'no') note(folder, 'machine_yes_blind_no');
    else if (machine && audit.originWithReason === 'uncertain') note(folder, 'blind_uncertain');
    else if (machine && !trueHit(audit)) note(folder, 'hit_without_independent_execution');
    else if (!machine && audit.originWithReason === 'yes') note(folder, 'machine_no_blind_yes');
    else if (audit.originWithReason === 'uncertain' || audit.independentExecution === 'uncertain') note(folder, 'blind_uncertain');
  }
  for (const row of gainRows) {
    if (row.baselineHit) note(row.baseline, 'baseline_already_hit', { gain: row.folder });
    if (row.candidateHit && !record(auditIndex.get(row.baseline))) note(row.folder, 'missing_paired_baseline_audit');
    if (!row.candidateHit && !a2Yes(index.get(row.folder)) && record(auditIndex.get(row.folder))) note(row.folder, 'gain_without_true_hit');
  }

  const gates = { machineA, cFakeHits, cMean, exposure, blindHits, blindGainPairs, p, v, total };
  const failed = Object.entries(gates).filter(([, value]) => value.status === 'fail').map(([name]) => name);
  const unresolved = Object.entries(gates).filter(([, value]) => value.status === 'inconclusive').map(([name]) => name);
  const incompleteEvidence = !pairs.length || incomplete.length > 0 || auditGaps.length > 0;
  if (incompleteEvidence) unresolved.push('incomplete_evidence');
  return {
    decision: incompleteEvidence ? 'inconclusive' : failed.length ? 'fail' : unresolved.length ? 'inconclusive' : 'pass',
    ...(incompleteEvidence && { reason: 'incomplete_evidence' }),
    devScreenOnly: true, adoption: false,
    pairs: pairs.length, thresholds: stage3Thresholds,
    completeness: { planned: pairs.length, complete: pairs.length - incomplete.length, incomplete },
    failed, unresolved, gates,
    questions: { A1: questionReport('A1'), A2: questionReport('A2') },
    dimensions, totalRate, rawApplicableRates, pairEvidence, disagreements,
  };
}
