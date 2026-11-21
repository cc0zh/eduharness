import { isDeepStrictEqual as same } from 'node:util';
import { fidelityPolicy, policy, rounds } from '../config/e1.mjs';
import { hardLearnerCheckScope, hardLearnerScenario as scenario } from '../config/hard-learners.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { parseFidelityAudit, parseFidelityEvidence } from '../contracts/learner/fidelity.mjs';
import { learnerPrompt } from '../contracts/learner/profiles.mjs';
import { parseLearner } from '../contracts/learner/schema.mjs';
import { assessFidelity, auditContext, fidelityIdentityVersion, fidelityPlan, frozenPrefix, groupPath, learnerTask, plannedReplyNumber, registrationFile, trialCoordinates, trialMessage } from './hard-learner-plan.mjs';

const responseText = response => response.content.filter(block => block.type === 'text').map(block => block.text).join('');
const originalAuditPromptSha256 = '38b1571b594c4b7daa2d8668aa8dc02d4f69a54260b52ed07629ba00afcf87b5';

export function verifyHardLearnerArtifacts({ id, start, receipt, evaluation, requests, checkArtifact, invalid }) {
  try {
    const { files } = evaluation;
    const readPaths = new Set();
    const read = (path, optional = false) => {
      if (optional && !Object.hasOwn(files, path)) return undefined;
      const bytes = checkArtifact(path, files[path]);
      requireThat(bytes, `unverified artifact ${path}`);
      readPaths.add(path);
      return bytes;
    };
    const json = (path, optional = false) => {
      const bytes = read(path, optional);
      return bytes && JSON.parse(bytes);
    };
    const manifest = json('manifest.json');
    const result = json('result.json');
    const { mode, identity, identityId, limits } = manifest;
    requireThat([manifest, result, evaluation].every(row => row.scenario === scenario && row.id === id && row.mode === start.mode)
      && start.parameters.values.scenario === scenario, 'scenario, mode or run ID mismatch');
    requireThat(same(manifest.writer, { pid: start.pid, startedAt: start.startedAt }), 'manifest writer PID or start time mismatch');
    requireThat(identity.version === fidelityIdentityVersion && identityId === evaluation.identityId && identityId === hash({ mode, scenario, identity })
      && same(identity.planned, fidelityPlan) && same(identity.limits, limits), 'identity or plan mismatch');
    const auditRoute = identity.routes?.fidelity_audit;
    const parseAudit = identity.calls?.fidelity_audit?.version === 'hard-learner-audit-v4' ? parseFidelityEvidence : parseFidelityAudit;
    const legacyAudit = identity.calls?.fidelity_audit?.version === 'hard-learner-audit-v1' && auditRoute?.id === 'openai/gpt-4.1-mini';
    const auditPromptSha256 = ['hard-learner-audit-v1', 'hard-learner-audit-v2'].includes(identity.calls?.fidelity_audit?.version)
      ? originalAuditPromptSha256 : identity.auditPromptSha256;
    requireThat(typeof auditPromptSha256 === 'string' && /^[a-f0-9]{64}$/.test(auditPromptSha256), 'missing audit prompt identity');
    if (mode === 'real') {
      requireThat(start.clean && manifest.checkReceipt?.head === start.head
        && manifest.checkReceipt.scope === hardLearnerCheckScope && start.parameters.flags.includes('--confirm-cost')
        && identity.preregistrationSha256, 'real fidelity provenance mismatch');
      requireThat(auditRoute?.provider === 'openrouter' && typeof auditRoute.id === 'string'
        && (legacyAudit || typeof auditRoute.endpoint === 'string' && auditRoute.endpoint.length > 0), 'missing audit route identity');
    }
    if (identity.preregistrationSha256) requireThat(hash(read(registrationFile)) === identity.preregistrationSha256
      && identity.preregistrationSha256 === start.parameters.values.preregistration_sha256, 'preregistration mismatch');

    const trials = fidelityPlan.flatMap(trialCoordinates);
    requireThat(result.trials.length === trials.length, 'planned trial count mismatch');
    const sent = requests.filter(event => event.type === 'request_start').map(event => event.callId);
    const attempts = [];
    let outputTokens = 0, cursor = 0;
    function lastSuccess(folder, role, expectedPromptSha256, expectedView) {
      const telemetry = json(`${folder}/telemetry.json`, true);
      if (!telemetry) return undefined;
      const limit = role === 'learner' ? policy.learner.maxTokens : fidelityPolicy.maxTokens;
      requireThat(Array.isArray(telemetry) && telemetry.length <= policy.retries + 1, `attempt count mismatch at ${folder}`);
      let success;
      for (const [i, row] of telemetry.entries()) {
        const attemptPath = `${folder}/calls/${role}-${rounds}-1-${i + 1}.json`;
        const raw = json(attemptPath);
        requireThat(row.pid === start.pid && raw.pid === start.pid && row.attemptPath === attemptPath
          && [raw, row].every(attempt => attempt.role === role && attempt.turn === rounds && attempt.call === 1 && attempt.attempt === i + 1), `attempt coordinate or PID mismatch at ${attemptPath}`);
        requireThat(Number.isSafeInteger(row.requestLimit) && row.requestLimit > 0 && row.requestLimit <= limit, `bad output limit at ${attemptPath}`);
        requireThat(hash(raw.context.systemPrompt) === expectedPromptSha256 && same(JSON.parse(raw.context.messages[0].content), expectedView), `request evidence differs at ${attemptPath}`);
        const callId = `${folder}:${role}:${rounds}:1:${i + 1}`;
        if (role === 'fidelity_audit' && mode === 'real' && !legacyAudit && sent.includes(callId)) {
          const { model, max_tokens, max_completion_tokens, provider, response_format, reasoning } = raw.outbound ?? {};
          requireThat(row.model === auditRoute.id && row.provider === auditRoute.provider && model === auditRoute.id && row.auditMode === 'json_schema'
            && (max_tokens ?? max_completion_tokens) === row.requestLimit && reasoning === undefined
            && same(provider, { require_parameters: true, only: [auditRoute.endpoint], allow_fallbacks: false })
            && response_format?.type === 'json_schema' && response_format.json_schema?.strict === true, `bad audit outbound at ${attemptPath}`);
        }
        attempts.push(callId);
        outputTokens += limit;
        if (!row.failureKind) {
          requireThat(i === telemetry.length - 1 && raw.response.stopReason === 'stop' && (mode === 'offline' || sent.includes(callId)), `bad successful attempt at ${attemptPath}`);
          success = responseText(raw.response);
        }
      }
      return success;
    }

    for (const group of fidelityPlan) {
      const folder = groupPath(group);
      const groupTrials = [];
      const transcripts = [];
      const promptSha256 = hash(learnerPrompt(learnerTask(group.taskId), group.profileId));
      for (const trial of trialCoordinates(group)) {
        const stored = result.trials[cursor++];
        const { generated, audit, ...coordinate } = stored;
        requireThat(typeof generated === 'boolean' && same(coordinate, trial), `trial coordinate mismatch at ${trial.path}`);
        const prefix = frozenPrefix(id, trial);
        const transcript = json(`${trial.path}/transcript.json`, true);
        const success = lastSuccess(trial.path, 'learner', promptSha256, prefix.map(({ role, text }) => ({ role, text })));
        const expected = success === undefined ? prefix : [...prefix, trialMessage(id, trial, prefix.length, parseLearner(success).text)];
        requireThat(generated === (success !== undefined) && (!transcript && !generated || same(transcript, expected)), `transcript does not replay at ${trial.path}`);
        if (generated) transcripts.push(transcript);
        groupTrials.push(stored);
      }
      const view = auditContext(group.taskId, transcripts);
      const success = lastSuccess(folder, 'fidelity_audit', auditPromptSha256, view);
      const audit = json(`${folder}/audit.json`, true);
      if (success !== undefined) {
        requireThat(transcripts.length === groupTrials.length && transcripts.every(messages => messages.length === plannedReplyNumber), `incomplete audit window at ${folder}`);
        requireThat(same(parseAudit(success, view.samples), audit) && same(audit, groupTrials.map(trial => trial.audit)), `audit cannot be replayed at ${folder}`);
      } else requireThat(!audit && groupTrials.every(trial => trial.audit === undefined), `audit without completed request at ${folder}`);
    }
    requireThat(readPaths.size === Object.keys(files).length, 'unexpected fidelity artifact paths');
    requireThat(attempts.length <= limits.maxAttempts && outputTokens <= limits.maxRequestedOutputTokens, 'attempts exceed run limits');
    requireThat(same(sent, attempts.filter(callId => sent.includes(callId))) && requests.every((event, i) =>
      i % 2 ? event.type === 'request_end' && event.requestId === requests[i - 1].requestId : event.type === 'request_start'), 'requests do not match serial attempt evidence');
    requireThat(same(result.assessment, assessFidelity(result.trials)), 'assessment differs from preregistered line');
    requireThat(result.acceptance === result.trials.every(trial => trial.audit) && result.acceptance === receipt.acceptance, 'completion disagrees with receipts');
  } catch (error) {
    invalid.push(`hard learner verification failed: ${error.message}`);
  }
}
