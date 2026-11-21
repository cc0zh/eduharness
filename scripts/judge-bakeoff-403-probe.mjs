import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { make403Probe, probeMaxTokens, probeSteps } from '../config/judge-bakeoff-probe.mjs';
import { splitJudgeCandidates } from '../config/judge-bakeoff.mjs';
import { checkout, checkSnapshot, requireCheckReceipt } from '../src/real-preflight.mjs';
import { Models } from '../src/models.mjs';
import { loadCredentials } from '../src/real-preflight.mjs';
import { MAX_PROVIDER_DIAGNOSTIC_BODY_BYTES } from '../src/provider-response-diagnostics.mjs';

export const defaultProbePlanPath = join(checkout, '.tmp', 'scratch', 'judge-bakeoff', '403-probe.md');
export const maxProbeRequests = 12;
export const maxProbeOutputTokens = maxProbeRequests * probeMaxTokens;

export function makeProbePlan({ head, checkReceiptSha256, sources }) {
  const candidates = Object.fromEntries(['haiku', 'gemini'].map(key => [key, {
    model: splitJudgeCandidates[key].route.id,
    steps: probeSteps.map(step => {
      const probe = make403Probe(key, step);
      return {
        step,
        providerPin: probe.route.routing.only?.[0] ?? null,
        routing: probe.route.routing,
        responseFormat: probe.route.responseFormat,
        maxTokensField: probe.route.maxTokensField,
        maxTokens: probe.policy.judge.maxTokens,
        reasoning: probe.policy.judge.reasoning ?? null,
        temperature: probe.route.temperature,
        maxAttempts: probe.policy.maxAttemptsPerCall,
      };
    }),
  }]));
  return {
    version: 'round2-403-probe-v1',
    head,
    checkReceiptSha256,
    sources,
    requestShape: { prompt: 'Reply with the JSON object {"ok":true}.', singleSentence: true, noDialogueOrDataset: true },
    success: 'One request returns HTTP success and a locally valid {"ok":true} JSON object.',
    sequence: probeSteps,
    candidates,
    limits: {
      maxRequests: maxProbeRequests,
      maxTokensPerRequest: probeMaxTokens,
      maxResponseBodyBytes: MAX_PROVIDER_DIAGNOSTIC_BODY_BYTES,
      maxRequestedOutputTokens: maxProbeOutputTokens,
      maxAttemptsPerStep: 1,
      maxRequestsPerCandidate: probeSteps.length,
      plannedRequests: 2 * probeSteps.length,
      plannedOutputTokens: 2 * probeSteps.length * probeMaxTokens,
    },
    caveat: 'Haiku low adaptive thinking may have a 1024-token minimum above this 64-token response cap. Keep the cap; treat an error as inconclusive for any later stage, do not raise the limit.',
  };
}

