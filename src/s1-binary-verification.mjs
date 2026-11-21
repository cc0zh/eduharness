import { isDeepStrictEqual as same } from 'node:util';
import { policy, rounds, taskId } from '../config/e1.mjs';
import { binaryCellResult, filenames } from '../contracts/artifacts/schema.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { binaryIdentityVersion, binaryOutputContract, binaryRuler, bindBinary, parseBinaryJudgement } from '../contracts/judge/binary.mjs';
import { assessS1, constructExpectations, requireRegisteredSource, s1Path, s1Plan, s1PreregistrationFile, s1Scenario, s1SourceId } from './s1-binary-plan.mjs';

export function verifyS1Artifacts({ id, start, receipt, evaluation, requests, checkArtifact, invalid }) {
  const read = (path, digest) => {
    const bytes = checkArtifact(path, digest);
    requireThat(bytes, `unverified artifact ${path}`);
    return bytes;
  };
  const json = (path, digest) => JSON.parse(read(path, digest));
  try {
    const manifest = json(filenames.manifest, evaluation.manifestSha256);
    const result = json(filenames.result, evaluation.resultSha256);
    const { mode, identity, identityId, source } = manifest;
    requireThat(start?.parameters?.values?.scenario === s1Scenario && [manifest, result, evaluation].every(row => row.scenario === s1Scenario && row.id === id && row.mode === start.mode), 'scenario, mode or run ID mismatch');
    requireThat(manifest.taskId === taskId && result.taskId === taskId && same(manifest.planned, s1Plan) && same(identity.planned, s1Plan), 'plan mismatch');
    requireThat(manifest.writer.pid === start.pid && manifest.writer.startedAt === start.startedAt, 'manifest writer mismatch');
    requireThat(identity.version === binaryIdentityVersion && identity.ruler === binaryRuler && identity.judgeOutputContract === binaryOutputContract, 'binary identity version mismatch');
    requireThat(identityId === evaluation.identityId && identityId === hash({ mode, scenario: s1Scenario, identity }) && same(identity.dialogueSource, source), 'evaluation identity mismatch');
    if (mode === 'real') requireThat(start.clean && manifest.checkReceipt?.head === start.head && source.runId === s1SourceId && identity.preregistrationSha256, 'real S1 provenance mismatch');
    requireThat(identity.preregistrationSha256 === evaluation.preregistrationSha256 && identity.preregistrationSha256 === start.parameters.values.preregistration_sha256, 'preregistration digest mismatch');
    if (evaluation.preregistrationSha256) {
      const markdown = read(s1PreregistrationFile, evaluation.preregistrationSha256).toString('utf8');
      requireRegisteredSource(markdown, source);
      constructExpectations(markdown);
    }
    requireThat(Array.isArray(result.cells) && result.cells.length <= s1Plan.length && evaluation.cells?.length === result.cells.length, 'result and artifact counts differ');
    const sent = requests?.filter(event => event.type === 'request_start').map(event => event.callId) ?? [];
    const outbound = [];
    let attempts = 0, output = 0;
    for (const [i, cell] of result.cells.entries()) {
      const coordinate = s1Plan[i];
      const { repetition, condition } = coordinate;
      const folder = s1Path(coordinate);
      const artifact = evaluation.cells[i];
      requireThat(cell.repetition === repetition && cell.id === condition && artifact.repetition === repetition && artifact.condition === condition, `out-of-order cell ${folder}`);
      requireThat(artifact.transcriptSha256 === source.cells.find(row => row.cell === condition)?.transcriptSha256, `source transcript digest mismatch at ${folder}`);
      const view = bindBinary(json(`${folder}/${filenames.transcript}`, artifact.transcriptSha256));
      const telemetry = json(`${folder}/${filenames.telemetry}`, artifact.telemetrySha256);
      requireThat(view.messages.length === 2 * rounds + 1 && Array.isArray(telemetry) && telemetry.length <= policy.retries + 1 && artifact.attempts?.length === telemetry.length, `invalid transcript or attempt count at ${folder}`);
      let published;
      for (const [j, row] of telemetry.entries()) {
        const attempt = j + 1;
        const path = `${folder}/${filenames.raw}/judge-${rounds}-1-${attempt}.json`;
        const entry = artifact.attempts[j];
        requireThat(entry.path === path && row.attemptPath === path && row.pid === start.pid && row.repetition === repetition && row.role === 'judge' && row.turn === rounds && row.call === 1 && row.attempt === attempt, `judge coordinate or PID mismatch at ${path}`);
        const raw = json(path, entry.sha256);
        const binding = { runId: id, cell: condition, ruler: binaryRuler, viewHash: view.id, messageIds: view.messages.map(m => m.id), sourceRunId: source.runId, repetition };
        requireThat(same(raw.binding, binding) && same(row.binding, binding), `judge binding mismatch at ${path}`);
        requireThat(Number.isInteger(row.requestLimit) && row.requestLimit > 0 && row.requestLimit <= policy.judge.maxTokens, `bad request limit at ${path}`);
        attempts++;
        output += row.requestLimit;
        if (raw.outbound) {
          const { max_tokens, max_completion_tokens, reasoning, response_format } = raw.outbound;
          requireThat((max_tokens ?? max_completion_tokens) === row.requestLimit && reasoning.max_tokens === policy.judge.reasoningMaxTokens && reasoning.max_tokens === row.reasoningLimit && response_format.type === 'json_schema' && response_format.json_schema.strict === true, `outbound judge parameters mismatch at ${path}`);
          outbound.push(`${repetition}:${condition}:judge:${rounds}:1:${attempt}`);
        }
        if (!row.failureKind) {
          requireThat(!published && row === telemetry.at(-1) && (mode !== 'real' || raw.outbound), `unexpected successful attempt at ${path}`);
          const text = raw.response.content.filter(block => block.type === 'text').map(block => block.text).join('');
          const verdict = parseBinaryJudgement(text, view);
          published = { binding: { ...raw.binding, role: 'judge', turn: rounds, call: 1, attempt, attemptPath: path }, verdict };
        }
      }
      if (published) {
        const stored = json(`${folder}/${filenames.judge}`, artifact.judgeSha256);
        requireThat(same(stored.verdict, published.verdict) && Object.entries(published.binding).every(([key, value]) => same(stored.binding[key], value)), `published ruling does not replay at ${folder}`);
        requireThat(same(cell, { repetition, ...binaryCellResult(condition, published.verdict.scoring) }), `cell score mismatch at ${folder}`);
      } else requireThat(!artifact.judgeSha256 && cell.failure && i === result.cells.length - 1 && same(cell, { repetition, ...binaryCellResult(condition, undefined, cell.failure) }), `unscored S1 cell at ${folder}`);
    }
    requireThat(same(outbound, sent), 'logged requests do not match serial judge attempts');
    requireThat(same(identity.limits, manifest.limits) && attempts <= manifest.limits.maxAttempts && output <= manifest.limits.maxRequestedOutputTokens, 'recorded attempts exceed registered limits');
    const acceptance = result.cells.length === s1Plan.length && result.cells.every(cell => cell.validTotal);
    requireThat(acceptance === result.acceptance && acceptance === receipt.acceptance, 'S1 completion disagrees with result or process receipt');
    const assessment = assessS1(result.cells);
    requireThat(same(result.assessment, assessment) && evaluation.passed === assessment.passed, 'preregistered verdict does not recompute');
  } catch (error) {
    invalid.push(`S1 binary verification failed: ${error.message}`);
  }
}
