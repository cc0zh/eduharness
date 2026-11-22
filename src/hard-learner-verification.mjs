import { isDeepStrictEqual as same } from 'node:util';
import { policy, rounds } from '../config/e1.mjs';
import { fidelityAuditPolicies, fidelityPolicy } from '../config/fidelity-audit.mjs';
import { hardLearnerCheckScope, hardLearnerScenario as scenario, learnerFixSelections } from '../config/hard-learners.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { fidelityAuditPrompt, parseFidelityAudit, parseFidelityEvidence } from '../contracts/learner/fidelity.mjs';
import { matchesHardProfileIdentity } from '../contracts/learner/profiles.mjs';
import { learnerJsonExample, parseLearner } from '../contracts/learner/schema.mjs';
import { advanceFidelityStopState, assessFidelity, auditContext, fidelityBudget, fidelityIdentityVersion, fidelityPlanFor, fidelityStopRules, frozenPrefix,
  groupPath, initialFidelityStopState, learnerFixIdentityVersion, learnerFixStudents, learnerOutputProtocol, learnerTask,
  plannedReplyNumber, registrationFile, trialCoordinates, trialMessage } from './hard-learner-plan.mjs';
import { matchesJudgeParameters, matchesReportedRoute } from './judge-transport.mjs';

const responseText = response => response.content.filter(block => block.type === 'text').map(block => block.text).join('');
const sameFailureRows = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((row, index) =>
  row.path === expected[index].path && row.kind === expected[index].kind && row.attempt === expected[index].attempt
    && row.attemptPath === expected[index].attemptPath);
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
    const legacyIdentity = identity.version === 'hard-learner-fidelity-v1';
    const learnerFixIdentity = identity.version === learnerFixIdentityVersion;
    const currentIdentity = identity.version === fidelityIdentityVersion || learnerFixIdentity;
    const learnerFix = start.parameters.values.learner_fix;
    requireThat(learnerFixIdentity ? learnerFixSelections.includes(learnerFix) && identity.learnerFix === learnerFix : learnerFix === undefined,
      'learner-fix selection differs from launch');
    const plan = fidelityPlanFor(learnerFix);
    requireThat([manifest, result, evaluation].every(row => row.scenario === scenario && row.id === id && row.mode === start.mode)
      && start.parameters.values.scenario === scenario, 'scenario, mode or run ID mismatch');
    requireThat(same(manifest.writer, { pid: start.pid, startedAt: start.startedAt }), 'manifest writer PID or start time mismatch');
    requireThat((legacyIdentity || currentIdentity) && identityId === evaluation.identityId && identityId === hash({ mode, scenario, identity })
      && same(identity.planned, plan) && same(identity.limits, limits), 'identity or plan mismatch');
    if (currentIdentity) {
      const ceiling = fidelityBudget(learnerFix);
      requireThat(same(identity.learnerOutputProtocol, learnerOutputProtocol)
        && same(identity.stopRules, fidelityStopRules), 'learner output protocol or stop rules identity mismatch');
      requireThat(same(manifest.budget, ceiling) && Number.isSafeInteger(limits?.maxAttempts)
        && limits.maxAttempts > 0 && limits.maxAttempts <= ceiling.maxCalls && Number.isSafeInteger(limits.maxRequestedOutputTokens)
        && limits.maxRequestedOutputTokens > 0 && limits.maxRequestedOutputTokens <= ceiling.maxOutputTokens, 'invalid registered fidelity limits');
    }
    const auditRoute = identity.routes?.fidelity_audit;
    const learnerRoute = identity.routes?.learner;
    const parseAudit = learnerFixIdentity || identity.calls?.fidelity_audit?.version === 'hard-learner-audit-v4' ? parseFidelityEvidence : parseFidelityAudit;
    const legacyAudit = identity.calls?.fidelity_audit?.version === 'hard-learner-audit-v1' && auditRoute?.id === 'openai/gpt-4.1-mini';
    const auditPromptSha256 = ['hard-learner-audit-v1', 'hard-learner-audit-v2'].includes(identity.calls?.fidelity_audit?.version)
      ? originalAuditPromptSha256 : identity.auditPromptSha256;
    requireThat(typeof auditPromptSha256 === 'string' && /^[a-f0-9]{64}$/.test(auditPromptSha256), 'missing audit prompt identity');
    const auditPolicy = learnerFixIdentity ? fidelityAuditPolicies.gemini.policy : fidelityPolicy;
    if (learnerFixIdentity) {
      requireThat(same(identity.students, learnerFixStudents(learnerFix))
        && same(identity.calls.fidelity_audit, auditPolicy) && auditPromptSha256 === hash(fidelityAuditPrompt), 'student or Gemini audit identity mismatch');
    }
    if (mode === 'real') {
      requireThat(start.clean && manifest.checkReceipt?.head === start.head
        && manifest.checkReceipt.scope === hardLearnerCheckScope && start.parameters.flags.includes('--confirm-cost')
        && identity.preregistrationSha256, 'real fidelity provenance mismatch');
      if (!learnerFixIdentity) requireThat(auditRoute?.provider === 'openrouter' && typeof auditRoute.id === 'string'
        && (legacyAudit || typeof auditRoute.endpoint === 'string' && auditRoute.endpoint.length > 0), 'missing audit route identity');
      if (currentIdentity) requireThat(learnerRoute?.provider === 'deepseek' && learnerRoute.responseFormat === 'json_object', 'missing learner JSON mode route identity');
      if (learnerFixIdentity) requireThat(same(auditRoute, fidelityAuditPolicies.gemini.route) && start.parameters.flags.includes('--proxy-from-env')
        && ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'].includes(identity.fidelityProxySource), 'missing pinned Gemini audit transport identity');
    }
    if (identity.preregistrationSha256) requireThat(hash(read(registrationFile)) === identity.preregistrationSha256
      && identity.preregistrationSha256 === start.parameters.values.preregistration_sha256, 'preregistration mismatch');

    const trials = plan.flatMap(trialCoordinates);
    requireThat(result.trials.length === trials.length, 'planned trial count mismatch');
    const sent = requests.filter(event => event.type === 'request_start').map(event => event.callId);
    const attempts = [];
    let outputTokens = 0, cursor = 0;
    let stopState = initialFidelityStopState(), observedStopRule = null;
    const formatCleanupStats = { attempts: 0, operations: {} };
    function lastSuccess(folder, role, matchesPrompt, expectedView, student) {
      const telemetry = json(`${folder}/telemetry.json`, true);
      if (!telemetry) return {};
      const limit = role === 'learner' ? policy.learner.maxTokens : auditPolicy.maxTokens;
      const retries = currentIdentity ? fidelityStopRules.maxReplyRetries : policy.retries;
      requireThat(Array.isArray(telemetry) && telemetry.length <= retries + 1, `attempt count mismatch at ${folder}`);
      let success, lastFailure, callStop;
      for (const [i, row] of telemetry.entries()) {
        const attemptPath = `${folder}/calls/${role}-${rounds}-1-${i + 1}.json`;
        const raw = json(attemptPath);
        requireThat(row.pid === start.pid && raw.pid === start.pid && row.attemptPath === attemptPath
          && [raw, row].every(attempt => attempt.role === role && attempt.turn === rounds && attempt.call === 1 && attempt.attempt === i + 1), `attempt coordinate or PID mismatch at ${attemptPath}`);
        requireThat(Number.isSafeInteger(row.requestLimit) && row.requestLimit > 0 && row.requestLimit <= limit, `bad output limit at ${attemptPath}`);
        requireThat(matchesPrompt(raw.context.systemPrompt) && same(JSON.parse(raw.context.messages[0].content), expectedView), `request evidence differs at ${attemptPath}`);
        const callId = `${folder}:${role}:${rounds}:1:${i + 1}`;
        if (currentIdentity) {
          requireThat(!observedStopRule, `unexpected attempt after the batch stop at ${attemptPath}`);
          const callOutcome = advanceFidelityStopState(stopState, { type: 'call', failureKind: row.failureKind });
          stopState = callOutcome.state;
          callStop = callOutcome.stopRule;
          observedStopRule ??= callStop;
        }
        if (currentIdentity && role === 'learner') {
          requireThat(Array.isArray(raw.formatCleanups), `learner cleanup record missing at ${attemptPath}`);
          if (mode === 'real' && sent.includes(callId)) {
            const { model, max_tokens, max_completion_tokens, response_format } = raw.outbound ?? {};
            requireThat(row.model === learnerRoute.id && row.provider === learnerRoute.provider && model === learnerRoute.id
              && (max_tokens ?? max_completion_tokens) === row.requestLimit && response_format?.type === 'json_object', `bad learner outbound JSON mode at ${attemptPath}`);
            if (student) requireThat(same(raw.outbound.thinking, { type: student.thinking === 'off' ? 'disabled' : 'enabled' })
              && raw.outbound.reasoning_effort === (student.thinking === 'low' ? 'low' : undefined),
              `learner thinking differs from student identity at ${attemptPath}`);
          }
          const metadata = { allowBoundedCleanup: true, formatCleanups: [] };
          const parseFailure = row.failureKind === 'simulator_generation_contract';
          const normalBody = raw.response?.stopReason === 'stop' && !raw.response.content.some(block => block.type === 'toolCall');
          if ((!row.failureKind || parseFailure) && normalBody) {
            let detail;
            try { parseLearner(responseText(raw.response), undefined, undefined, metadata); }
            catch (error) { detail = error instanceof SyntaxError ? 'invalid JSON document' : error.message; }
            requireThat((row.detail ?? undefined) === detail && parseFailure === (detail !== undefined), `learner parse outcome does not replay at ${attemptPath}`);
          }
          requireThat(same(raw.formatCleanups, metadata.formatCleanups), `learner format cleanup does not replay at ${attemptPath}`);
          if (raw.formatCleanups.length) {
            formatCleanupStats.attempts++;
            for (const cleanup of raw.formatCleanups) {
              formatCleanupStats.operations[cleanup.kind] = (formatCleanupStats.operations[cleanup.kind] ?? 0) + 1;
            }
          }
        }
        if (role === 'fidelity_audit' && mode === 'real' && !legacyAudit && sent.includes(callId)) {
          const { model, max_tokens, max_completion_tokens, provider, response_format, reasoning } = raw.outbound ?? {};
          const pinsMatch = learnerFixIdentity
            ? raw.outbound && matchesJudgeParameters(raw.outbound, Object.keys(raw.outbound), auditRoute, auditPolicy)
              && row.requestLimit === auditPolicy.maxTokens && row.policyVersion === auditPolicy.version
              && [row, raw].every(attempt => attempt.proxied === true && attempt.proxySource === identity.fidelityProxySource)
              && (row.failureKind === 'configuration' || matchesReportedRoute(auditRoute, row.reportedProvider, row.reportedModel))
            : reasoning === undefined && same(provider, { require_parameters: true, only: [auditRoute.endpoint], allow_fallbacks: false });
          requireThat(row.model === auditRoute.id && row.provider === auditRoute.provider && model === auditRoute.id && row.auditMode === 'json_schema'
            && (max_tokens ?? max_completion_tokens) === row.requestLimit && pinsMatch
            && response_format?.type === 'json_schema' && response_format.json_schema?.strict === true, `bad audit outbound at ${attemptPath}`);
        }
        attempts.push(callId);
        outputTokens += limit;
        if (row.failureKind) lastFailure = { kind: row.failureKind, attempt: row.attempt, attemptPath: row.attemptPath, detail: row.detail };
        else {
          requireThat(i === telemetry.length - 1 && raw.response.stopReason === 'stop' && (mode === 'offline' || sent.includes(callId)), `bad successful attempt at ${attemptPath}`);
          success = responseText(raw.response);
          lastFailure = undefined;
        }
      }
      const terminalFailure = lastFailure && lastFailure.kind !== 'configuration' && (callStop || telemetry.length === retries + 1);
      return { success, failure: terminalFailure ? lastFailure : undefined };
    }

    const observedFailedReplies = [], observedAuditFailures = [];
    for (const group of plan) {
      const folder = groupPath(group);
      const groupTrials = [];
      const auditedTrials = [];
      const transcripts = [];
      const task = learnerTask(group.taskId);
      const student = identity.students?.[group.arm ?? learnerFix];
      const learnerIdentity = (learnerFixIdentity ? student.profiles : identity.learners)[group.profileId];
      const matchesLearner = prompt => {
        if (currentIdentity && !prompt.endsWith(learnerJsonExample)) return false;
        const profilePrompt = currentIdentity ? prompt.slice(0, -learnerJsonExample.length) : prompt;
        return matchesHardProfileIdentity(profilePrompt, task, group.profileId, learnerIdentity);
      };
      for (const trial of trialCoordinates(group)) {
        const stored = result.trials[cursor++];
        const { generated, audit, failure: replyFailure, ...coordinate } = stored;
        requireThat(typeof generated === 'boolean' && same(coordinate, trial), `trial coordinate mismatch at ${trial.path}`);
        requireThat(generated || audit === undefined, `audit without a learner reply at ${trial.path}`);
        const prefix = frozenPrefix(id, trial);
        const transcript = json(`${trial.path}/transcript.json`, true);
        const learnerCall = lastSuccess(trial.path, 'learner', matchesLearner, prefix.map(({ role, text }) => ({ role, text })), student);
        const success = learnerCall.success;
        if (currentIdentity && (success !== undefined || learnerCall.failure)) {
          const replyOutcome = advanceFidelityStopState(stopState, { type: 'reply', failed: success === undefined });
          stopState = replyOutcome.state;
          observedStopRule ??= replyOutcome.stopRule;
        }
        if (currentIdentity && learnerCall.failure) {
          requireThat(replyFailure?.path === trial.path && replyFailure.kind === learnerCall.failure?.kind
            && replyFailure.attempt === learnerCall.failure?.attempt && replyFailure.attemptPath === learnerCall.failure?.attemptPath,
          `failed learner reply does not match attempts at ${trial.path}`);
          observedFailedReplies.push(replyFailure);
        } else requireThat(replyFailure === undefined, `unexpected failed learner reply record at ${trial.path}`);
        const learnerText = success === undefined ? undefined : parseLearner(success, undefined, undefined,
          currentIdentity ? { allowBoundedCleanup: true, formatCleanups: [] } : undefined).text;
        const expected = learnerText === undefined ? prefix : [...prefix, trialMessage(id, trial, prefix.length, learnerText)];
        requireThat(generated === (success !== undefined) && (!transcript && !generated || same(transcript, expected)), `transcript does not replay at ${trial.path}`);
        if (generated) {
          transcripts.push(transcript);
          auditedTrials.push(stored);
        }
        groupTrials.push(stored);
      }
      const view = auditContext(group.taskId, transcripts);
      const auditCall = lastSuccess(folder, 'fidelity_audit', prompt => hash(prompt) === auditPromptSha256, view);
      const success = auditCall.success;
      const audit = json(`${folder}/audit.json`, true);
      if (success !== undefined) {
        requireThat(transcripts.length === auditedTrials.length && transcripts.every(messages => messages.length === plannedReplyNumber), `incomplete audit window at ${folder}`);
        requireThat(same(parseAudit(success, view.samples), audit) && same(audit, auditedTrials.map(trial => trial.audit)), `audit cannot be replayed at ${folder}`);
      } else {
        requireThat(!audit && groupTrials.every(trial => trial.audit === undefined), `audit without completed request at ${folder}`);
        if (currentIdentity && auditCall.failure) {
          observedAuditFailures.push({ path: folder, ...auditCall.failure });
        }
      }
    }
    requireThat(readPaths.size === Object.keys(files).length, 'unexpected fidelity artifact paths');
    requireThat(attempts.length <= limits.maxAttempts && outputTokens <= limits.maxRequestedOutputTokens, 'attempts exceed run limits');
    requireThat(same(sent, attempts.filter(callId => sent.includes(callId))) && requests.every((event, i) =>
      i % 2 ? event.type === 'request_end' && event.requestId === requests[i - 1].requestId : event.type === 'request_start'), 'requests do not match serial attempt evidence');
    requireThat(same(result.assessment, learnerFix === 'pilot' ? undefined : assessFidelity(result.trials)), 'assessment differs from preregistered line');
    if (currentIdentity) {
      requireThat(same(result.formatCleanupStats, formatCleanupStats), 'format cleanup summary differs from attempts');
      requireThat(sameFailureRows(result.failedReplies, observedFailedReplies) && sameFailureRows(result.auditFailures, observedAuditFailures), 'failure lists differ from attempt evidence');
      requireThat(result.failure?.stopRule === observedStopRule || result.failure?.stopRule === undefined && observedStopRule === null,
        'batch stop rule differs from attempt evidence');
    }
    requireThat(result.acceptance === result.trials.every(trial => trial.audit) && result.acceptance === receipt.acceptance, 'completion disagrees with receipts');
  } catch (error) {
    invalid.push(`hard learner verification failed: ${error.message}`);
  }
}
