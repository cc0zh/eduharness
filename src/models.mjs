import { isDeepStrictEqual } from 'node:util';
import { createAssistantMessageEventStream, createModels, fauxProvider } from '@earendil-works/pi-ai';
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { failure } from '../contracts/core/schema.mjs';
import { policy, routes } from '../config/e1.mjs';
import { conflictingReasoningKeys, reasoningOffPolicy } from '../config/judge-reasoning-off.mjs';
import { trackedFetch } from './run-receipts.mjs';

const textOf = message => message.content.filter(b => b.type === 'text').map(b => b.text).join('');
const roleConfig = role => role === 'regrade' ? 'judge' : role;
const nonempty = text => typeof text === 'string' && text.length > 0;

function observeJudge(elapsed) {
  const phaseMs = { requestSent: null, headersReceived: null, firstByte: null, firstReasoning: null, lastReasoning: null, firstVisible: null, ended: null };
  let reportedOutputTokens = null;
  return {
    async fetch(input, init) {
      phaseMs.requestSent = elapsed();
      const response = await globalThis.fetch(input, init);
      phaseMs.headersReceived = elapsed();
      if (!response.body) return response;
      const body = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
        if (chunk.byteLength) phaseMs.firstByte ??= elapsed();
        controller.enqueue(chunk);
      } }));
      return new Response(body, response);
    },
    event(chunk) {
      const choice = chunk?.choices?.[0];
      const output = (chunk?.usage ?? choice?.usage)?.completion_tokens;
      if (Number.isSafeInteger(output) && output >= 0) reportedOutputTokens = output;
      const delta = choice?.delta;
      if (!delta) return;
      if ([delta.reasoning_content, delta.reasoning, delta.reasoning_text].some(nonempty)
        || Array.isArray(delta.reasoning_details) && delta.reasoning_details.some(detail => [detail?.text, detail?.summary, detail?.data].some(nonempty))) {
        phaseMs.lastReasoning = elapsed();
        phaseMs.firstReasoning ??= phaseMs.lastReasoning;
      }
      if (typeof delta.content === 'string' && delta.content.trim()) phaseMs.firstVisible ??= elapsed();
    },
    finish() {
      phaseMs.ended = elapsed();
      return { phaseMs, reportedOutputTokens };
    },
  };
}

export function attemptBudget({ maxAttempts, maxRequestedOutputTokens }) {
  let attempts = 0, requested = 0;
  const canCover = (calls, tokens) => attempts + calls <= maxAttempts && requested + tokens <= maxRequestedOutputTokens;
  const reserve = (where, limit) => {
    if (!canCover(1, limit)) throw failure('budget_exhausted', where, 'remaining request budget cannot cover the next attempt');
    attempts++;
    requested += limit;
  };
  return Object.assign(reserve, { canCover });
}

export function stopFailure(response, text, reasoning, limit, finishReason) {
  if (['error', 'aborted'].includes(response.stopReason) || ['content_filter', 'error'].includes(finishReason)) return 'provider_failure';
  const truncated = response.stopReason === 'length' || finishReason === 'length';
  if (!text.trim() && response.stopReason !== 'toolUse') {
    if (truncated || response.usage?.output >= limit) {
      return reasoning !== null && reasoning > 0 && reasoning === response.usage?.output ? 'reasoning_exhausted_empty' : 'output_limit_empty_unconfirmed';
    }
    return 'empty_unconfirmed';
  }
  if (truncated) return 'output_truncated';
}

export class Models {
  #pi = createModels();
  #roles;
  #keys;
  #save;
  #reserve;
  #recorder;
  #cell;
  #policy;
  #judgeTimeoutMs;

