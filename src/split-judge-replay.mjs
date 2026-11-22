import { isDeepStrictEqual as same } from 'node:util';
import { requireThat } from '../contracts/core/schema.mjs';
import { bindBinary } from '../contracts/judge/binary.mjs';
import { parseBinaryDimension, splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { binaryDimensionPayload, binaryDimensionPrompt } from './binary-judge-v3.mjs';
import { matchesJudgeParameters, matchesReportedRoute, retryFeedbackCode, splitRetryPrompt } from './judge-transport.mjs';

export function verifySplitTransport(identity, raw, meter, label) {
  const expected = identity.judgeTransport;
  requireThat([raw, meter].every(row => row.proxied === expected?.proxied && row.proxySource === expected?.proxySource),
    `proxy evidence differs from the evaluation identity at ${label}`);
}

export function splitBinding(manifest, folder, view) {
  const { condition, repetition, sourceRunId } = manifest.planned.find(row => row.id === folder);
  return { runId: manifest.id, cell: condition ?? folder, ruler: manifest.identity.ruler, viewHash: view.id,
    messageIds: view.messages.map(message => message.id), sourceRunId, ...(repetition && { repetition }) };
}

export function replaySplitJudge(manifest, folder, messages, meter, raw) {
  const label = `${meter.callId} (process ${meter.processIndex})`;
  verifySplitTransport(manifest.identity, raw, meter, label);
  const view = bindBinary(messages);
  const dimension = splitDimensions[meter.call - 1];
  const binding = { ...splitBinding(manifest, folder, view), dimension };
  requireThat(same(raw.binding, binding) && same(meter.binding, binding), `dimension binding differs at ${label}`);
  const { context } = raw;
  requireThat(context.messages.length === 1 && context.messages[0].role === 'user'
    && same(JSON.parse(context.messages[0].content), binaryDimensionPayload(view))
    && context.systemPrompt === splitRetryPrompt(binaryDimensionPrompt(view, dimension, binding.ruler), meter.retryFeedback), `dimension request or retry feedback differs at ${label}`);
  if (raw.outbound) {
    const route = manifest.identity.routes.judge;
    const { parameterNames, reasoning, max_tokens, max_completion_tokens } = raw.outbound;
    requireThat(route && matchesJudgeParameters(raw.outbound, parameterNames, route, manifest.identity.policy.judge)
      && (max_tokens ?? max_completion_tokens) === meter.requestLimit && meter.reasoningLimit === (reasoning?.max_tokens ?? null)
      && meter.model === route.id && meter.provider === route.provider, `outbound dimension parameters differ at ${label}`);
    const mismatch = !matchesReportedRoute(route, meter.reportedProvider, meter.reportedModel);
    requireThat(mismatch === (meter.failureKind === 'configuration' && meter.detail === 'response judge route mismatch'), `dimension response route differs at ${label}`);
  }
  if (meter.failureKind && meter.failureKind !== 'judge_partial_failure') return;
  requireThat(manifest.mode !== 'real' || raw.outbound, `dimension is missing outbound parameters at ${label}`);
  const text = raw.response.content.filter(block => block.type === 'text').map(block => block.text).join('');
  let verdict, validationCode;
  try {
    requireThat(raw.response.stopReason === 'stop' && !raw.response.content.some(block => block.type === 'toolCall'), 'JSON generation did not terminate normally');
    verdict = parseBinaryDimension(text, view, dimension, undefined, binding.ruler);
  } catch (error) {
    validationCode = retryFeedbackCode(error);
  }
  if (meter.failureKind) {
    requireThat(!verdict && validationCode === meter.validationCode, `dimension validation failure does not replay at ${label}`);
    return;
  }
  requireThat(verdict && meter.validationCode == null && same(verdict.normalized, raw.normalized) && same(verdict.normalized, meter.normalizations), `dimension judgement or normalization differs at ${label}`);
  const { callId, processIndex, role, turn, call, attempt, attemptPath } = meter;
  return { verdict, binding: { dimension, callId, processIndex, role, turn, call, attempt, attemptPath } };
}
