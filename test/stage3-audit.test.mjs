import assert from 'node:assert/strict';
import test from 'node:test';
import { splitDimensions } from '../contracts/judge/binary-v3.mjs';
import {
  auditPrompt, auditSchema, auditWindow, blindJobs, blindSelection, exposurePrompt, exposureSchema,
  parseAgencyAudit, parseExposure, rhetoricSuffix, rhetoricTranscript,
} from '../src/stage3-audit.mjs';
import { assessStage3 } from '../src/stage3-report.mjs';

const [repair, support, agency, struggle, pivot, verify] = splitDimensions;
const profiles = ['default', 'stubborn', 'answer-seeker'];
const tasks = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];

const sampleWindow = () => Array.from({ length: 9 }, (_, index) => ({
  id: `m${index + 1}`, role: index % 2 ? 'teacher' : 'learner', turn: Math.ceil(index / 2),
  text: index % 2 ? `teacher says line ${index + 1}` : `learner says line ${index + 1}`,
}));

const auditText = overrides => JSON.stringify({
  originWithReason: 'yes', independentExecution: 'yes',
  choice: { n: 7, quote: 'learner says line 7' }, execution: { n: 9, quote: 'learner says line 9' },
  teacherPrior: { n: 6, quote: 'teacher says line 6' }, reason: 'named the method and why it matters, then carried it out',
  ...overrides,
});

const dialogue = folder => Array.from({ length: 9 }, (_, index) => ({
  id: `${folder}:m${index + 1}`, role: index % 2 ? 'teacher' : 'learner', turn: Math.ceil(index / 2),
  text: index === 7 ? 'teacher closing line' : `utterance ${index + 1}`,
}));

function makeCell({ arm, taskId, student, a1 = true, a2 = false, scores = {}, status = 'scored', exposure, messages }) {
  const folder = `${arm}/${taskId}/${student}`;
  const merged = { [repair]: 2, [support]: 2, [agency]: a2 ? 2 : a1 ? 1 : 0, [struggle]: 2, [pivot]: 2, [verify]: 2, ...scores };
  const cell = { arm, folder, taskId, family: 'fixture', student, status, messages: messages ?? dialogue(folder) };
  if (status !== 'scored') return cell;
  cell.verdict = { verdict: {
    answers: { A1: { answer: a1 }, A2: { answer: a2 } },
    scoring: { scores: merged, applicable: Object.keys(merged).filter(key => Number.isInteger(merged[key])) },
  } };
  if (exposure) cell.exposure = exposure;
  return cell;
}

function passCells({ patch = () => ({}), taskIds = tasks } = {}) {
  const cells = [];
  const pairs = taskIds.flatMap(taskId => profiles.map(student => ({ taskId, student })));
  const gains = new Set(pairs.slice(0, 8).map(({ taskId, student }) => `${taskId}/${student}`));
  for (const { taskId, student } of pairs) {
    const gain = gains.has(`${taskId}/${student}`);
    const exposure = { specified: 'yes', evidence: { n: 8, quote: 'teacher closing line' } };
    const baselineMessages = dialogue(`baseline/${taskId}/${student}`);
    const build = (arm, base) => {
      const folder = `${arm}/${taskId}/${student}`;
      const messages = arm === 'rhetoric' ? rhetoricTranscript('run1', folder, baselineMessages) : dialogue(folder);
      return makeCell({ arm, taskId, student, messages, ...base, ...(patch(folder) ?? {}) });
    };
    cells.push(build('baseline', {}));
    cells.push(build('candidate', { a2: gain }));
    cells.push(build('rhetoric', { exposure }));
  }
  return cells;
}

const auditHit = folder => ({ folder, verdict: {
  originWithReason: 'yes', independentExecution: 'yes',
  choice: { n: 7, quote: 'utterance 7' }, execution: { n: 9, quote: 'utterance 9' },
  teacherPrior: { n: 6, quote: 'utterance 6' }, reason: 'learner chose the check and its consequence, then ran it',
} });

