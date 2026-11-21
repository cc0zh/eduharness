import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { policy, routes, taskId } from '../config/e1.mjs';
import { cellIds, filenames } from '../contracts/artifacts/schema.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { binaryIdentityVersion, binaryOutputContract, binaryRuler } from '../contracts/judge/binary.mjs';
import { gradeBinary } from './binary-judge.mjs';
import { runCellBatch } from './cell-batch.mjs';
import { binaryOfflineResponses } from './offline.mjs';
import { verifyRun } from './run-receipts.mjs';
import { evaluationIdentity, executeCell, frozenDialogue } from './run.mjs';
import { constructExpectations, requireRegisteredSource, s1Plan, s1Scenario, s1SourceId, s1Targets } from './s1-binary-plan.mjs';

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

export async function runS1(config, prepared) {
  const { id, mode, judgeOnly, limits, checkReceipt } = config;
  const { frozen, source, dataset, preregistration, registrationDigest: preregistrationSha256 } = prepared;
  const identity = Object.assign(evaluationIdentity({ mode, limits, dataset, provenance: source, sources: [
    'contracts/judge/binary.mjs', 'src/binary-judge.mjs', 'src/s1-binary.mjs', 'src/s1-binary-plan.mjs', 'src/s1-binary-verification.mjs', 'config/e2.mjs', 'scripts/s1-binary-report.mjs',
  ] }), {
    version: binaryIdentityVersion, ruler: binaryRuler, judgeOutputContract: binaryOutputContract,
    routes: mode === 'real' ? { judge: routes.judge } : 'pi-ai-faux', targets: s1Targets, planned: s1Plan, preregistrationSha256,
  });
  const scenario = s1Scenario;
  const identityId = hash({ mode, scenario, identity });
  return runCellBatch(config, { id, scenario, taskId, mode, identity, identityId, budget: s1Budget(), limits, planned: s1Plan, checkReceipt, source }, (folder, context) => {
    const [repetition, condition] = folder.split('/');
    const { messages, bytes } = frozen.get(condition);
    return executeCell({ ...context, id, variant: condition, coordinate: { repetition }, mode,
      frozen: messages, frozenBytes: bytes, judgeOnly, grader: gradeBinary, fixtures: mode === 'offline' ? binaryOfflineResponses(condition) : undefined });
  }, preregistration);
}
