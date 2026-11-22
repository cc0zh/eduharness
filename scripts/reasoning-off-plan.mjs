import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { routes } from '../config/e1.mjs';
import { reasoningOffPolicy } from '../config/judge-reasoning-off.mjs';
import { hash } from '../contracts/core/schema.mjs';
import { binaryIdentityVersion, binaryOutputContract, binaryRuler, bindBinary } from '../contracts/judge/binary.mjs';
import { checkout } from '../src/real-preflight.mjs';
import { evaluationIdentity, frozenDialogue, source } from '../src/run.mjs';
import { constructExpectations, s1Path, s1Plan, s1SourceId } from '../src/s1-binary-plan.mjs';
import { adoption, unchangedQuestions } from './reasoning-off-report.mjs';

export const scenario = 'round2-reasoning-off';
export const registeredId = `${scenario}-01`;
export const defaultRoot = join(checkout, 'runs');
export const defaultRegistration = join(checkout, '.tmp', 'scratch', 'reasoning-off', 'preregistration.md');
export const retriesPerKind = reasoningOffPolicy.retries;
const rubric = ['contracts/judge/binary.mjs', 'src/binary-judge.mjs'];
const sourceFiles = [...rubric, 'config/judge-reasoning-off.mjs', 'config/e2.mjs', 'src/s1-binary-plan.mjs',
  'scripts/s1-binary-report.mjs', 'scripts/reasoning-off-plan.mjs', 'scripts/reasoning-off.mjs', 'scripts/reasoning-off-report.mjs'];
const timeoutIds = ['A2-assigned-multiplier', 'R0-still-learner-origin', 'R1-student-score-cards'];
const typicalCalls = s1Plan.length + timeoutIds.length;
const maxAttempts = typicalCalls + 8;
export const limits = { maxAttempts, maxRequestedOutputTokens: maxAttempts * reasoningOffPolicy.judge.maxTokens };
export const concurrency = 1;

export function readLocked(path, sha256) {
  const bytes = readFileSync(path);
  assert.equal(hash(bytes), sha256, `digest mismatch: ${path}`);
  return bytes;
}

const lockedJSON = (path, sha256) => JSON.parse(readLocked(path, sha256));

function archive(id, receiptSha256, processSha256) {
  const path = file => join(defaultRoot, id, file);
  const ledger = suffix => join(defaultRoot, '_receipts', `${id}${suffix}.json`);
  const receipt = lockedJSON(ledger(''), receiptSha256);
  const processReceipt = lockedJSON(ledger('.process'), processSha256);
  const manifest = lockedJSON(path('manifest.json'), receipt.manifestSha256);
  assert.equal(processReceipt.evaluationSha256, receiptSha256);
  assert.equal(manifest.identityId, receipt.identityId);
  assert.equal(manifest.mode, 'real');
  assert.equal(manifest.writer.pid, processReceipt.pid);
  const registration = readLocked(path('preregistration.md'), receipt.preregistrationSha256).toString('utf8');
  const provenance = { runId: id, receiptSha256, processSha256, identityId: manifest.identityId, manifestSha256: receipt.manifestSha256 };
  return { id, path, manifest, receipt, registration, provenance, pid: processReceipt.pid };
}

function firstAttempt(run, artifact, folder) {
  const [meter] = lockedJSON(run.path(`${folder}/telemetry.json`), artifact.telemetrySha256);
  assert(meter?.attempt === 1 && meter.pid === run.pid && Number.isSafeInteger(meter.elapsedMs), `invalid historical timing at ${folder}`);
  return { elapsedMs: meter.elapsedMs, failureKind: meter.failureKind, detail: meter.detail };
}

