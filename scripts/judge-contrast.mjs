import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual as same, parseArgs } from 'node:util';
import { judgeCandidates } from '../config/judge-contrast.mjs';
import { runId } from '../contracts/artifacts/schema.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { readBatch } from '../src/cell-batch-verification.mjs';
import { makeContrastRegistration } from '../src/judge-contrast.mjs';
import { judgeContrastScenario } from '../src/judge-contrast-plan.mjs';
import { verifyRun } from '../src/run-receipts.mjs';
import { write } from '../src/run.mjs';
import { analyzeJudgeContrast, renderJudgeContrastReport } from './reasoning-off-report.mjs';

function rejectedAnswers({ raw, meter }) {
  if (meter?.failureKind !== 'judge_partial_failure') return;
  try {
    return JSON.parse(raw.response.content.filter(block => block.type === 'text').map(block => block.text).join('')).answers;
  } catch { return undefined; }
}

function report(root, id) {
  const verification = verifyRun(root, id);
  requireThat(verification.verified, `run verification failed: ${JSON.stringify(verification)}`);
  const { manifest, selected, attempts } = readBatch(root, id);
  requireThat(manifest.scenario === judgeContrastScenario, 'not a judge contrast');
  const { judgePolicy, policy, preregistrationSha256 } = manifest.identity;
  const { candidate, expected, history, queue, plan } = makeContrastRegistration(judgePolicy);
  requireThat(same(queue, manifest.planned) && same(plan.prior, manifest.source.prior), 'historical inputs do not match run identity');
  const outcomes = queue.flatMap(row => {
    const item = selected.get(row.id);
    const rows = attempts.filter(attempt => attempt.folder === row.id).map(attempt => {
      const { meter, sent, callId, processIndex, pid, scope } = attempt;
      const path = meter?.attemptPath;
      return { ...scope, ...meter, callId, processIndex, pid, sent: Boolean(sent),
        attemptPath: path && `_processes/${processIndex}/${path}`, failureKind: meter ? meter.failureKind : 'unsettled', rejectedAnswers: rejectedAnswers(attempt) };
    });
    return item || rows.length ? [{ id: row.id, verdict: item?.judgement?.verdict, failure: item?.row.failure, attempts: rows, recorded: Boolean(item) }] : [];
  });
  const analysis = analyzeJudgeContrast({ mode: manifest.mode, queue, outcomes, expected, history, limits: manifest.limits, budget: verification.budget });
  const dir = join(root, id);
  write(join(dir, 'verify-run.json'), verification);
  write(join(dir, `${candidate.slug}-summary.json`), analysis);
  const path = join(dir, `${candidate.slug}-report.md`);
  const { identityId } = manifest;
  writeFileSync(path, renderJudgeContrastReport(analysis, { id, identityId, preregistrationSha256, candidate: candidate.label,
    policyVersion: policy.version, route: candidate.route, verification }));
  return { id, identityId, preregistrationSha256, path, adopted: analysis.adopted, gates: analysis.gates, elapsed: analysis.elapsed.batch, usage: analysis.usage };
}

const { values } = parseArgs({ options: {
  register: { type: 'string' }, report: { type: 'string' }, 'run-root': { type: 'string', default: 'runs' },
} });
requireThat(Boolean(values.register) !== Boolean(values.report), 'pass one of --register <judge-policy> or --report <run ID>');
if (values.register) {
  requireThat(Object.hasOwn(judgeCandidates, values.register), 'unknown judge policy');
  const { candidate, bytes, plan } = makeContrastRegistration(values.register);
  const path = resolve('.tmp', 'scratch', candidate.slug, 'preregistration.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ path, id: plan.runId, preregistrationSha256: hash(bytes), concurrency: plan.concurrency, ...plan.limits }));
} else console.log(JSON.stringify(report(resolve(values['run-root']), runId(values.report))));
