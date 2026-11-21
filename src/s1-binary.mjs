import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { policy, routes, taskId } from '../config/e1.mjs';
import { binaryCellResult, cellIds, filenames } from '../contracts/artifacts/schema.mjs';
import { failure, hash, requireThat } from '../contracts/core/schema.mjs';
import { binaryIdentityVersion, binaryOutputContract, binaryRuler } from '../contracts/judge/binary.mjs';
import { gradeBinary } from './binary-judge.mjs';
import { attemptBudget } from './models.mjs';
import { binaryOfflineResponses } from './offline.mjs';
import { verifyRun } from './run-receipts.mjs';
import { evaluationIdentity, executeCell, frozenDialogue, write } from './run.mjs';
import { assessS1, constructExpectations, requireRegisteredSource, s1Path, s1Plan, s1PreregistrationFile, s1Scenario, s1SourceId, s1Targets } from './s1-binary-plan.mjs';

export function s1Budget() {
  const typicalCalls = s1Plan.length;
  const maxCalls = typicalCalls * (policy.retries + 1);
  return { typicalCalls, maxCalls, maxOutputTokens: maxCalls * policy.judge.maxTokens };
}

export function prepareS1({ root, mode, judgeOnly, registration, registrationDigest }, estimate) {
  const real = mode === 'real';
  requireThat(!real || judgeOnly === s1SourceId, `real S1 only admits frozen source ${s1SourceId}`);
  requireThat(!real || estimate || registration, 'real S1 requires --preregistration <file>');
  const verification = verifyRun(root, judgeOnly);
  requireThat(verification.verified && verification.acceptance === true && (!real || verification.mode === 'real'), 'S1 requires a verified complete E2 source run');
  const manifest = JSON.parse(readFileSync(join(root, judgeOnly, filenames.manifest)));
  requireThat(manifest.identity.ruler === 'e1-numbered-evidence-v3' && manifest.identity.judgeOutputContract === 'judge-output-v2', 'S1 requires the v3 source contract');
  requireThat(manifest.identityId === hash({ mode: manifest.mode, scenario: manifest.scenario, identity: manifest.identity }), 'S1 source identity digest mismatch');
  const frozen = new Map(cellIds.map(cell => [cell, frozenDialogue(root, judgeOnly, 'E2', cell, real)]));
  const source = { runId: judgeOnly, ...frozen.get('normal').sourceIdentity, cells: [...frozen.values()].map(entry => entry.provenance) };
  requireThat(Boolean(registration) === Boolean(registrationDigest), 'provide both --preregistration and --preregistration-sha256');
  const preregistration = registration ? readFileSync(registration) : undefined;
  if (preregistration) {
    requireThat(hash(preregistration) === registrationDigest, 'preregistration digest mismatch');
    const markdown = preregistration.toString('utf8');
    requireRegisteredSource(markdown, source);
    constructExpectations(markdown);
  }
  return { frozen, source, dataset: manifest.identity.dataset, preregistration, registrationDigest };
}

export async function runS1({ id, root, mode, judgeOnly, limits, checkReceipt, recorder }, prepared) {
  const { frozen, source, dataset, preregistration, registrationDigest: preregistrationSha256 } = prepared;
  const { pid, startedAt } = recorder.start;
  const writer = { pid, startedAt };
  const runDir = join(root, id);
  mkdirSync(runDir);
  if (preregistration) writeFileSync(join(runDir, s1PreregistrationFile), preregistration);
  const identity = Object.assign(evaluationIdentity({ mode, limits, dataset, provenance: source, sources: [
    'contracts/judge/binary.mjs', 'src/binary-judge.mjs', 'src/s1-binary.mjs', 'src/s1-binary-plan.mjs', 'src/s1-binary-verification.mjs', 'config/e2.mjs', 'scripts/s1-binary-report.mjs',
  ] }), {
    version: binaryIdentityVersion, ruler: binaryRuler, judgeOutputContract: binaryOutputContract,
    routes: mode === 'real' ? { judge: routes.judge } : 'pi-ai-faux', targets: s1Targets, planned: s1Plan, preregistrationSha256,
  });
  const scenario = s1Scenario;
  const identityId = hash({ mode, scenario, identity });
  const manifestPath = join(runDir, filenames.manifest), resultPath = join(runDir, filenames.result);
  write(manifestPath, { id, scenario, taskId, mode, identity, identityId, budget: s1Budget(), limits, planned: s1Plan, writer, checkReceipt, source });
  const reserve = attemptBudget(limits);
  const cells = [], artifacts = [];
  const result = { id, scenario, taskId, mode, runDir, acceptance: false, cells };
  for (const coordinate of s1Plan) {
    const { repetition, condition } = coordinate;
    const { messages, bytes } = frozen.get(condition);
    const folder = s1Path(coordinate);
    const digestFile = filename => hash(readFileSync(join(runDir, folder, filename)));
    let judged;
    try {
      judged = await executeCell({ runDir, id, variant: condition, coordinate: { repetition }, mode, reserve, recorder, writer,
        frozen: messages, frozenBytes: bytes, judgeOnly, grader: gradeBinary, fixtures: mode === 'offline' ? binaryOfflineResponses(condition) : undefined,
      });
      const telemetry = JSON.parse(readFileSync(join(runDir, folder, filenames.telemetry)));
      artifacts.push({ ...coordinate, transcriptSha256: digestFile(filenames.transcript), telemetrySha256: digestFile(filenames.telemetry),
        ...(!judged.failure && { judgeSha256: digestFile(filenames.judge) }),
        attempts: telemetry.map(row => ({ path: row.attemptPath, sha256: hash(readFileSync(join(runDir, row.attemptPath))) })),
      });
    } catch (error) {
      judged = { failure: failure('artifact_io', { repetition, condition }, error.message).failure };
    }
    const scoring = judged.verdict?.scoring;
    cells.push({ repetition, ...binaryCellResult(condition, scoring, judged.failure) });
    write(resultPath, result);
    if (judged.failure) break;
  }
  result.acceptance = cells.length === s1Plan.length && cells.every(row => row.validTotal);
  result.assessment = assessS1(cells);
  write(resultPath, result);
  recorder.publishEvaluation({ id, scenario, mode, acceptance: result.acceptance, passed: result.assessment.passed, identityId, manifestSha256: hash(readFileSync(manifestPath)),
    resultSha256: hash(readFileSync(resultPath)), preregistrationSha256, cells: artifacts,
  });
  return result;
}