export function renderProbePlan(plan) {
  return `# ①h HTTP 403 极小探针预登记

本计划只向 Haiku 5.5 / Anthropic 和 Gemini 3.8 Flash / Google AI Studio 发起无关的一句 JSON 状态探针。每阶段最多一次初次尝试，无 SDK 重试；每模型按 A、B、C、D 顺序，首次成功即停止该模型。所有生成请求经 \`src/models.mjs\`。

最高上限为 **12 次请求**，每次输出最多 **64 tokens**，总预留输出上限 **${maxProbeOutputTokens} tokens**。本序列最多 8 次、512 tokens。OpenRouter metadata 已检查但不发生成请求。没有训练、sealed 或 holdout 内容。响应正文及允许的诊断头脱敏后保存到 .tmp/scratch/judge-bakeoff/403-probe/<run-id>/。

| 步骤 | 参数变化 |
| --- | --- |
| A | 固定候选端点，使用 require_parameters:true 与 strict JSON Schema；保持 bakeoff 推理和温度，仅用无关提示与 64-token 上限 |
| B | A 的基础上，只将 max_completion_tokens 字段改为 max_tokens |
| C | B 的基础上，再去掉 JSON Schema 与 require_parameters，保留固定 provider |
| D | C 的基础上，再去掉 provider.only/order，由 OpenRouter 为同一模型选择 provider；禁用模型 fallback |

签名字段与身份来源见机器计划。任何 source、HEAD、check receipt 或 SHA 不一致都拒绝启动。Haiku 的 low effort 在 64-token 上限下可能与 Anthropic/OpenRouter 推理预算最低值冲突；这不是改上限的授权。

## 机器计划

\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`
`;
}

export const probeSourceFiles = ['package-lock.json', 'config/e1.mjs', 'config/judge-bakeoff.mjs', 'config/judge-bakeoff-probe.mjs',
  'config/judge-contrast.mjs', 'config/judge-reasoning-off.mjs',
  'contracts/core/schema.mjs', 'src/judge-transport.mjs', 'src/provider-response-diagnostics.mjs', 'src/run-receipts.mjs',
  'src/models.mjs', 'src/real-preflight.mjs',
  'scripts/judge-bakeoff-403-probe.mjs'];

export function currentProbePlan() {
  const snapshot = checkSnapshot(checkout);
  requireThat(snapshot.clean, '403 probe requires a clean checkout');
  const checkReceipt = requireCheckReceipt(checkout);
  const checkReceiptSha256 = hash(readFileSync(join(checkout, 'runs', '_receipts', `check-${snapshot.head}.json`)));
  const sources = Object.fromEntries(probeSourceFiles.map(file => [file, hash(readFileSync(join(checkout, file)))]));
  return makeProbePlan({ head: snapshot.head, checkReceiptSha256, sources });
}

export function writeProbePlan(path = defaultProbePlanPath) {
  path = resolve(path);
  const bytes = Buffer.from(renderProbePlan(currentProbePlan()));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: 'wx' });
  return { path, sha256: hash(bytes), plan: JSON.parse(/```json\n([\s\S]*?)\n```/.exec(bytes.toString('utf8'))[1]) };
}

export function verifyProbeRegistration(registeredBytes, registeredSha256, currentBytes) {
  requireThat(hash(registeredBytes) === registeredSha256, '403 probe plan SHA256 mismatch');
  requireThat(registeredBytes.equals(currentBytes), '403 probe plan, source hashes, HEAD or check receipt changed');
  const match = /^```json\r?\n([\s\S]*?)\r?\n```/m.exec(registeredBytes.toString('utf8'));
  requireThat(match, '403 probe plan has no machine JSON');
  return JSON.parse(match[1]);
}

const outputSchema = Type.Object({ ok: Type.Boolean() }, { additionalProperties: false });

function parseProbeResponse(text) {
  const value = JSON.parse(text);
  requireThat(Value.Check(outputSchema, value) && value.ok === true, 'invalid probe response JSON');
  return value;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

export async function runProbeCandidate({ candidateKey, root, plan, planSha256, confirmCost }) {
  requireThat(confirmCost === true, 'send probe generation requests only with --confirm-cost');
  const registeredBytes = Buffer.from(renderProbePlan(plan));
  requireThat(hash(registeredBytes) === planSha256, '403 probe plan SHA256 mismatch');
  const currentBytes = Buffer.from(renderProbePlan(currentProbePlan()));
  requireThat(registeredBytes.equals(currentBytes), '403 probe plan, source hashes, HEAD or check receipt changed');
  requireThat(['haiku', 'gemini'].includes(candidateKey), 'unknown 403 probe candidate');
  const candidate = plan.candidates[candidateKey];
  requireThat(candidate && candidate.steps.length === probeSteps.length
    && candidate.steps.every((step, index) => step.step === probeSteps[index]
      && step.maxTokens === plan.limits.maxTokensPerRequest && step.maxAttempts === plan.limits.maxAttemptsPerStep)
    && plan.limits.maxRequests <= maxProbeRequests
    && plan.limits.maxTokensPerRequest === probeMaxTokens
    && plan.limits.maxRequestedOutputTokens <= maxProbeOutputTokens
    && plan.limits.maxRequestsPerCandidate === probeSteps.length,
  '403 probe steps or output limits differ from the plan');
  const runId = `403-probe-${candidateKey}-01`;
  const runDir = join(resolve(root), runId);
  mkdirSync(runDir, { recursive: true });
  mkdirSync(join(runDir, 'attempts'));
  const requestLog = join(runDir, 'requests.jsonl');
  const result = { runId, candidate: candidateKey, model: candidate.model, head: plan.head, planSha256, pid: process.pid,
    maxTokensPerRequest: plan.limits.maxTokensPerRequest, requestCount: 0, reservedAttempts: 0,
    requestedOutputTokens: 0, steps: [], selectedStep: null };
  writeJson(join(runDir, 'result.json'), result);
  loadCredentials(['judge']);

  for (const step of probeSteps) {
    requireThat(result.requestCount < plan.limits.maxRequests && result.steps.length < plan.limits.maxRequestsPerCandidate,
      '403 probe hard request limit reached');
    const settings = make403Probe(candidateKey, step);
    const callCell = `${runId}/${step}`;
    let saved;
    const requestEvents = [];
    const recorder = { append(event) {
      requestEvents.push(event);
      appendFileSync(requestLog, `${JSON.stringify(event)}\n`, 'utf8');
    } };
    const reserve = (_where, limit) => {
      requireThat(result.requestCount < plan.limits.maxRequests
        && result.reservedAttempts < plan.limits.maxRequestsPerCandidate, '403 probe request limit reached');
      requireThat(limit === plan.limits.maxTokensPerRequest && limit <= plan.limits.maxTokensPerRequest,
        '403 probe per-request output limit differs from plan');
      requireThat(result.requestedOutputTokens + limit <= plan.limits.maxRequestedOutputTokens,
        '403 probe requested-output limit reached');
      result.reservedAttempts++;
      result.requestedOutputTokens += limit;
    };
    const models = new Models({ mode: 'real', roles: ['judge'], judgePolicy: candidateKey, judgeProbeStep: step, cell: callCell, reserve,
      recorder, save(raw, meter) {
        const attemptPath = `attempts/${step}.json`;
        const attempt = { raw, meter: { ...meter, attemptPath }, pid: process.pid };
        writeJson(join(runDir, attemptPath), attempt);
        saved = attempt;
        return attemptPath;
      } });
    const context = { systemPrompt: '', messages: [{ role: 'user', timestamp: Date.now(), content: plan.requestShape.prompt }] };
    const schema = settings.route.responseFormat === 'json_schema' ? outputSchema : undefined;
    let success = false, failure = null;
    try {
      const answer = await models.complete({ role: 'judge', turn: 1, call: 1,
        binding: { probeId: runId, candidate: candidateKey, step, planSha256, head: plan.head } }, context, parseProbeResponse, schema);
      success = answer.value.ok === true;
    } catch (error) {
      failure = { kind: error.failure?.kind ?? 'probe_failure', detail: error.failure?.detail ?? 'probe failed' };
    }
    result.requestCount += requestEvents.filter(event => event.type === 'request_start').length;
    const stepResult = { step, success, attemptPath: saved?.meter.attemptPath ?? null,
      httpStatus: saved?.meter.httpStatus ?? null, failureKind: saved?.meter.failureKind ?? null,
      detail: saved?.meter.detail ?? null, reportedProvider: saved?.meter.reportedProvider ?? null,
      reportedModel: saved?.meter.reportedModel ?? null, providerResponse: saved?.raw.providerResponse ?? null,
      outbound: saved?.raw.outbound ?? null, ...(failure && { failure }) };
    result.steps.push(stepResult);
    if (success) result.selectedStep = step;
    writeFileSync(join(runDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    if (success) break;
  }
  return { ...result, runDir, success: result.selectedStep !== null };
}

async function main() {
  const { values } = parseArgs({ options: {
    'write-plan': { type: 'boolean' }, candidate: { type: 'string' }, plan: { type: 'string' }, 'plan-sha256': { type: 'string' },
    'confirm-cost': { type: 'boolean' },
  } });
  if (values['write-plan']) {
    console.log(JSON.stringify(writeProbePlan(values.plan ?? defaultProbePlanPath)));
    return;
  }
  requireThat(values['confirm-cost'] === true, 'send probe generation requests only with --confirm-cost');
  requireThat(['haiku', 'gemini'].includes(values.candidate), 'supply --candidate haiku or gemini');
  requireThat(typeof values['plan-sha256'] === 'string', 'supply the pre-registered --plan-sha256');
  const planPath = resolve(values.plan ?? defaultProbePlanPath);
  const registeredBytes = readFileSync(planPath);
  const currentBytes = Buffer.from(renderProbePlan(currentProbePlan()));
  const plan = verifyProbeRegistration(registeredBytes, values['plan-sha256'], currentBytes);
  const result = await runProbeCandidate({ candidateKey: values.candidate, root: join(dirname(planPath), '403-probe'), plan,
    planSha256: values['plan-sha256'], confirmCost: values['confirm-cost'] });
  console.log(JSON.stringify(result));
  if (!result.success) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