export function prepareContrast() {
  const priorS1 = archive('s1-binary-round2-01', '7c3e3a27188f306eb93554fb5440afb70284cc4d474630c7c8d95c82128d5cc0',
    '8132757c2ea0cddf3748a23a156f166261b82ea85941c53c3478c894cbce0366');
  const priorTimeout = archive('round2-timeout-v2-01', '5b5841ff51652a2bffa5fe65ec7ec8a13e8372bd18bf2fdadb707ba4c1804cf6',
    '5ffdd7283a493a8418aeb8c1fd15ba94846f68d28866e45c7eb8555c8550875e');
  assert(priorS1.receipt.acceptance && priorS1.manifest.identity.ruler === 'e1-binary-v1' && priorS1.manifest.source.runId === s1SourceId);
  assert.equal(priorTimeout.manifest.identity.ruler, binaryRuler);
  for (const path of rubric) assert.equal(hash(source(path)), priorTimeout.manifest.identity.sources[path], `v2 prompt or ruler changed: ${path}`);

  const queue = [], inputs = new Map(), history = { s1: [], timeouts: [] };
  for (const coordinate of s1Plan) {
    const id = s1Path(coordinate), { condition } = coordinate;
    const source = frozenDialogue(defaultRoot, s1SourceId, 'E2', condition, true);
    const { bytes, messages, provenance } = source;
    const artifact = priorS1.receipt.cells.find(cell => s1Path(cell) === id);
    assert.equal(provenance.transcriptSha256, artifact.transcriptSha256);
    readLocked(priorS1.path(`${id}/transcript.json`), artifact.transcriptSha256);
    const judge = lockedJSON(priorS1.path(`${id}/judge.json`), artifact.judgeSha256);
    assert.deepEqual(judge.binding.messageIds, messages.map(message => message.id));
    history.s1.push({ id, answers: judge.verdict.answers, ...firstAttempt(priorS1, artifact, id) });
    queue.push({ id, ...coordinate, sourceRunId: s1SourceId, archive: `${s1SourceId}/${condition}`, transcriptSha256: provenance.transcriptSha256 });
    inputs.set(id, { bytes, messages });
  }
  let prompt;
  for (const id of timeoutIds) {
    const [first, second] = [1, 2].map(repeat => {
      const index = priorTimeout.manifest.planned.find(cell => cell.id === `${id}-r${repeat}`);
      assert(index?.purpose === 'historical-timeout' && index.input === id);
      const row = priorTimeout.receipt.cells.find(cell => cell.id === index.id);
      history.timeouts.push({ id: index.id, ...firstAttempt(priorTimeout, row, index.id) });
      const bytes = readLocked(priorTimeout.path(`${index.id}/transcript.json`), index.sha256);
      const raw = lockedJSON(priorTimeout.path(row.attempts[0].path), row.attempts[0].sha256);
      prompt ??= raw.context.systemPrompt;
      assert.equal(raw.context.systemPrompt, prompt);
      return { index, bytes };
    });
    assert.equal(first.index.sha256, second.index.sha256);
    const bytes = first.bytes, messages = JSON.parse(bytes);
    bindBinary(messages);
    queue.push({ id, sourceRunId: first.index.fromRun, archive: `${priorTimeout.id}/${first.index.id}`, transcriptSha256: first.index.sha256 });
    inputs.set(id, { bytes, messages });
  }
  assert.equal(queue.length, 18);
  const prior = [priorS1.provenance, priorTimeout.provenance];
  const { sources } = evaluationIdentity({ mode: 'real', sources: sourceFiles });
  const table = priorS1.registration.split('## 构造预期答案\n')[1].split('\n## ')[0].trim();
  const plan = { runId: registeredId, ruler: binaryRuler, policyVersion: reasoningOffPolicy.version, typicalCalls, concurrency, limits, retriesPerKind,
    timeoutMs: reasoningOffPolicy.judge.timeoutMs, adoption, unchangedQuestions, prior, sources, queue };
  const markdown = `# 第二轮 ①d 关推理小对照预登记

登记 run ID \`${registeredId}\`。一个 Node 进程，格级并发 ${concurrency}，按清单串行。只评冻结 S1 五格三遍和 ①b 预先记录的三份超时输入各一遍。超时输入的字节取自 ①c 对同一输入的第一遍归档；不打开训练标签、测试集或留出题。

尺子 \`${binaryRuler}\`，题面和裁判提示不改。沿用 OpenRouter \`${routes.judge.id}\` 和 strict JSON Schema，仅将出站 \`reasoning\` 改为 \`{ "enabled": false }\`。选用直接的布尔开关，而不是用 effort 档位代表禁用。[OpenRouter 推理文档](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)说明该开关；[端点元数据](https://openrouter.ai/api/v1/models/tencent/hy4-flash/endpoints)列出 reasoning 支持，不保证下游执行。实报缺失不补零。

常规 ${typicalCalls} 次，每次最多 ${reasoningOffPolicy.judge.maxTokens} 请求输出 token，本地截止 ${plan.timeoutMs / 1000} 秒。全批硬上限 ${limits.maxAttempts} 次尝试和 ${limits.maxRequestedOutputTokens} 请求输出 token，含最多 8 次额外尝试，与 ①c 的额外次数上限相同。每种故障全批最多重试 ${retriesPerKind} 次，每次逻辑调用也最多重试 ${reasoningOffPolicy.retries} 次。配置故障、预算不足或任一格终判失败即停止，不另开 run 接着凑判决。

## 采用线

- (a) 18/18 计划首尝试均实际发送，发出后 ${plan.timeoutMs / 1000} 秒内收到首个非空白正文 delta，供应商实报推理 token 为 ${adoption.maxReasoningTokens}，且未见相矛盾的推理 delta。阈值为零。缺报、未启动或靠重试补回不算命中。
- (b) S1 至少 ${adoption.minS1Valid}/15 格有通过本地校验的完整判决。合规重试可以计入 (b)，不可替代 (a) 的首尝试。
- (c) ${adoption.minRatePasses}/3 遍中，每遍四个坏教师的适用分率均严格低于同遍 normal。
- (d) 四个目标维各至少 ${adoption.minTargetPasses}/3 遍严格低于同遍 normal：answer_dump 的试错、lecture 的主动权、sycophant_close 的验证或迁移、no_teach 的误解修复。缺判、N/A、平局和反向均不命中。
- (e) 下表确定的 Yes/No 位合计假阳与假阴不超过 ${adoption.maxTruthErrors}；不定项排除，缺判另列。N/A 门控的判对率单报，不另设通过线。

全部满足才采用。任一不满足则不采用；下一步备选是 Qwen3 235B Instruct / Parasail，不自行换模型。此结论不用于冻结尺子。续跑和并发合入后，S1 与定向复测用最终身份另跑。

只描述：同遍同格与开推理 v1 比较未改的 15 道题（排除 A1、A2、V1、V2），逐题报告分母。一致不等于判对。比较已发首尝试的耗时中位数与最近秩 p90，另列故障和缺失；①c 诊断期限为 360 秒，不作等条件速度对照。S1 同格三遍按题、按维报告一致率，只计三遍均有判决的格，0/1/2/N/A 各是一类。

## 构造预期答案

${table}

## 机器清单

\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`
`;
  return { queue, inputs, history, prompt, plan, markdown, expected: constructExpectations(markdown) };
}

export function contrastIdentity(mode, plan, preregistrationSha256) {
  const { dataset: _, dialogueSource: __, ...base } = evaluationIdentity({ mode, limits, sources: sourceFiles });
  assert.deepEqual(base.sources, plan.sources, 'evaluation sources changed since registration');
  const identity = { ...base, version: binaryIdentityVersion, ruler: binaryRuler,
    judgeOutputContract: binaryOutputContract, policy: reasoningOffPolicy, routes: mode === 'real' ? { judge: routes.judge } : 'pi-ai-faux',
    preregistrationSha256, planned: plan };
  return { identity, identityId: hash({ mode, scenario, identity }) };
}
