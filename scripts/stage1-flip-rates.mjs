import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exact, hash, nonblank, requireThat } from '../contracts/core/schema.mjs';
import { splitBinaryRuler, splitDimensions, splitQuestions } from '../contracts/judge/binary-v3.mjs';
import { splitBinaryV4Ruler } from '../contracts/judge/binary-v4.mjs';
import { readBatch } from '../src/cell-batch-verification.mjs';
import { workingJudge } from '../src/working-judge.mjs';

const tally = () => ({ pairs: 0, flips: 0 });
const dimensions = Object.entries(splitQuestions).map(([dimension, questions]) => [dimension, Object.keys(questions)]);
const ids = dimensions.flatMap(([, questions]) => questions);
const questionIds = Object.fromEntries(dimensions);
const isSha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fraction = ({ pairs, flips }, decisionPairs = pairs) => ({ pairs, flips, rate: pairs ? flips / pairs : null, sufficient: decisionPairs >= 3 });
const add = (count, flipped) => { count.pairs++; if (flipped) count.flips++; };
const coordinate = ({ run, cell, processIndex, callId, attemptPath }) => ({ run, cell, processIndex, callId, attemptPath });

export function computeFlipRates(rows) {
  const questions = Object.fromEntries(ids.map(id => [id, tally()]));
  const totals = Object.fromEntries(dimensions.map(([id]) => [id, { questionBits: tally(), anyQuestion: tally(), score: tally() }]));
  const seen = new Set(), byInput = new Map();
  for (const row of rows) {
    const { run, cell, processIndex, callId, transcriptSha256, dimension, requestSha256, answers, score } = row;
    const label = `${run}/${cell}/${dimension}/${callId}`;
    requireThat([run, cell, callId].every(nonblank) && isSha256(transcriptSha256) && isSha256(requestSha256)
      && splitDimensions.includes(dimension), `invalid decision coordinate: ${label}`);
    requireThat(exact(answers, questionIds[dimension]) && Object.values(answers).every(value => typeof value === 'boolean'), `invalid ${label} answers`);
    requireThat([0, 1, 2, 'N/A'].includes(score), `invalid ${label} score`);
    const unique = JSON.stringify([run, processIndex, callId]);
    requireThat(!seen.has(unique), `duplicate decision: ${label}`);
    seen.add(unique);
    const key = JSON.stringify([transcriptSha256, dimension, requestSha256]);
    if (!byInput.has(key)) byInput.set(key, []);
    byInput.get(key).push(row);
  }
  const groups = [];
  for (const group of byInput.values()) {
    if (group.length < 2) continue;
    const { dimension, transcriptSha256, requestSha256 } = group[0];
    const counts = totals[dimension], flips = [];
    for (const [i, first] of group.entries()) for (const second of group.slice(i + 1)) {
      const changed = questionIds[dimension].filter(id => first.answers[id] !== second.answers[id]);
      for (const id of questionIds[dimension]) {
        const differs = changed.includes(id);
        add(questions[id], differs);
        add(counts.questionBits, differs);
      }
      const scoreChanged = first.score !== second.score;
      add(counts.anyQuestion, changed.length > 0);
      add(counts.score, scoreChanged);
      if (changed.length || scoreChanged) flips.push({ first: coordinate(first), second: coordinate(second), questions: changed, scores: [first.score, second.score] });
    }
    const pairs = group.length * (group.length - 1) / 2;
    groups.push({ dimension, transcriptSha256, requestSha256, decisions: group.map(coordinate), pairs, sufficient: pairs >= 3, flips });
  }
  return {
    questions: Object.fromEntries(ids.map(id => [id, fraction(questions[id])])),
    dimensions: Object.fromEntries(dimensions.map(([id]) => [id, {
      questionBits: fraction(totals[id].questionBits, totals[id].score.pairs),
      anyQuestion: fraction(totals[id].anyQuestion),
      score: fraction(totals[id].score),
    }])),
    groups,
  };
}

export const stage1Runs = Object.freeze({
  v3: Object.freeze(['round2-bakeoff-gemini-proxy-01', 'round2-binary-v3-freeze-gemini-01']),
  v4: Object.freeze(['round2-binary-v4-freeze-gemini-01']),
});

function decisions(root, run, ruler) {
  const batch = readBatch(root, run);
  const { manifest, selected, attempts, latest, latestResult, manifestSha256 } = batch;
  const { identity } = manifest;
  requireThat(manifest.mode === 'real' && !latest.interrupted && latest.exitCode === 0 && latestResult?.acceptance === true
    && manifest.planned.length === selected.size && identity.ruler === ruler && identity.judgePolicy === workingJudge.judgePolicy
    && identity.judgeTransport.proxied && identity.judgeTransport.proxySource === workingJudge.judgeTransport.proxySource,
    `not a completed verified ${ruler} Gemini proxy run: ${run}`);
  const byCall = new Map(attempts.map(attempt => [`${attempt.processIndex}:${attempt.callId}`, attempt]));
  const rows = manifest.planned.flatMap(({ id, transcriptSha256 }) => {
    const cell = selected.get(id);
    const { verdict, binding } = cell?.judgement ?? {};
    requireThat(verdict && cell.artifacts[`${id}/transcript.json`] === transcriptSha256, `invalid transcript or judgment at ${run}/${id}`);
    return dimensions.map(([dimension, questions]) => {
      const { callId, processIndex, attemptPath } = binding.dimensions[dimension];
      const attempt = byCall.get(`${processIndex}:${callId}`);
      const { raw, meter } = attempt ?? {};
      requireThat(attempt?.folder === id && attempt.sent && raw?.outbound && !meter.failureKind && raw.binding.dimension === dimension,
        `invalid accepted request at ${run}/${id}/${dimension}/${callId}`);
      const requestSha256 = hash({ prompt: raw.context.systemPrompt,
        messages: raw.context.messages.map(({ role, content }) => ({ role, content })),
        outbound: raw.outbound, proxied: raw.proxied, proxySource: raw.proxySource });
      return {
        run, cell: id, processIndex, transcriptSha256, dimension, requestSha256, callId, attemptPath,
        answers: Object.fromEntries(questions.map(q => [q, verdict.answers[q].answer])), score: verdict.scoring.scores[dimension],
      };
    });
  });
  return { rows, source: { run, ruler, manifestSha256, identityId: manifest.identityId, cells: manifest.planned.length, historicalRequests: latest.requestCount } };
}

export function analyzeStage1(root = 'runs') {
  return Object.fromEntries(Object.entries(stage1Runs).map(([version, ids]) => {
    const batches = ids.map(id => decisions(root, id, version === 'v3' ? splitBinaryRuler : splitBinaryV4Ruler));
    const rows = batches.flatMap(batch => batch.rows);
    return [version, { sources: batches.map(batch => batch.source), decisions: rows.length, ...computeFlipRates(rows) }];
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(analyzeStage1(process.argv[2]), null, 2));
}
