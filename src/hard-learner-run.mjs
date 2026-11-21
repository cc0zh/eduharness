import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fidelityPolicy, fidelityRoute, policy, rounds, routes } from '../config/e1.mjs';
import { hardLearnerScenario as scenario } from '../config/hard-learners.mjs';
import { failure, hash, requireThat } from '../contracts/core/schema.mjs';
import { fidelityAuditPrompt, parseFidelityEvidence } from '../contracts/learner/fidelity.mjs';
import { hardProfileIdentity, hardProfileIds } from '../contracts/learner/profiles.mjs';
import { learnerPrompt, learnerReply } from './learner.mjs';
import { attemptBudget, Models } from './models.mjs';
import { fauxJson } from './offline.mjs';
import { advanceFidelityStopState, assessFidelity, auditContext, fidelityBudget, fidelityIdentityVersion, fidelityPlan, fidelityStopRules,
  frozenPrefix, groupPath, initialFidelityStopState, learnerOutputProtocol, learnerTask, registrationFile, trialCoordinates, trialMessage } from './hard-learner-plan.mjs';

export function prepareHardLearners({ mode, registration, registrationDigest }, estimate) {
  if (registration === undefined && registrationDigest === undefined && (estimate || mode === 'offline')) return undefined;
  requireThat(registration && /^[a-f0-9]{64}$/.test(registrationDigest), 'provide --preregistration and its SHA256');
  const bytes = readFileSync(registration);
  requireThat(hash(bytes) === registrationDigest, 'preregistration SHA256 mismatch');
  return bytes;
}

const sources = ['package-lock.json', 'config/e1.mjs', 'config/hard-learners.mjs', 'contracts/core/schema.mjs',
  'contracts/learner/schema.mjs', 'contracts/learner/profiles.mjs', 'contracts/learner/fidelity.mjs',
  'src/learner.mjs', 'src/models.mjs', 'src/cli.mjs', 'src/run-receipts.mjs', 'src/real-preflight.mjs', 'src/offline.mjs',
  'src/hard-learner-plan.mjs', 'src/hard-learner-run.mjs', 'src/hard-learner-verification.mjs'];