const auditMiss = folder => ({ folder, verdict: {
  originWithReason: 'no', independentExecution: 'no', choice: null, execution: null,
  teacherPrior: { n: 8, quote: 'teacher closing line' }, reason: 'the teacher supplied the method',
} });

const auditUncertain = folder => ({ folder, verdict: {
  originWithReason: 'uncertain', independentExecution: 'uncertain', choice: null, execution: null, teacherPrior: null,
  reason: 'cannot establish origin from the public text',
} });

const blindAudits = (cells, overrides = {}) => blindSelection(cells).map(folder => {
  if (Object.hasOwn(overrides, folder)) return overrides[folder] ? { folder, verdict: overrides[folder] } : null;
  const cell = cells.find(row => row.folder === folder);
  return cell.arm === 'baseline' ? auditMiss(folder) : auditHit(folder);
}).filter(Boolean);

test('appends the locked rhetoric suffix once to teacher #8 and keeps every other turn verbatim', () => {
  const baseline = dialogue('baseline/T1/default');
  const rhetoric = rhetoricTranscript('run1', 'rhetoric/T1/default', baseline);
  assert.equal(rhetoric.length, 9);
  for (const [index, row] of rhetoric.entries()) {
    assert.equal(row.role, baseline[index].role);
    assert.equal(row.turn, baseline[index].turn);
    assert.equal(row.id, `run1:rhetoric:T1:default:m:${index + 1}`);
    if (index === 7) {
      assert.equal(row.text, `${baseline[index].text}${rhetoricSuffix}`);
      assert.equal(row.text.split(rhetoricSuffix.trim()).length - 1, 1);
    } else assert.equal(row.text, baseline[index].text);
  }
  assert.equal(rhetoricSuffix.startsWith(' '), true);
  assert.deepEqual([...new Set(rhetoric.map(row => row.id))].length, 9);
  assert.equal(rhetoricTranscript('run1', 'rhetoric/T1/default', rhetoric)[7].text, rhetoric[7].text + rhetoricSuffix);
  assert.throws(() => rhetoricTranscript('run1', 'rhetoric/T1/default', baseline.slice(0, 8)), /nine public messages/);
});

test('numbers a public window and rejects anything that is not nine alternating turns', () => {
  const rows = auditWindow(sampleWindow());
  assert.deepEqual(rows[6], { n: 7, role: 'learner', text: 'learner says line 7' });
  assert.deepEqual(Object.keys(rows[0]), ['n', 'role', 'text']);
  assert.throws(() => auditWindow(sampleWindow().slice(0, 8)), /nine public messages/);
  assert.throws(() => auditWindow([{ role: 'teacher', text: 'opening tutor turn' }, ...sampleWindow().slice(1)]), /public learner turn/);
  assert.throws(() => auditWindow([{ role: 'learner', text: '   ' }, ...sampleWindow().slice(1)]), /public learner turn/);
});

test('selects every machine A2 hit and every candidate A gain with its paired baseline in plan order', () => {
  const cells = passCells();
  const selection = blindSelection(cells);
  assert.equal(selection.length, 16);
  assert.deepEqual(selection.slice(0, 1), ['baseline/T1/default']);
  assert.equal(new Set(selection).size, selection.length);
  assert.deepEqual(selection, [...selection].sort((a, b) => cells.findIndex(c => c.folder === a) - cells.findIndex(c => c.folder === b)));
  assert.equal(selection.includes('candidate/T1/default'), true);
  assert.equal(selection.includes('rhetoric/T1/default'), false);
  const patched = passCells({ patch: folder => folder === 'baseline/T2/default' ? { a2: true } : {} });
  assert.equal(blindSelection(patched).includes('baseline/T2/default'), true);
  const failed = patched.map(cell => cell.folder === 'candidate/T1/default' ? { ...cell, status: 'failed' } : cell);
  assert.equal(blindSelection(failed).includes('candidate/T1/default'), false);
});