  constructor({ mode, responses, save, reserve, recorder, cell, roles = Object.keys(routes), judgeTimeoutMs, judgeReasoningOff = false }) {
    if (judgeTimeoutMs !== undefined && (roles.length !== 1 || roles[0] !== 'judge'
      || !Number.isSafeInteger(judgeTimeoutMs) || judgeTimeoutMs < 1 || judgeTimeoutMs > 2_147_483_647)) {
      throw failure('configuration', { role: 'judge', turn: 0, call: 0 }, 'positive judge timeout override requires a judge-only run');
    }
    if (typeof judgeReasoningOff !== 'boolean' || judgeReasoningOff && (roles.length !== 1 || roles[0] !== 'judge')) {
      throw failure('configuration', { role: 'judge', turn: 0, call: 0 }, 'reasoning-off requires a judge-only run');
    }
    this.#policy = judgeReasoningOff ? reasoningOffPolicy : policy;
    this.#judgeTimeoutMs = judgeTimeoutMs;
    this.#save = save;
    this.#reserve = reserve;
    this.#recorder = mode === 'real' ? recorder : undefined;
    this.#cell = cell;
    if (mode === 'offline') {
      const faux = fauxProvider();
      this.#pi.setProvider(faux.provider);
      faux.setResponses(responses);
      this.#roles = Object.fromEntries(Object.keys(routes).map(role => [role, faux.getModel()]));
      return;
    }
    const selected = roles.map(role=>[role,routes[role]]);
    this.#keys = Object.fromEntries(selected.map(([role, route]) => {
      const key = process.env[route.key]?.trim();
      if (!key) throw failure('configuration', { role, turn: 0, call: 0 }, `missing ${route.key}`);
      return [role, key];
    }));
    const router = openrouterProvider();
    this.#pi.setProvider(deepseekProvider());
    this.#pi.setProvider(router);
    this.#roles = Object.fromEntries(selected.map(([role, route]) => {
      const model = this.#pi.getModel(route.provider, route.id) ?? (role === 'judge' ? {
        id: route.id, name: 'HY4 Flash', api: 'openai-completions', provider: route.provider,
        baseUrl: 'https://openrouter.ai/api/v1', reasoning: true, input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 131072, maxTokens: policy.judge.maxTokens,
        compat: { thinkingFormat: 'openrouter', maxTokensField: 'max_tokens', supportsDeveloperRole: false },
      } : null);
      if (!model) throw failure('configuration', { role, turn: 0, call: 0 }, 'configured model absent from pi catalog');
      return [role, model];
    }));
  }

  model(role) { return this.#roles[roleConfig(role)]; }

  usesStructuredJudgement(role) {
    return roleConfig(role) === 'judge' && this.model(role).provider === 'openrouter' && routes.judge.responseFormat === 'json_schema';
  }

  complete(scope, context, parse, schema) { return this.#invoke(scope, context, {}, parse, undefined, schema); }

  stream(scope, context, options, validate) {
    const output = createAssistantMessageEventStream();
    void this.#invoke(scope, context, options, validate, output).catch(error => {
      const response = {
        role: 'assistant', content: [], ...this.identity(scope.role), timestamp: Date.now(), stopReason: 'error',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        errorMessage: error.message,
      };
      scope.onFailure(error);
      output.push({ type: 'error', reason: 'error', error: response });
      output.end();
    });
    return output;
  }

  identity(role) {
    const { id: model, provider, api } = this.model(role);
    return { model, provider, api };
  }

  async #invoke(scope, context, agentOptions, parse, stream, schema) {
    const { role, turn, call } = scope;
    const canonical = roleConfig(role);
    const callPolicy = this.#policy;
    const config = callPolicy[canonical];
    const model = this.model(role);
    if (config.reasoning && model.provider === routes.judge.provider && !schema) {
      throw failure('configuration', { role, turn, call }, 'reasoning-off requires a structured OpenRouter judgement');
    }
    const reasoning = config.reasoning ?? { max_tokens: config.reasoningMaxTokens };
    const contractFailure = { teacher: 'teacher_generation_contract', learner: 'simulator_generation_contract', judge: 'judge_partial_failure' }[canonical];
    const timeoutMs = (canonical === 'judge' ? this.#judgeTimeoutMs : undefined) ?? config.timeoutMs ?? callPolicy.timeoutMs;
    let priorValidation;
    for (let attempt = 1; attempt <= callPolicy.retries + 1; attempt++) {
      const coordinates = { role, turn, call, attempt };
      this.#reserve?.(coordinates, config.maxTokens);
      const request = priorValidation ? { ...context, systemPrompt: `${context.systemPrompt}\nPrevious response rejected: ${priorValidation}. Correct that problem and submit a complete replacement judgement for the same evidence view.` } : context;
      const raw = { ...coordinates, context: request, ...(scope.binding && { binding:scope.binding }) };
      let requestLimit = config.maxTokens, finish_reason = null, reasoningTokens = null, httpStatus = null;
      const startedAt = new Date().toISOString();
      const start = performance.now();
      const elapsed = () => Math.round(performance.now() - start);
      const observation = canonical === 'judge' && model.provider === routes.judge.provider ? observeJudge(elapsed) : undefined;
      const signal = AbortSignal.timeout(timeoutMs);
      const transport = observation?.fetch ?? globalThis.fetch;
      const send = this.#recorder ? trackedFetch(transport, this.#recorder, `${this.#cell}:${canonical}:${turn}:${call}:${attempt}`) : transport;
      let outboundRejection;
      const fetch = schema ? (input, init) => {
        const body = JSON.parse(init.body);
        const cap = body.max_tokens ?? body.max_completion_tokens;
        const offMismatch = config.reasoning && (conflictingReasoningKeys.some(key => Object.hasOwn(body, key))
          || body.model !== routes.judge.id || body.response_format?.type !== 'json_schema');
        if (offMismatch || !isDeepStrictEqual(body.reasoning, reasoning) || !Number.isInteger(cap) || cap - (reasoning.max_tokens ?? 0) < config.minVisibleTokens || cap > config.maxTokens || body.provider?.require_parameters !== true || body.response_format?.json_schema?.strict !== true) {
          outboundRejection = 'outbound judge budget or schema mismatch';
          throw new Error(outboundRejection);
        }
        raw.outbound = {
          model: routes.judge.id,
          ...(body.max_tokens === undefined ? {max_completion_tokens:cap} : {max_tokens:cap}),
          reasoning: body.reasoning,
          ...(config.reasoning && { parameterNames: Object.keys(body).sort() }),
          provider: { require_parameters: true },
          response_format: { type: body.response_format.type, json_schema: { strict: true, schema: '[redacted]' } },
          messages: '[redacted]',
        };
        return send(input, init);
      } : this.#recorder || observation ? send : undefined;
      const options = {
        ...agentOptions, signal: agentOptions.signal ? AbortSignal.any([signal, agentOptions.signal]) : signal,
        ...(fetch && { fetch }),
        ...(this.#keys && { apiKey: this.#keys[canonical] }),
        identity: { attribution: null }, temperature: 0, maxTokens: requestLimit, maxRetries: 0,
        reasoning: stream ? agentOptions.reasoning : config.thinking,
        onPayload(payload) {
          const sent = payload.max_completion_tokens ?? payload.max_tokens ?? payload.max_output_tokens;
          if (!Number.isInteger(sent) || sent <= 0 || sent > config.maxTokens) throw new Error('provider request output cap invalid');
          requestLimit = sent;
          if (schema) return {
            ...payload,
            reasoning,
            provider: { ...payload.provider, require_parameters: true },
            response_format: { type: 'json_schema', json_schema: { name: 'teacharena_judgement', strict: true, schema } },
          };
        },
        onResponse({ status }) { httpStatus = status; },
        onProviderStreamEvent(chunk) {
          observation?.event(chunk);
          finish_reason = chunk.choices?.[0]?.finish_reason ?? finish_reason;
          reasoningTokens = chunk.usage?.completion_tokens_details?.reasoning_tokens ?? reasoningTokens;
        },
      };
      let response, failureKind, parsed, detail;
      const events = [], originalOrder = [];
      try {
        if (stream) {
          const source = this.#pi.streamSimple(model, request, options);
          for await (const event of source) events.push(event);
          response = await source.result();
        } else response = await this.#pi.completeSimple(model, request, options);
      } catch (error) {
        failureKind = 'provider_failure';
        httpStatus = Number.isInteger(error?.status) ? error.status : httpStatus;
      }
      const timing = observation?.finish();
      const text = response ? textOf(response) : '';
      if (response) {
        failureKind = stopFailure(response, text, reasoningTokens, requestLimit, finish_reason);
        if (!failureKind) {
          try {
            if (!stream && (response.stopReason !== 'stop' || response.content.some(b => b.type === 'toolCall'))) throw new Error('JSON generation did not terminate normally');
            parsed = parse(text, response, originalOrder);
          }
          catch (error) { failureKind = contractFailure; detail = error instanceof SyntaxError ? 'invalid JSON document' : error.message; }
        }
      }
      if (outboundRejection) {
        failureKind = 'configuration';
        detail = outboundRejection;
      } else if (failureKind === 'provider_failure') {
        httpStatus = Number(response?.errorMessage?.match(/^(?:\w+Error: )?(?:status(?: code)?[ :]+)?([45]\d\d)(?:\b|$)/i)?.[1]) || httpStatus;
        detail = signal.aborted ? 'local request timeout' : agentOptions.signal?.aborted ? 'agent request cancelled' : httpStatus >= 400 ? `provider HTTP ${httpStatus}` : response?.stopReason === 'aborted' ? 'provider request aborted' : 'provider request failed';
      }
      const usage = failureKind === 'provider_failure' && !response?.usage?.totalTokens ? null : response?.usage ?? null;
      const attemptPath = this.#save({
        ...raw, response: response ? { ...response, errorMessage: undefined } : null,
      }, {
        ...coordinates, ...this.identity(role), policyVersion: callPolicy.version, requestLimit, finish_reason, httpStatus,
        startedAt, elapsedMs: elapsed(), timeoutMs, ...timing,
        normalized: originalOrder.length > 0, originalOrder,
        ...(canonical === 'judge' && { judgementMode: schema ? 'json_schema' : 'text_json' }),
        ...(raw.outbound && { reasoningLimit: raw.outbound.reasoning.max_tokens ?? null }),
        ...(scope.binding && { binding:scope.binding }),
        stopReason: response?.stopReason ?? null, reasoningTokens, usage, retryCount: attempt - 1,
        visibleTokens: usage && reasoningTokens !== null && usage.output >= reasoningTokens ? usage.output - reasoningTokens : null,
        failureKind: failureKind ?? null, detail: detail ?? null,
      });
      if (!failureKind) {
        if (stream) {
          for (const event of events) stream.push(event);
          stream.end();
        }
        return { value: parsed, location: { ...coordinates, attemptPath } };
      }
      if (attempt > callPolicy.retries || agentOptions.signal?.aborted) throw failure(failureKind, { ...coordinates, attemptPath }, detail);
      priorValidation = canonical === 'judge' && failureKind === contractFailure ? detail : undefined;
    }
  }
}