export async function runHardLearners({ id, root, mode, limits, checkReceipt, recorder, registrationDigest }, registration) {
  if (mode === 'real') new Models({ mode, roles: ['learner', 'fidelity_audit'] });
  const runDir = join(root, id);
  mkdirSync(runDir);
  const files = {};
  const put = (path, value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    const target = join(runDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    files[path] = hash(bytes);
  };
  const { pid, startedAt } = recorder.start;
  const identity = {
    version: fidelityIdentityVersion,
    learners: Object.fromEntries(hardProfileIds.map(id => [id, hardProfileIdentity(id)])),
    learnerOutputProtocol,
    stopRules: fidelityStopRules,
    calls: { learner: policy.learner, fidelity_audit: fidelityPolicy, timeoutMs: policy.timeoutMs, retries: policy.retries, temperature: 0 },
    routes: mode === 'real' ? { learner: { ...routes.learner, responseFormat: learnerOutputProtocol.responseFormat }, fidelity_audit: fidelityRoute } : 'pi-ai-faux',
    planned: fidelityPlan, auditPromptSha256: hash(fidelityAuditPrompt), preregistrationSha256: registrationDigest, limits,
    sources: Object.fromEntries(sources.map(path => [path, hash(readFileSync(new URL(`../${path}`, import.meta.url)))])),
  };
  const identityId = hash({ mode, scenario, identity });
  if (registration) put(registrationFile, registration);
  put('manifest.json', { id, mode, scenario, identity, identityId, writer: { pid, startedAt }, checkReceipt, budget: fidelityBudget(), limits });

  const reserve = attemptBudget(limits);
  let stopState = initialFidelityStopState();
  const failedReplies = [], auditFailures = [];
  const formatCleanupStats = { attempts: 0, operations: {} };
  function modelAt(folder, role, fixture, learnerJsonMode = false) {
    const telemetry = [];
    put(`${folder}/telemetry.json`, telemetry);
    return new Models({ mode, roles: [role], learnerJsonMode, reserve, recorder, cell: folder,
      responses: mode === 'offline' ? [fauxJson(fixture)] : undefined,
      save(raw, meter) {
        const attemptPath = `${folder}/calls/${role}-${raw.turn}-${raw.call}-${raw.attempt}.json`;
        put(attemptPath, { ...raw, pid });
        if (role === 'learner' && raw.formatCleanups?.length) {
          formatCleanupStats.attempts++;
          for (const cleanup of raw.formatCleanups) {
            formatCleanupStats.operations[cleanup.kind] = (formatCleanupStats.operations[cleanup.kind] ?? 0) + 1;
          }
        }
        telemetry.push({ ...meter, attemptPath, pid });
        put(`${folder}/telemetry.json`, telemetry);
        const callOutcome = advanceFidelityStopState(stopState, { type: 'call', failureKind: meter.failureKind });
        stopState = callOutcome.state;
        if (callOutcome.stopRule) {
          const stopped = failure(meter.failureKind ?? 'provider_failure', { role, turn: meter.turn, call: meter.call,
            attempt: meter.attempt, attemptPath }, meter.detail ?? meter.failureKind);
          stopped.failure.stopRule = callOutcome.stopRule;
          throw stopped;
        }
        return attemptPath;
      },
    });
  }

  const trials = fidelityPlan.flatMap(trialCoordinates).map(trial => ({ ...trial, generated: false }));
  let location, problem;
  try {
    let cursor = 0;
    for (const group of fidelityPlan) {
      const folder = groupPath(group);
      const groupTrials = trials.slice(cursor, cursor + group.conditions.length);
      cursor += groupTrials.length;
      const transcripts = [];
      const successfulTrials = [];
      const systemPrompt = learnerPrompt(learnerTask(group.taskId), group.profileId);
      for (const trial of groupTrials) {
        location = trial.path;
        const prefix = frozenPrefix(id, trial);
        put(`${trial.path}/transcript.json`, prefix);
        try {
          const models = modelAt(trial.path, 'learner', { text: prefix[6].text }, true);
          const text = await learnerReply(models, systemPrompt, prefix, rounds);
          const messages = [...prefix, trialMessage(id, trial, prefix.length, text)];
          put(`${trial.path}/transcript.json`, messages);
          transcripts.push(messages);
          successfulTrials.push(trial);
          trial.generated = true;
          stopState = advanceFidelityStopState(stopState, { type: 'reply', failed: false }).state;
        } catch (error) {
          const info = error.failure ?? failure('artifact_io', { role: 'learner', turn: rounds, call: 1 }, error.message).failure;
          if (['budget_exhausted', 'configuration', 'artifact_io', 'preflight_failed', 'run_conflict'].includes(info.kind)) throw error;
          const failed = { path: trial.path, ...info };
          trial.failure = failed;
          failedReplies.push(failed);
          const replyOutcome = advanceFidelityStopState(stopState, { type: 'reply', failed: true });
          stopState = replyOutcome.state;
          if (info.stopRule) throw error;
          if (replyOutcome.stopRule) {
            throw Object.assign(error, { failure: { ...failed, stopRule: replyOutcome.stopRule } });
          }
        }
      }
      if (!successfulTrials.length) continue;
      location = folder;
      const view = auditContext(group.taskId, transcripts);
      const fixture = mode === 'offline' ? { observations: view.samples.map(({ sample, messages }) => ({
        sample, stance: 'other', stepPerformed: false, correctionWithBasis: false, unexplainedClaim: '', privateLeak: false,
        teacher: { n: 8, quote: messages[7].text }, learner: { n: 9, quote: messages[8].text }, reason: 'Offline transport fixture.',
      })) } : undefined;
      const auditor = modelAt(folder, 'fidelity_audit', fixture);
      try {
        const { value: audit } = await auditor.complete({ role: 'fidelity_audit', turn: rounds, call: 1 }, {
          systemPrompt: fidelityAuditPrompt,
          messages: [{ role: 'user', timestamp: Date.now(), content: JSON.stringify(view) }],
        }, text => parseFidelityEvidence(text, view.samples));
        put(`${folder}/audit.json`, audit);
        for (const [i, trial] of successfulTrials.entries()) trial.audit = audit[i];
      } catch (error) {
        const info = error.failure ?? failure('artifact_io', { role: 'fidelity_audit', turn: rounds, call: 1 }, error.message).failure;
        if (!['budget_exhausted', 'configuration', 'artifact_io', 'preflight_failed', 'run_conflict'].includes(info.kind)) {
          auditFailures.push({ path: folder, ...info });
        }
        if (info.stopRule || ['budget_exhausted', 'configuration', 'artifact_io', 'preflight_failed', 'run_conflict'].includes(info.kind)) throw error;
      }
    }
  } catch (error) {
    problem = { ...(error.failure ?? failure('artifact_io', {}, error.message).failure), path: location };
  }
  const acceptance = !problem && trials.every(trial => trial.audit);
  const assessment = assessFidelity(trials);
  put('result.json', { id, scenario, mode, runDir, acceptance, trials, assessment, failedReplies, auditFailures, formatCleanupStats, failure: problem });
  recorder.publishEvaluation({ id, scenario, mode, acceptance, identityId, files });
  return { id, scenario, mode, runDir, acceptance, generated: trials.filter(row => row.generated).length,
    audited: trials.filter(row => row.audit).length, assessment, failedReplies, auditFailures, formatCleanupStats, failure: problem };
}