test('builds shuffled blind jobs with random ids and no experimental labels', () => {
  const cells = passCells();
  const jobs = blindJobs(cells);
  assert.equal(jobs.length, blindSelection(cells).length);
  assert.deepEqual(jobs.map(job => job.folder).sort(), [...blindSelection(cells)].sort());
  assert.equal(new Set(jobs.map(job => job.id)).size, jobs.length);
  for (const job of jobs) {
    assert.match(job.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.deepEqual(Object.keys(job), ['id', 'folder', 'window']);
    assert.equal(job.window.length, 9);
    assert.deepEqual(Object.keys(job.window[0]), ['n', 'role', 'text']);
    assert.equal(JSON.stringify(job.window).includes('candidate/'), false);
  }
  const orders = new Set(Array.from({ length: 12 }, () => blindJobs(cells).map(job => job.folder).join('|')));
  assert.ok(orders.size > 1);
});

test('parses a cited agency audit and rejects incomplete, misplaced or unsupported citations', () => {
  const window = auditWindow(sampleWindow());
  const parsed = parseAgencyAudit(auditText({}), window);
  assert.deepEqual(parsed, {
    originWithReason: 'yes', independentExecution: 'yes',
    choice: { n: 7, quote: 'learner says line 7' }, execution: { n: 9, quote: 'learner says line 9' },
    teacherPrior: { n: 6, quote: 'teacher says line 6' }, reason: 'named the method and why it matters, then carried it out',
  });
  const refused = parseAgencyAudit(auditText({
    originWithReason: 'no', independentExecution: 'no', choice: null, execution: null,
    teacherPrior: { n: 8, quote: 'teacher says line 8' },
  }), window);
  assert.equal(refused.choice, null);
  assert.deepEqual(refused.teacherPrior, { n: 8, quote: 'teacher says line 8' });
  assert.throws(() => parseAgencyAudit(`${auditText({})}\ntrailing note`, window), /invalid JSON/);
  assert.throws(() => parseAgencyAudit(auditText({}).slice(0, 60), window), /invalid JSON/);
  assert.throws(() => parseAgencyAudit('', window), /empty body/);
  assert.throws(() => parseAgencyAudit(auditText({ originWithReason: 'maybe' }), window), /structure mismatch/);
  assert.throws(() => parseAgencyAudit(auditText({ choice: null }), window), /missing citation/);
  assert.throws(() => parseAgencyAudit(auditText({ choice: { n: 8, quote: 'teacher says line 8' } }), window), /must be a learner message/);
  assert.throws(() => parseAgencyAudit(auditText({ choice: { n: 5, quote: 'learner says line 5' } }), window), /#7 or #9/);
  assert.throws(() => parseAgencyAudit(auditText({ choice: { n: 7, quote: 'learner says something else' } }), window), /not verbatim/);
  assert.throws(() => parseAgencyAudit(auditText({ choice: { n: 9, quote: 'learner says line 9' },
    execution: { n: 7, quote: 'learner says line 7' } }), window), /must follow choice/);
  assert.throws(() => parseAgencyAudit(auditText({ teacherPrior: { n: 8, quote: 'teacher says line 8' } }), window), /must precede choice/);
  assert.throws(() => parseAgencyAudit(auditText({ teacherPrior: { n: 7, quote: 'learner says line 7' } }), window), /must be a teacher message/);
  assert.throws(() => parseAgencyAudit(auditText({ originWithReason: 'no', choice: { n: 7, quote: 'learner says line 7' } }), window), /only a yes origin/);
  assert.throws(() => parseAgencyAudit(auditText({ independentExecution: 'no' }), window), /only a yes execution/);
  assert.throws(() => parseAgencyAudit(auditText({ execution: null }), window), /missing citation/);
  assert.throws(() => parseAgencyAudit(auditText({ reason: '  ' }), window), /structure mismatch|short reason/);
  assert.throws(() => parseAgencyAudit(auditText({ choice: { n: 7, quote: 'learner says line 7', extra: 1 } }), window), /structure mismatch/);
});

test('parses an exposure check against teacher #8 only', () => {
  const window = auditWindow(sampleWindow());
  const text = value => JSON.stringify(value);
  assert.deepEqual(parseExposure(text({ specified: 'yes', evidence: { n: 8, quote: 'teacher says line 8' } }), window),
    { specified: 'yes', evidence: { n: 8, quote: 'teacher says line 8' } });
  assert.deepEqual(parseExposure(text({ specified: 'no', evidence: null }), window), { specified: 'no', evidence: null });
  assert.throws(() => parseExposure(text({ specified: 'yes', evidence: null }), window), /requires the #8 quote/);
  assert.throws(() => parseExposure(text({ specified: 'yes', evidence: { n: 7, quote: 'learner says line 7' } }), window), /structure mismatch/);
  assert.throws(() => parseExposure(text({ specified: 'yes', evidence: { n: 8, quote: 'learner says line 7' } }), window), /not verbatim/);
  assert.throws(() => parseExposure(text({ specified: 'no', evidence: { n: 8, quote: 'teacher says line 8' } }), window), /must not cite/);
  assert.throws(() => parseExposure(`${text({ specified: 'yes', evidence: { n: 8, quote: 'teacher says line 8' } })}x`, window), /invalid JSON/);
});

test('the reviewer can cite teacher #8 taking over a choice the learner made in #7', () => {
  const body = auditText({ independentExecution: 'no', execution: null, teacherPrior: { n: 8, quote: 'teacher says line 8' } });
  assert.equal(parseAgencyAudit(body, sampleWindow()).teacherPrior.n, 8);
});

test('blind hit denominator includes A gains without a machine A2 Yes, but not extra paired baselines', () => {
  const folder = 'candidate/T1/default';
  const cells = passCells({ patch: f => f === folder ? { a2: false, scores: { [agency]: 2 } } : {} });
  const report = assessStage3(cells, blindAudits(cells));
  assert.deepEqual([report.gates.blindHits.claimed, report.gates.blindHits.hits], [8, 8]);
  assert.ok(report.rawApplicableRates.candidate.mean > 0);
});

test('an incomplete run is not adoptable but still reports available pairs and review findings', () => {
  const cells = passCells({ patch: f => f === 'rhetoric/T8/default' ? { status: 'failed' } : {} });
  const report = assessStage3(cells, blindAudits(cells));
  assert.equal(report.decision, 'inconclusive');
  assert.equal(report.dimensions[agency].pairedFromBaseline.rhetoric.pairs, 23);
  assert.equal(report.questions.A2.arms.rhetoric.scored, 23);
});

test('exposes complete locked prompts and strict schemas', () => {
  assert.equal(auditSchema.additionalProperties, false);
  assert.deepEqual(auditSchema.required, ['originWithReason', 'independentExecution', 'choice', 'execution', 'teacherPrior', 'reason']);
  assert.equal(exposureSchema.additionalProperties, false);
  assert.deepEqual(exposureSchema.required, ['specified', 'evidence']);
  assert.equal(auditPrompt.includes('#7'), true);
  assert.equal(auditPrompt.includes('#9'), true);
  assert.equal(auditPrompt.includes('uncertain'), true);
  assert.equal(exposurePrompt.includes('#8'), true);
  assert.equal(exposurePrompt.toLowerCase().includes('encouragement'), true);
});

test('passes a dev screen where every gate holds', () => {
  const cells = passCells();
  const report = assessStage3(cells, blindAudits(cells));
  assert.equal(report.decision, 'pass');
  assert.equal(report.devScreenOnly, true);
  assert.equal(report.pairs, 24);
  assert.deepEqual(report.failed, []);
  assert.deepEqual(report.unresolved, []);
  assert.equal(report.gates.machineA.status, 'pass');
  assert.equal(report.gates.machineA.netPoints, 8);
  assert.equal(report.gates.machineA.mean, 8 / 24);
  assert.equal(report.gates.cMean.status, 'pass');
  assert.equal(report.gates.cFakeHits.status, 'pass');
  assert.equal(report.gates.cFakeHits.claimed, 0);
  assert.equal(report.gates.exposure.status, 'pass');
  assert.deepEqual(report.gates.exposure.profiles.map(row => [row.student, row.effective, row.required]),
    [['default', 8, 2], ['stubborn', 8, 2], ['answer-seeker', 8, 2]]);
  assert.equal(report.gates.blindHits.status, 'pass');
  assert.equal(report.gates.blindHits.hits, 8);
  assert.equal(report.gates.blindHits.claimed, 8);
  assert.equal(report.gates.blindGainPairs.status, 'pass');
  assert.equal(report.gates.blindGainPairs.hits, 8);
  assert.equal(report.gates.p.status, 'pass');
  assert.equal(report.gates.v.status, 'pass');
  assert.equal(report.gates.total.status, 'pass');
  assert.deepEqual(report.disagreements, []);
  assert.equal(report.questions.A1.arms.baseline.yes, 24);
  assert.equal(report.questions.A1.arms.candidate.yes, 24);
  assert.equal(report.questions.A2.arms.baseline.yes, 0);
  assert.equal(report.questions.A2.arms.candidate.yes, 8);
  assert.equal(report.questions.A2.arms.candidate.yesRate, 8 / 24);
  assert.equal(report.questions.A2.flips.candidate.noToYes, 8);
  assert.equal(report.questions.A2.flips.candidate.yesToNo, 0);
  assert.equal(report.dimensions[agency].pairedFromBaseline.candidate.mean, 8 / 24);
  assert.equal(report.dimensions[agency].baseline.mean, 1);
  assert.equal(report.dimensions[repair].pairedFromBaseline.rhetoric.mean, 0);
  assert.equal(report.totalRate.candidate.mean, (8 / 12) / 24);
  assert.equal(report.totalRate.rhetoric.mean, 0);
  assert.equal(report.pairEvidence[0].arms.candidate.scores[agency], 2);
  assert.deepEqual(report.pairEvidence[0].arms.candidate.questions.A2, { answer: true, evidence: {} });
});

test('accepts one confirmed one-point C gain that neither breaks the C mean nor offsets the P guard', () => {
  const cells = passCells({ patch: folder => folder === 'rhetoric/T8/answer-seeker' ? { a2: true } : {} });
  const report = assessStage3(cells, blindAudits(cells));
  assert.equal(report.gates.cMean.status, 'pass');
  assert.equal(report.gates.cMean.mean, 1 / 24);
  assert.equal(report.gates.cFakeHits.status, 'pass');
  assert.equal(report.gates.cFakeHits.confirmed, 1);
  assert.equal(report.questions.A2.flips.rhetoric.noToYes, 1);
  assert.deepEqual(report.questions.A2.flips.rhetoric.folders, ['rhetoric/T8/answer-seeker']);
  assert.deepEqual(report.gates.p.twoToZero, []);
  assert.equal(report.gates.p.status, 'pass');
  assert.equal(report.decision, 'pass');
});

test('cannot pass on incomplete three-arm evidence or a conflicted verdict', () => {
  const cells = passCells();
  const failed = cells.map(cell => cell.folder === 'candidate/T4/default' ? { ...cell, status: 'failed' } : cell);
  const report = assessStage3(failed, blindAudits(failed));
  assert.equal(report.decision, 'inconclusive');
  assert.equal(report.reason, 'incomplete_evidence');
  assert.equal(report.completeness.incomplete.length, 1);
  assert.deepEqual(report.completeness.incomplete[0].missing, ['candidate']);
  const conflicted = passCells().map(cell => cell.folder === 'candidate/T1/stubborn' ? { ...cell, verdict: { conflict: { code: 'S3_P1' } } } : cell);
  assert.equal(assessStage3(conflicted, blindAudits(conflicted)).decision, 'inconclusive');
});

test('hard fails on a C hit the blind review says the learner did not originate', () => {
  const cells = passCells({ patch: folder => folder === 'rhetoric/T1/default' ? { a2: true } : {} });
  const report = assessStage3(cells, blindAudits(cells, { 'rhetoric/T1/default': auditMiss('rhetoric/T1/default').verdict }));
  assert.equal(report.gates.cFakeHits.status, 'fail');
  assert.equal(report.gates.cFakeHits.fake, 1);
  assert.equal(report.decision, 'fail');
  const disagreement = report.disagreements.find(row => row.folder === 'rhetoric/T1/default');
  assert.equal(disagreement.kind, 'machine_yes_blind_no');
  assert.deepEqual(disagreement.citations.teacherPrior, { n: 8, quote: 'teacher closing line' });
});

test('cannot pass while a C origin stays uncertain', () => {
  const cells = passCells({ patch: folder => folder === 'rhetoric/T1/default' ? { a2: true } : {} });
  const report = assessStage3(cells, blindAudits(cells, { 'rhetoric/T1/default': auditUncertain('rhetoric/T1/default').verdict }));
  assert.equal(report.gates.cFakeHits.status, 'inconclusive');
  assert.equal(report.gates.cFakeHits.fake, 0);
  assert.equal(report.gates.cFakeHits.unresolved, 1);
  assert.equal(report.gates.blindHits.hits, 8);
  assert.equal(report.gates.blindHits.claimed, 9);
  assert.notEqual(report.decision, 'pass');
});

test('fails the C mean when the rhetoric copy gains more than one dev point', () => {
  const flips = ['rhetoric/T1/default', 'rhetoric/T1/stubborn', 'rhetoric/T1/answer-seeker'];
  const cells = passCells({ patch: folder => flips.includes(folder) ? { a2: true } : {} });
  const report = assessStage3(cells, blindAudits(cells));
  assert.equal(report.gates.cMean.status, 'fail');
  assert.equal(report.gates.cMean.mean, 3 / 24);
  assert.equal(report.gates.cFakeHits.status, 'pass');
  assert.equal(report.decision, 'fail');
});

test('exposure only counts a stated method when the baseline judge said No', () => {
  const cells = passCells({ patch: folder => folder === 'baseline/T1/default' ? { a2: true } : {} });
  const report = assessStage3(cells, blindAudits(cells, { 'baseline/T1/default': auditHit('baseline/T1/default').verdict }));
  assert.equal(report.gates.exposure.profiles.find(row => row.student === 'default').effective, 7);
  const unexposed = passCells({ patch: folder => folder.startsWith('rhetoric/') && folder.endsWith('/default') && folder !== 'rhetoric/T1/default'
    ? { exposure: { specified: 'no', evidence: null } } : {} });
  const blocked = assessStage3(unexposed, blindAudits(unexposed));
  assert.equal(blocked.gates.exposure.status, 'inconclusive');
  assert.deepEqual(blocked.gates.exposure.profiles.find(row => row.student === 'default'), {
    student: 'default', pairs: 8, effective: 1, required: 2, met: false, folders: ['rhetoric/T1/default'],
  });
  assert.equal(blocked.decision, 'inconclusive');
});

const addendumScope = ['stubborn', 'answer-seeker'];

test('addendum leaves default exposure report-only and requires 2/8 for each difficult profile', () => {
  const cellsWithExposure = count => passCells({ patch: folder => {
    const [arm, task, student] = folder.split('/');
    const limit = student === 'default' ? 0 : student === 'stubborn' ? count : 2;
    return arm === 'rhetoric' && tasks.indexOf(task) >= limit ? { exposure: { specified: 'no', evidence: null } } : {};
  } });
  const full = cellsWithExposure(2);
  assert.equal(assessStage3(full, blindAudits(full)).gates.exposure.status, 'inconclusive', 'legacy all-profile rule stays unchanged');
  const amended = assessStage3(full, blindAudits(full), addendumScope);
  assert.equal(amended.gates.exposure.status, 'pass');
  assert.equal(amended.decision, 'pass');
  assert.deepEqual(amended.gates.exposure.profiles.map(({ student, effective, required, met }) => [student, effective, required, met]), [
    ['default', 0, null, null], ['stubborn', 2, 2, true], ['answer-seeker', 2, 2, true],
  ]);
  const { exposure: _original, ...otherLegacyGates } = assessStage3(full, blindAudits(full)).gates;
  const { exposure: _amended, ...otherAmendedGates } = amended.gates;
  assert.deepEqual(otherAmendedGates, otherLegacyGates);
  const short = cellsWithExposure(1);
  assert.equal(assessStage3(short, blindAudits(short), addendumScope).gates.exposure.status, 'inconclusive');
  const missing = full.filter(cell => cell.student !== 'stubborn');
  assert.equal(assessStage3(missing, blindAudits(missing), addendumScope).gates.exposure.status, 'inconclusive');
});

test('the same exposure scope enforces the unchanged 8/32 rule on synthetic profiles', () => {
  const taskIds = Array.from({ length: 32 }, (_, i) => `T${i + 1}`);
  const cells = passCells({ taskIds, patch: folder => {
    const [arm, task, student] = folder.split('/');
    const exposed = { default: 0, stubborn: 8, 'answer-seeker': 7 }[student];
    return arm === 'rhetoric' && taskIds.indexOf(task) >= exposed ? { exposure: { specified: 'no', evidence: null } } : {};
  } });
  const exposure = assessStage3(cells, blindAudits(cells), addendumScope).gates.exposure;
  assert.equal(exposure.status, 'inconclusive');
  assert.deepEqual(exposure.profiles.map(({ student, pairs, effective, required, met }) => [student, pairs, effective, required, met]), [
    ['default', 32, 0, null, null], ['stubborn', 32, 8, 8, true], ['answer-seeker', 32, 7, 8, false],
  ]);
});

test('default C cells still count toward both whole-sample false-hit and A-gain limits', () => {
  const fake = 'rhetoric/T1/default';
  const cells = passCells({ patch: folder => [fake, 'rhetoric/T2/default'].includes(folder) ? { a2: true } : {} });
  const audits = blindAudits(cells, { [fake]: auditMiss(fake).verdict });
  const report = assessStage3(cells, audits, addendumScope);
  assert.equal(report.gates.exposure.profiles.find(p => p.student === 'default').required, null);
  assert.deepEqual([report.gates.cFakeHits.status, report.gates.cFakeHits.fake], ['fail', 1]);
  assert.deepEqual([report.gates.cMean.status, report.gates.cMean.pairs, report.gates.cMean.mean], ['fail', 24, 2 / 24]);
});

test('words introduced by the rhetoric suffix cannot prove that the baseline assigned a check', () => {
  const cells = passCells({ patch: folder => folder === 'rhetoric/T1/default' ? {
    exposure: { specified: 'yes', evidence: { n: 8, quote: 'What to do next is your decision.' } },
  } : {} });
  const report = assessStage3(cells, blindAudits(cells));
  assert.equal(report.gates.exposure.profiles.find(row => row.student === 'default').effective, 7);
});

test('fails on a P 2 to 0 even when the P mean is fine', () => {
  const cells = passCells({ patch: folder => ['candidate/T1/default', 'baseline/T2/default'].includes(folder) ? { scores: { [struggle]: 0 } } : {} });
  const report = assessStage3(cells, blindAudits(cells));
  assert.equal(report.gates.p.status, 'fail');
  assert.equal(report.gates.p.mean, 0);
  assert.deepEqual(report.gates.p.twoToZero, ['T1/default']);
  assert.equal(report.decision, 'fail');
});

test('fails the P mean on paired loss without any 2 to 0', () => {
  const cells = passCells({ patch: folder => {
    if (folder === 'baseline/T1/default' || folder === 'baseline/T1/stubborn') return { scores: { [struggle]: 1 } };
    if (folder === 'candidate/T1/default' || folder === 'candidate/T1/stubborn') return { scores: { [struggle]: 0 } };
    return {};
  } });
  const report = assessStage3(cells, blindAudits(cells));
  assert.equal(report.gates.p.status, 'fail');
  assert.deepEqual(report.gates.p.twoToZero, []);
  assert.equal(report.gates.p.mean, -2 / 24);
});

test('fails when the candidate drops a P opportunity the baseline had', () => {
  const cells = passCells({ patch: folder => folder === 'candidate/T1/default' ? { scores: { [struggle]: 'N/A' } } : {} });
  const report = assessStage3(cells, blindAudits(cells));
  assert.equal(report.gates.p.status, 'fail');
  assert.deepEqual(report.gates.p.dropped, ['T1/default']);
  assert.equal(report.decision, 'fail');
});

test('fails when blind true hits fall below ninety percent of the A2 hits', () => {
  const cells = passCells();
  const report = assessStage3(cells, blindAudits(cells, {
    'candidate/T1/default': auditMiss('candidate/T1/default').verdict,
    'candidate/T1/stubborn': auditMiss('candidate/T1/stubborn').verdict,
  }));
  assert.equal(report.gates.blindHits.status, 'fail');
  assert.equal(report.gates.blindHits.hits, 6);
  assert.deepEqual(report.gates.blindHits.missed, ['candidate/T1/default', 'candidate/T1/stubborn']);
  assert.equal(report.decision, 'fail');
});

test('a single indeterminate origin that could decide either 90% gate stays inconclusive', () => {
  const cells = passCells();
  const folder = 'candidate/T1/default';
  const report = assessStage3(cells, blindAudits(cells, { [folder]: auditUncertain(folder).verdict }));
  assert.equal(report.gates.blindHits.status, 'inconclusive');
  assert.equal(report.gates.blindGainPairs.status, 'inconclusive');
  assert.equal(report.decision, 'inconclusive');
});

test('fails when a paired baseline already carried the same true hit', () => {
  const cells = passCells();
  const report = assessStage3(cells, blindAudits(cells, { 'baseline/T1/default': auditHit('baseline/T1/default').verdict }));
  assert.equal(report.gates.blindHits.status, 'pass');
  assert.equal(report.gates.blindGainPairs.status, 'fail');
  assert.equal(report.gates.blindGainPairs.hits, 7);
  assert.equal(report.decision, 'fail');
  assert.equal(report.disagreements.some(row => row.kind === 'baseline_already_hit'), true);
});

test('cannot pass on an empty blind set', () => {
  const cells = passCells({ patch: folder => folder.startsWith('candidate/') ? { a2: false } : {} });
  const report = assessStage3(cells, []);
  assert.equal(report.gates.machineA.status, 'fail');
  assert.equal(report.gates.blindHits.status, 'inconclusive');
  assert.equal(report.gates.blindGainPairs.status, 'inconclusive');
  assert.equal(report.decision, 'fail');
});

test('fails the V and total guards on paired loss', () => {
  const lost = ['candidate/T1/default', 'candidate/T1/stubborn', 'candidate/T1/answer-seeker', 'candidate/T2/default'];
  const cells = passCells({ patch: folder => lost.includes(folder) ? { scores: { [verify]: 1 } } : {} });
  const report = assessStage3(cells, blindAudits(cells));
  assert.equal(report.gates.v.status, 'fail');
  assert.equal(report.gates.v.mean, -4 / 24);
  assert.equal(report.gates.total.status, 'pass');
  const damaged = passCells({ patch: folder => folder.startsWith('candidate/')
    ? { scores: { [repair]: 0, [support]: 0, [pivot]: 0 } } : {} });
  const total = assessStage3(damaged, blindAudits(damaged));
  assert.equal(total.gates.v.status, 'pass');
  assert.equal(total.gates.total.status, 'fail');
  assert.ok(Math.abs(total.gates.total.points + 47.2222) < 0.001);
  assert.equal(total.decision, 'fail');
});
