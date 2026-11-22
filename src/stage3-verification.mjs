import { isDeepStrictEqual as same } from 'node:util';
import { policy, rounds, routes } from '../config/e1.mjs';
import { agencyAudit, observerPolicy, observerRoute, stage3Concurrency, stage3DevTasks, stage3ProxySource, stage3Scenario as scenario } from '../config/stage3.mjs';
import { exact, hash, message, requireThat } from '../contracts/core/schema.mjs';
import { bindBinary } from '../contracts/judge/binary.mjs';
import { assembleBinaryVerdict, splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { parseLearner } from '../contracts/learner/schema.mjs';
import { handoffFallbackReply, handoffRejection, validateHandoffResponse } from '../contracts/teacher/handoff.mjs';
import { validateObservation } from '../contracts/teacher/observation.mjs';
import { publicReply } from '../contracts/teacher/schema.mjs';
import { replaySplitJudge, splitBinding } from './split-judge-replay.mjs';
import { auditPrompt, auditWindow, blindSelection, exposurePrompt, parseAgencyAudit, parseExposure, rhetoricTranscript } from './stage3-audit.mjs';
import { stage3Fixtures } from './stage3-fixtures.mjs';
import { stage2bManifestSha } from './stage2b-plan.mjs';
import { judgementManifest, readStage3Addendum, readStage3Method, stage3AddendumFile, stage3AddendumFlag, stage3AddendumIdentityVersion,
  stage3Budget, stage3CallId, stage3CallPath, stage3Folder, stage3Ledger, stage3Plan, stage3Stop } from './stage3-plan.mjs';
import { assessStage3, tutorExamples } from './stage3-report.mjs';
import { handoffSystemView, linearGoals, teacherActionGoal, usesHandoffContract } from './teacher/session.mjs';
import { decideStudentAction, emptyObservation, initialPending, observationPromptFor, observationWindow } from './teacher/state-machine.mjs';
import { workingJudge, workingJudgeFingerprint } from './working-judge.mjs';

const responseText = raw => raw.response.content.filter(block => block.type === 'text').map(block => block.text).join('');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const checkPass = (check, head) => check?.head === head && check.status === 'passed' && check.command === 'npm run check' && Number.isSafeInteger(check.passed) && check.passed > 0;
const theWindow = (raw, prompt, view) => raw.context.systemPrompt === prompt && raw.context.messages.length === 1
  && raw.context.messages[0].role === 'user' && same(JSON.parse(raw.context.messages[0].content), view);

export function verifyStage3Artifacts({ id, start, receipt, evaluation, requests, checkArtifact }) {
  const { mode, pid, head, startedAt } = start;
  const real = mode === 'real';
  const launch = start.parameters.values, flags = start.parameters.flags;
  const checked = new Set();
  const read = path => {
    const bytes = checkArtifact(path, evaluation.files[path]);
    requireThat(bytes && !checked.has(path), `missing or duplicate stage 3 artifact: ${path}`);
    checked.add(path);
    return bytes;
  };
  const json = path => JSON.parse(read(path));
  const sameRun = row => row.id === id && row.mode === mode && row.scenario === scenario && row.identityId === evaluation.identityId;
  const { sha: methodSha } = readStage3Method();
  const budget = stage3Budget();
  const limits = { maxAttempts: budget.maxAttempts, maxRequestedOutputTokens: budget.maxRequestedOutputTokens };
  const estimateOnly = flags.includes('--estimate-only');
  const addendumFlag = flags.includes(stage3AddendumFlag);
  function checkAddendum(identity) {
    if (identity.version === 'stage3-dev-v1') {
      requireThat(!addendumFlag && !Object.hasOwn(identity, 'preregistrationAddendum') && (identity.edition === 1 || estimateOnly || !real),
        'invalid stage 3 preregistration addendum for historical identity');
      return;
    }
    const { addendumIdentity } = readStage3Addendum();
    requireThat(identity.edition === 2 && same(identity.preregistrationAddendum, addendumIdentity)
      && (real ? addendumFlag && launch.preregistration_addendum_sha256 === addendumIdentity.sha256 : !addendumFlag),
    'stage 3 preregistration addendum identity or launch differs');
    requireThat(hash(read(stage3AddendumFile)) === addendumIdentity.sha256, 'stage 3 preregistration addendum copy differs');
  }

  function identityChecks(identity, identityId) {
    const expected = real ? { dev: stage3DevTasks, manifestSha256: stage2bManifestSha, split: 'dev' } : { ...stage3Fixtures.corpus(), split: 'synthetic' };
    const { dataset } = identity;
    requireThat(['stage3-dev-v1', stage3AddendumIdentityVersion].includes(identity.version)
      && [1, 2].includes(identity.edition) && String(identity.edition) === (launch.edition ?? '1')
      && identityId === hash({ mode, scenario, identity }) && identity.preregistrationSha256 === methodSha
      && dataset.split === expected.split && dataset.manifestSha256 === expected.manifestSha256 && same(dataset.dev, expected.dev)
      && same(identity.planned, stage3Plan(expected.dev)) && same(identity.limits, limits) && same(identity.stop, stage3Stop())
      && identity.rounds === rounds && identity.concurrency === stage3Concurrency && identity.singleAgencyDecision === true
      && same(identity.observerPolicy, observerPolicy) && same(identity.auditPolicy, agencyAudit.policy) && identity.auditProxySource === (real ? stage3ProxySource : null)
      && identity.ruler === workingJudge.ruler && identity.judgeOutputContract === workingJudge.judgeOutputContract
      && identity.judgePolicy === workingJudge.judgePolicy && identity.judgeFingerprint === workingJudgeFingerprint(identity.sources)
      && same(identity.judgeCallPolicy, workingJudge.policy) && same(identity.judgeTransport, real ? workingJudge.judgeTransport : null)
      && same(identity.routes, real ? { ...routes, judge: workingJudge.routes.judge, teacher_observer: observerRoute, agency_audit: agencyAudit.route } : 'pi-ai-faux'),
    'stage 3 identity, scorer or development plan differs');
    checkAddendum(identity);
  }
  requireThat(['offline', 'real'].includes(mode) && sameRun(evaluation) && launch.scenario === scenario && !flags.includes('--resume'), 'invalid stage 3 launch');
  if (real) requireThat(start.clean && launch.concurrency === String(stage3Concurrency) && flags.includes('--proxy-from-env')
    && launch.preregistration_sha256 === methodSha && Number(launch.max_attempts) === limits.maxAttempts
    && Number(launch.max_requested_output_tokens) === limits.maxRequestedOutputTokens, 'unregistered stage 3 real launch');
  if (estimateOnly) {
    const estimate = json('estimate.json');
    identityChecks(estimate.identity, estimate.identityId);
    requireThat(real && !flags.includes('--confirm-cost') && requests.length === 0 && receipt.exitCode === 0 && receipt.acceptance === null
      && estimate.requestCount === 0 && estimate.acceptance === null && sameRun(estimate) && same(estimate.writer, { pid, startedAt })
      && checkPass(estimate.checkReceipt, head) && same(estimate.limits, limits) && same(estimate.budget, budget)
      && estimate.plannedCells === estimate.identity.planned.length && Object.keys(evaluation.files).length === checked.size, 'stage 3 estimate evidence differs');
    const { preregistrationAddendum } = estimate.identity;
    return { pid, identityId: estimate.identityId, estimate: true, ...(preregistrationAddendum && { preregistrationAddendum }) };
  }

  const manifest = json('manifest.json'), result = json('result.json');
  const { identity, identityId, planned } = manifest;
  identityChecks(identity, identityId);
  requireThat(sameRun(manifest) && sameRun(result) && same(manifest.writer, { pid, startedAt }) && same(manifest.planned, identity.planned)
    && same(manifest.budget, budget) && same(manifest.limits, limits) && hash(read('preregistration.md')) === methodSha,
  'stage 3 result or manifest differs');
  if (real) requireThat(flags.includes('--confirm-cost') && checkPass(manifest.checkReceipt, head) && manifest.estimateReceipt?.head === head
    && manifest.estimateReceipt.identityId === identityId && manifest.estimateReceipt.requestCount === 0, 'stage 3 real run lacks bound preflight evidence');
  const map = json('blind-map.json'), audited = json('blind-verdicts.json');
  const byFolder = new Map(planned.map(row => [row.folder, row]));
  const auditFolders = new Set(map.map(row => {
    requireThat(exact(row, ['id', 'folder']) && uuid.test(row.id) && byFolder.has(row.folder), 'invalid stage 3 blind coordinate');
    return `audit/${row.id}`;
  }));
  requireThat(auditFolders.size === map.length && new Set(map.map(x => x.folder)).size === map.length
    && audited.length === map.length && audited.every((x, i) => x.id === map[i].id), 'blind map and decisions differ');
  const ledger = stage3Ledger(limits), log = read('admission.jsonl').toString('utf8');
  requireThat(log.endsWith('\n'), 'stage 3 admission is truncated');
  for (const line of log.trimEnd().split('\n')) {
    const event = JSON.parse(line), { coordinates } = event;
    const folder = coordinates?.folder ?? event.folder ?? ledger.attempts.get(event.callId)?.coordinates.folder;
    const arm = byFolder.get(folder)?.arm;
    requireThat(arm || auditFolders.has(folder), 'unplanned stage 3 request');
    if (coordinates) {
      const allowed = arm === 'baseline' ? ['teacher', 'learner', 'judge'] : arm === 'candidate' ? ['teacher', 'learner', 'judge', 'teacher_observer']
        : arm === 'rhetoric' ? ['judge', 'agency_audit'] : ['agency_audit'];
      requireThat(allowed.includes(coordinates.role), `invalid role for ${folder}`);
    }
    requireThat(event.type !== 'cell' || arm, 'blind work cannot settle a teaching cell');
    ledger.apply(event);
  }
  const { used, stop, failedCells, peakInFlight, downshifts, inFlight } = ledger.snapshot();
  const sends = requests.filter(x => x.type === 'request_start');
  requireThat(inFlight === 0 && same(ledger.sent, sends.map(x => x.callId)) && sends.every(x => x.requestId === `${x.callId}:1`)
    && (real || sends.length === 0) && same(used, result.used) && same(stop, result.stop) && failedCells === result.failedCells
    && peakInFlight === result.peakInFlight && same(downshifts, result.downshifts), 'stage 3 admission, request log or budget differs');
  const byAttempt = Map.groupBy(ledger.attempts, ([, event]) => event.coordinates.folder);
  const usage = {};
  let checkedAttempts = 0;
  function calls(folder, required) {
    const recorded = byAttempt.get(folder) ?? [];
    if (!required) { requireThat(!recorded.length, `unexpected attempts for ${folder}`); return []; }
    const meters = json(`${folder}/telemetry.json`);
    requireThat(meters.length === recorded.length, `attempt count differs for ${folder}`);
    return recorded.map(([callId, event], i) => {
      const { coordinates, sent, settled, failureKind, rateLimited, limit } = event;
      const attemptPath = stage3CallPath(coordinates), raw = json(attemptPath), meter = meters[i];
      requireThat(settled && callId === stage3CallId(coordinates) && meter.failureKind === failureKind && meter.requestLimit <= limit
        && Number.isSafeInteger(meter.requestLimit) && meter.requestLimit > 0 && (!real || sent || failureKind)
        && [raw, meter].every(x => x.callId === callId && x.pid === pid && x.processIndex === 1 && x.attemptPath === attemptPath && x.sent === sent
          && x.rateLimited === rateLimited && ['role', 'call', 'turn', 'attempt'].every(key => x[key] === coordinates[key])), `stage 3 attempt or PID differs: ${callId}`);
      if (sent) {
        const counter = usage[meter.role] ??= { requests: 0, requestedOutputTokens: 0, reportedTotal: 0, missingTotal: 0 };
        counter.requests++;
        counter.requestedOutputTokens += meter.requestLimit;
        if (meter.usage?.totalTokens == null) counter.missingTotal++;
        else counter.reportedTotal += meter.usage.totalTokens;
      }
      checkedAttempts++;
      return { raw, meter };
    });
  }

  function replayAudit(attempt, window, exposure) {
    if (!attempt) return null;
    const { raw, meter } = attempt;
    requireThat(theWindow(raw, exposure ? exposurePrompt : auditPrompt, window) && !raw.binding && !meter.binding, 'audit request was not blinded or evidence differs');
    requireThat(!real || [raw, meter].every(x => x.proxied === true && x.proxySource === stage3ProxySource), 'audit lacks pinned proxy');
    if (meter.failureKind) return null;
    requireThat(!real || raw.outbound?.model === agencyAudit.route.id && same(raw.outbound?.provider, agencyAudit.route.routing)
      && same(raw.outbound.reasoning, agencyAudit.policy.reasoning) && raw.outbound.response_format?.json_schema?.strict === true
      && meter.requestLimit === agencyAudit.policy.maxTokens, 'audit request pin or schema differs');
    return (exposure ? parseExposure : parseAgencyAudit)(responseText(raw), window);
  }

  requireThat(result.cells.length === planned.length, 'stage 3 result plan incomplete');
  const projected = new Map();
  for (const row of [...planned.filter(x => x.arm !== 'rhetoric'), ...planned.filter(x => x.arm === 'rhetoric')]) {
    const { folder, arm, taskId, student } = row;
    const status = ledger.completions.get(folder) ?? 'not_started';
    const attempted = calls(folder, status !== 'not_started');
    const cell = { ...row, status };
    projected.set(folder, cell);
    if (status === 'not_started') continue;
    const messages = cell.messages = json(`${folder}/transcript.json`);
    requireThat(Array.isArray(messages) && messages.length <= 9 && (status !== 'scored' || messages.length === 9), 'unexpected stage 3 message count');
    messages.forEach((m, i) => requireThat(same(m, message(`${id}:${folder.replaceAll('/', ':')}:m:${i + 1}`, i % 2 ? 'teacher' : 'learner', Math.ceil(i / 2), m.text)), 'invalid stage 3 message chronology'));
    if (arm === 'rhetoric') {
      const baseline = projected.get(stage3Folder('baseline', taskId, student));
      const control = json(`${folder}/control.json`);
      const verified = replayAudit(attempted.find(x => x.meter.role === 'agency_audit'), auditWindow(baseline.messages), true);
      requireThat(same(messages, rhetoricTranscript(id, folder, baseline.messages)) && control.baselineSha256 === evaluation.files[`${baseline.folder}/transcript.json`]
        && same(control.exposure, verified ?? { specified: 'uncertain', evidence: null }), 'stage 3 control differs from its source');
      cell.exposure = control.exposure;
    } else {
      cell.teacherEvents = json(`${folder}/teacher-events.json`);
      checkDialogue(identity, cell, attempted);
    }
    const judgeManifest = judgementManifest(manifest, folder), parts = {}, dimensions = {};
    for (const { raw, meter } of attempted.filter(x => x.meter.role === 'judge')) {
      const accepted = replaySplitJudge(judgeManifest, folder, messages, meter, raw);
      if (!accepted) continue;
      const dimension = splitDimensions[meter.call - 1];
      requireThat(!parts[dimension], 'duplicate stage 3 judgement');
      parts[dimension] = accepted.verdict;
      dimensions[dimension] = accepted.binding;
    }
    if (status === 'scored') {
      const assembled = assembleBinaryVerdict(parts, identity.ruler);
      const binding = { ...splitBinding(judgeManifest, folder, bindBinary(messages)), dimensions };
      requireThat(assembled.verdict && same(json(`${folder}/judge.json`), { binding, verdict: assembled.verdict }), 'stage 3 judgement replay differs');
      cell.verdict = assembled.verdict;
    }
  }
  const cells = planned.map(row => projected.get(row.folder));
  requireThat(cells.every(({ status, ...cell }, i) => {
    const { failure, ...saved } = result.cells[i];
    return same(saved, { ...planned[i], status }) && (['failed', 'paused'].includes(status) ? Boolean(failure?.kind) : failure === undefined);
  }), 'stage 3 result does not match settled cells');
  requireThat(same(map.map(x => x.folder).sort(), blindSelection(cells).sort()), 'stage 3 audit selection differs');
  const audits = map.map(({ id, folder }, i) => {
    const saved = audited[i], attempts = calls(`audit/${id}`, saved.status !== 'not_started');
    const verdict = replayAudit(attempts[0], auditWindow(projected.get(folder).messages), false);
    requireThat(attempts.length <= 1 && same(saved.verdict ?? null, verdict), 'blind verdict does not replay');
    return { folder, verdict: verdict ?? undefined };
  });
  const report = json('report.json');
  requireThat(same(report, { ...assessStage3(cells, audits, identity.preregistrationAddendum?.exposureGateStudents),
    blindVerdictsSha256: evaluation.files['blind-verdicts.json'], examples: tutorExamples(cells) }),
    'stage 3 report does not follow locked decision rule');
  requireThat(checked.size === Object.keys(evaluation.files).length && checkedAttempts === ledger.attempts.size, 'unbound stage 3 artifacts or attempts');
  const scored = cells.filter(row => row.status === 'scored').length;
  const complete = !stop && scored === planned.length && audits.every(x => x.verdict);
  requireThat(result.acceptance === complete && result.adoptionEligible === false && result.decision === report.decision
    && receipt.acceptance === complete && receipt.exitCode === (complete ? 0 : 1), 'stage 3 acceptance or exit differs');
  return { pid, identityId, planned: planned.length, scored, decision: report.decision, used, peakInFlight, stop, usage, audits: audits.filter(x => x.verdict).length };
}

function checkDialogue(identity, cell, attempted) {
  const { messages, teacherEvents, arm, taskId, student, status } = cell;
  const { edition } = identity;
  if (messages.length) requireThat(hash(messages[0].text) === identity.dataset.openings[taskId], 'stage 3 opening differs');
  const outputs = new Map(), views = new Map();
  for (const { raw, meter } of attempted) {
    const { role, turn, failureKind } = meter;
    if (role === 'teacher_observer') {
      const window = observationWindow(messages.slice(0, 2 * turn - 1));
      requireThat(theWindow(raw, observationPromptFor(edition), window) && !views.has(turn), 'stage 3 observer window or call count differs');
      views.set(turn, { window, value: failureKind ? emptyObservation(edition) : validateObservation(JSON.parse(responseText(raw)), window, edition), failureKind });
    } else if (!failureKind && role === 'learner') {
      const window = messages.slice(0, 2 * turn).map(({ role, text }) => ({ role, text }));
      const metadata = { allowBoundedCleanup: student !== 'default' };
      requireThat(same(JSON.parse(raw.context.messages.at(-1).content), window), 'stage 3 learner window differs');
      outputs.set(2 * turn, parseLearner(responseText(raw), raw.response, undefined, metadata).text);
    }
  }
  const decisions = teacherEvents.filter(event => event.kind === 'stateDecision');
  const decisionsByTurn = new Map(decisions.map(event => [event.turn, event]));
  requireThat(decisionsByTurn.size === decisions.length, 'duplicate stage 3 state decision');
  if (arm === 'baseline') requireThat(decisions.length === 0, 'baseline cannot use the state gate');
  if (status === 'scored' && arm === 'candidate') requireThat(decisions.length === 4 && views.size === 4, 'candidate lacks four state decisions');
  let pending = initialPending(edition);
  for (const { turn, kind, call, phase, ...observed } of decisions) {
    const view = views.get(turn);
    requireThat(view && call === 0 && phase === 'diagnose', 'unbound teacher state decision');
    const expected = decideStudentAction(view.value, view.window, pending, edition);
    if (view.failureKind) expected.fallback = view.failureKind;
    requireThat(same(observed, expected), 'teacher state decision does not replay');
    ({ pending } = expected);
  }
  const fallbacks = new Map();
  for (const event of teacherEvents.filter(e => e.kind === 'handoffFallback')) {
    requireThat(!fallbacks.has(event.turn), 'duplicate handoff fallback');
    fallbacks.set(event.turn, event);
  }
  for (const [turn, rows] of Map.groupBy(attempted.filter(x => x.meter.role === 'teacher'), x => x.meter.turn)) {
    const action = arm === 'candidate' ? decisionsByTurn.get(turn)?.action : undefined;
    if (usesHandoffContract(edition, action)) {
      outputs.set(2 * turn - 1, replayHandoff(rows, turn, fallbacks.get(turn)));
      fallbacks.delete(turn);
      continue;
    }
    const expected = arm === 'candidate' ? [teacherActionGoal(edition, action)] : linearGoals.slice(0, turn);
    for (const { raw, meter } of rows) {
      const goals = raw.context.messages.filter(m => m.role === 'system' && Object.hasOwn(m.sections ?? {}, 'goal')).map(m => m.sections.goal);
      requireThat((arm !== 'candidate' || expected[0]) && same(goals, expected), `teacher goal does not match ${arm} turn ${turn}`);
      if (!meter.failureKind && raw.response.stopReason === 'stop') outputs.set(2 * turn - 1, publicReply(responseText(raw)));
    }
  }
  requireThat(fallbacks.size === 0 && messages.slice(1).every((m, i) => m.text === outputs.get(i + 1)), 'stage 3 public dialogue does not replay');
}

function replayHandoff(rows, turn, fallback) {
  const limit = policy.teacher.requestsPerTurn;
  let retry = false, nextCall = true, reply;
  requireThat(rows.length <= limit, 'handoff exceeds teacher call slots');
  for (const [i, { raw, meter }] of rows.entries()) {
    requireThat(nextCall && meter.call === i + 1 && meter.attempt === 1, 'invalid handoff regeneration sequence');
    const system = raw.context.messages.filter(m => m.role === 'system').map(({ content, sections }) => ({ content, sections }));
    requireThat(!raw.context.systemPrompt && same(system, handoffSystemView(retry)), 'handoff system prompt differs from its isolated contract');
    if (!meter.failureKind) {
      reply = validateHandoffResponse(responseText(raw), raw.response, meter.call < limit);
      nextCall = reply === undefined;
    } else {
      if (meter.failureKind === 'teacher_generation_contract') {
        let rejected = false;
        try { validateHandoffResponse(responseText(raw), raw.response, meter.call < limit); }
        catch { rejected = true; }
        requireThat(rejected, 'handoff reply was incorrectly rejected');
      }
      retry = nextCall = handoffRejection(meter.failureKind);
    }
  }
  const { failureKind } = rows.at(-1).meter;
  const expected = rows.length === limit && handoffRejection(failureKind)
    ? { kind: 'handoffFallback', turn, call: limit, phase: 'diagnose', action: 'diagnose', failureKind } : undefined;
  requireThat(same(expected, fallback), 'handoff fallback does not match exhausted generation');
  return expected ? handoffFallbackReply : reply;
}
