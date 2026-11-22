import { createAssistantMessageEventStream, createModels, fauxProvider } from '@earendil-works/pi-ai';
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { ProxyAgent } from 'undici';
import { failure } from '../contracts/core/schema.mjs';
import { fidelityAuditSchema } from '../contracts/learner/fidelity.mjs';
import { learnerJsonExample } from '../contracts/learner/schema.mjs';
import { policy, routes } from '../config/e1.mjs';
import { fidelityPolicy, fidelityRoute } from '../config/fidelity-audit.mjs';
import { make403Probe } from '../config/judge-bakeoff-probe.mjs';
import { judgeModelMetadata, splitJudgeCandidates } from '../config/judge-bakeoff.mjs';
import { judgeCandidates } from '../config/judge-contrast.mjs';
import { reasoningOffPolicy } from '../config/judge-reasoning-off.mjs';
import { judgeParameters, matchesJudgeParameters, matchesReportedRoute, retryFeedbackCode, retryFeedbackCodes, splitRetryPrompt } from './judge-transport.mjs';
import { resolveOpenRouterProxySource } from './openrouter-proxy.mjs';
import { captureProviderResponse, redactProviderValue } from './provider-response-diagnostics.mjs';
import { trackedFetch } from './run-receipts.mjs';

const textOf = message => message.content.filter(b => b.type === 'text').map(b => b.text).join('');
const roleConfig = role => role === 'regrade' ? 'judge' : role;
const nonempty = text => typeof text === 'string' && text.length > 0;
const auditProvider = { require_parameters: true, only: [fidelityRoute.endpoint], allow_fallbacks: false };
const auditUpstreamName = value => typeof value === 'string' && value.toLowerCase() === fidelityRoute.endpoint.split('/')[0] ? value : undefined;

async function auditErrorFields(response) {
  const { error } = await response.clone().json().catch(() => ({})) ?? {};
  const type = error?.metadata?.error_type;
  const kind = ['permission', 'rate_limit', 'content_filter', 'moderation', 'invalid_request', 'unavailable', 'server'].includes(type) ? type : undefined;
  const provider = auditUpstreamName(error?.metadata?.provider_name);
  return {
    code: Number.isInteger(error?.code) ? error.code : response.status,
    hasMessage: typeof error?.message === 'string', ...(kind && { kind }), ...(provider && { provider }),
  };
}

function proxySecretsOf(proxy) {
  const url = new URL(proxy);
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  return [proxy, url.origin, url.username, url.password, user, password,
    user && password ? `${user}:${password}` : undefined,
    user && password ? Buffer.from(`${user}:${password}`).toString('base64') : undefined,
  ].filter(secret => typeof secret === 'string' && secret.length > 0);
}

function observeJudge(elapsed, dispatcher) {
  const phaseMs = { requestSent: null, headersReceived: null, firstByte: null, firstReasoning: null, lastReasoning: null, firstVisible: null, ended: null };
  let reportedOutputTokens = null;
  return {
    async fetch(input, init) {
      phaseMs.requestSent = elapsed();
      const response = await globalThis.fetch(input, dispatcher ? { ...init, dispatcher } : init);
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

const scopeFeedbackCodes = [...retryFeedbackCodes, 'generic'];

export class Models {
  #pi = createModels();
  #roles;
  #keys;
  #save;
  #reserve;
  #beforeAttempt;
  #recorder;
  #cell;
  #policy;
  #judgeRoute;
  #judgeTimeoutMs;
  #learnerJsonMode;
  #judgeProxySource;
  #judgeProxy;
  #proxyAgent;
  #proxySecrets;
  #split;
  #probe;

  constructor({ mode, responses, save, reserve, recorder, cell, roles = Object.keys(routes), judgeTimeoutMs, judgeReasoningOff = false, judgePolicy, judgeProbeStep, judgeProxySource, beforeAttempt, learnerJsonMode = false }) {
    const probe = judgeProbeStep === undefined ? undefined : make403Probe(judgePolicy, judgeProbeStep);
    const split = Object.hasOwn(splitJudgeCandidates, judgePolicy) ? splitJudgeCandidates[judgePolicy] : undefined;
    const candidate = probe ?? split ?? (Object.hasOwn(judgeCandidates, judgePolicy) ? judgeCandidates[judgePolicy] : undefined);
    if (judgePolicy !== undefined && (!candidate || judgeReasoningOff || roles.length !== 1 || roles[0] !== 'judge' || judgeTimeoutMs !== undefined)) {
      throw failure('configuration', { role: 'judge', turn: 0, call: 0 }, 'judge policy requires a judge-only run with its registered deadline');
    }
    if (probe && mode !== 'real') throw failure('configuration', { role: 'judge', turn: 0, call: 0 }, '403 probe requires a real judge-only request');
    if (judgeTimeoutMs !== undefined && (roles.length !== 1 || roles[0] !== 'judge'
      || !Number.isSafeInteger(judgeTimeoutMs) || judgeTimeoutMs < 1 || judgeTimeoutMs > 2_147_483_647)) {
      throw failure('configuration', { role: 'judge', turn: 0, call: 0 }, 'positive judge timeout override requires a judge-only run');
    }
    if (typeof learnerJsonMode !== 'boolean' || learnerJsonMode && !roles.includes('learner')) {
      throw failure('configuration', { role: 'learner', turn: 0, call: 0 }, 'learner JSON mode requires the learner role');
    }
    this.#learnerJsonMode = learnerJsonMode;
    if (typeof judgeReasoningOff !== 'boolean' || judgeReasoningOff && (roles.length !== 1 || roles[0] !== 'judge')) {
      throw failure('configuration', { role: 'judge', turn: 0, call: 0 }, 'reasoning-off requires a judge-only run');
    }
    this.#policy = candidate?.policy ?? (judgeReasoningOff ? reasoningOffPolicy : policy);
    this.#judgeRoute = candidate?.route ?? routes.judge;
    this.#split = Boolean(split || probe);
    this.#probe = probe;
    this.#judgeTimeoutMs = judgeTimeoutMs;
    if (judgeProxySource !== undefined) {
      const coords = { role: 'judge', turn: 0, call: 0 };
      if (typeof judgeProxySource !== 'string' || judgeProxySource.length === 0) {
        throw failure('configuration', coords, 'judge proxy source requires an explicit environment variable name');
      }
      if (mode !== 'real') throw failure('configuration', coords, 'judge proxy requires a real run');
      if (!roles.includes('judge') || this.#judgeRoute.provider !== 'openrouter') {
        throw failure('configuration', coords, 'judge proxy requires the OpenRouter judge');
      }
      let resolved;
      try {
        resolved = resolveOpenRouterProxySource(process.env);
      } catch {
        throw failure('configuration', coords, 'judge proxy unavailable: set HTTPS_PROXY or HTTP_PROXY to an http(s) URL with TLS verification enabled');
      }
      if (resolved.source !== judgeProxySource) {
        throw failure('configuration', coords, 'judge proxy source does not match the active proxy setting');
      }
      this.#judgeProxySource = judgeProxySource;
      this.#judgeProxy = resolved.proxy;
      this.#proxySecrets = proxySecretsOf(resolved.proxy);
    }
    this.#save = save;
    this.#reserve = reserve;
    this.#beforeAttempt = beforeAttempt;
    this.#recorder = mode === 'real' ? recorder : undefined;
    this.#cell = cell;
    if (mode === 'offline') {
      const faux = fauxProvider();
      this.#pi.setProvider(faux.provider);
      faux.setResponses(responses);
      this.#roles = Object.fromEntries(roles.map(role => [role, faux.getModel()]));
      return;
    }
    const selected = roles.map(role => [role, role === 'judge' ? this.#judgeRoute : role === 'fidelity_audit' ? fidelityRoute : routes[role]]);
    this.#keys = Object.fromEntries(selected.map(([role, route]) => {
      const key = process.env[route.key]?.trim();
      if (!key) throw failure('configuration', { role, turn: 0, call: 0 }, `missing ${route.key}`);
      return [role, key];
    }));
    const router = openrouterProvider();
    this.#pi.setProvider(deepseekProvider());
    this.#pi.setProvider(router);
    this.#roles = Object.fromEntries(selected.map(([role, route]) => {
      const pinned = this.#split && role === 'judge' ? judgeModelMetadata[route.id] : undefined;
      if (this.#split && role === 'judge' && !pinned) throw failure('configuration', { role, turn: 0, call: 0 }, 'configured split judge model metadata absent');
      const model = pinned ?? this.#pi.getModel(route.provider, route.id) ?? (role === 'judge' && route.id === routes.judge.id ? {
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

  #proxyDispatcher() {
    if (!this.#judgeProxySource) return undefined;
    this.#proxyAgent ??= new ProxyAgent(this.#judgeProxy);
    return this.#proxyAgent;
  }

  usesStructuredJudgement(role) {
    return roleConfig(role) === 'judge' && this.model(role).provider === 'openrouter' && this.#judgeRoute.responseFormat === 'json_schema';
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
    const config = canonical === 'fidelity_audit' ? fidelityPolicy : callPolicy[canonical];
    const model = this.model(role);
    const learnerJsonMode = this.#learnerJsonMode && canonical === 'learner';
    const learnerRequest = learnerJsonMode && { ...context, systemPrompt: `${context.systemPrompt}${learnerJsonExample}` };
    const strictAudit = canonical === 'fidelity_audit' && model.provider === fidelityRoute.provider;
    const route = canonical === 'judge' ? this.#judgeRoute : undefined;
    const split = this.#split;
    const probe = this.#probe;
    const structuredJudge = route && (schema || probe);
    const nextAttempt = scope.nextAttempt;
    const initialFeedback = scope.retryFeedback;
    const maxAttempts = callPolicy.maxAttemptsPerCall ?? 3;
    if (split) {
      if (nextAttempt !== undefined && (!Number.isSafeInteger(nextAttempt) || nextAttempt < 1 || nextAttempt > maxAttempts)) {
        throw failure('configuration', { role, turn, call }, `split judge recovery attempt must be 1..${maxAttempts}`);
      }
      if (initialFeedback !== undefined && initialFeedback !== null && !scopeFeedbackCodes.includes(initialFeedback)) {
        throw failure('configuration', { role, turn, call }, 'split judge retry feedback must be a known code');
      }
    } else if (nextAttempt !== undefined || initialFeedback !== undefined) {
      throw failure('configuration', { role, turn, call }, 'retry scope requires a split judge policy');
    }
    if (route && !probe && (split || config.reasoning || callPolicy.retriesPerKind !== undefined) && model.provider === route.provider && !schema) {
      throw failure('configuration', { role, turn, call }, 'judge policy requires a structured OpenRouter judgement');
    }
    const { reasoning, provider } = route ? judgeParameters(route, config) : {};
    const contractFailure = { teacher: 'teacher_generation_contract', learner: 'simulator_generation_contract', judge: 'judge_partial_failure', fidelity_audit: 'fidelity_audit_contract' }[canonical];
    const timeoutMs = (canonical === 'judge' ? this.#judgeTimeoutMs : undefined) ?? config.timeoutMs ?? callPolicy.timeoutMs;
    let priorValidation, retries = 0, feedback = initialFeedback ?? null;
    for (let attempt = split ? (nextAttempt ?? 1) : 1; ; attempt++) {
      const coordinates = { role, turn, call, attempt };
      if (this.#beforeAttempt) await this.#beforeAttempt(coordinates, config.maxTokens);
      else this.#reserve?.(coordinates, config.maxTokens);
      const appliedFeedback = split ? feedback : undefined;
      const request = split
        ? (feedback === null ? context : { ...context, systemPrompt: splitRetryPrompt(context.systemPrompt, feedback) })
        : learnerRequest || (priorValidation ? { ...context, systemPrompt: `${context.systemPrompt}\nPrevious response rejected: ${priorValidation}. Correct that problem and submit a complete replacement judgement for the same evidence view.` } : context);
      const proxyTag = canonical === 'judge' && this.#judgeProxySource ? { proxied: true, proxySource: this.#judgeProxySource } : undefined;
      const raw = { ...coordinates, context: request, ...(scope.binding && { binding:scope.binding }), ...proxyTag };
      let requestLimit = config.maxTokens, finish_reason = null, reasoningTokens = null, httpStatus = null;
      const startedAt = new Date().toISOString();
      const start = performance.now();
      const elapsed = () => Math.round(performance.now() - start);
      const observation = canonical === 'judge' && model.provider === routes.judge.provider ? observeJudge(elapsed, this.#proxyDispatcher()) : undefined;
      const signal = AbortSignal.timeout(timeoutMs);
      const transport = observation?.fetch ?? globalThis.fetch;
      const send = this.#recorder ? trackedFetch(transport, this.#recorder, `${this.#cell}:${canonical}:${turn}:${call}:${attempt}`) : transport;
      const diagnosticSecrets = canonical === 'judge'
        ? [this.#keys?.[canonical], ...(this.#proxySecrets ?? [])].filter(secret => typeof secret === 'string' && secret.length > 0)
        : [];
      const diagnosticFetch = async (input, init) => {
        const response = await send(input, init);
        if (!response.ok || probe) raw.providerResponsePending = captureProviderResponse(response, { secrets: diagnosticSecrets });
        return response;
      };
      let outboundRejection, auditError, auditUpstream, responseRouteMismatch, reportedProvider = null, reportedModel = null;
      const fetch = strictAudit ? async (input, init) => {
        const body = JSON.parse(init.body);
        const cap = body.max_tokens ?? body.max_completion_tokens;
        const format = body.response_format;
        if (body.model !== fidelityRoute.id || !Number.isSafeInteger(cap) || cap < 1 || cap > config.maxTokens
          || body.reasoning !== undefined || body.provider?.require_parameters !== true || body.provider.allow_fallbacks !== false
          || body.provider.only?.length !== 1 || body.provider.only[0] !== fidelityRoute.endpoint
          || format?.type !== 'json_schema' || format.json_schema?.strict !== true) {
          outboundRejection = 'outbound fidelity audit route, budget or schema mismatch';
          throw new Error(outboundRejection);
        }
        raw.outbound = {
          model: body.model, ...(body.max_tokens === undefined ? { max_completion_tokens: cap } : { max_tokens: cap }),
          provider: auditProvider, response_format: { type: format.type, json_schema: { strict: true, schema: '[redacted]' } },
        };
        const response = await send(input, init);
        if (!response.ok) auditError = await auditErrorFields(response);
        return response;
      } : learnerJsonMode && model.provider === routes.learner.provider ? (input, init) => {
        const body = JSON.parse(init.body);
        const cap = body.max_tokens ?? body.max_completion_tokens;
        if (body.model !== routes.learner.id || cap !== requestLimit || body.response_format?.type !== 'json_object'
          || !body.messages.some(message => message.role === 'system' && message.content === request.systemPrompt)) {
          outboundRejection = 'outbound learner JSON mode, prompt or budget mismatch';
          throw new Error(outboundRejection);
        }
        raw.outbound = { model: body.model,
          ...(body.max_completion_tokens === undefined ? { max_tokens: cap } : { max_completion_tokens: cap }),
          response_format: body.response_format };
        return send(input, init);
      } : structuredJudge ? (input, init) => {
        const body = JSON.parse(init.body);
        const cap = body.max_tokens ?? body.max_completion_tokens;
        const names = Object.keys(body).sort();
        if (!matchesJudgeParameters(body, names, route, config)) {
          outboundRejection = 'outbound judge budget or schema mismatch';
          throw new Error(outboundRejection);
        }
        raw.outbound = {
          model: body.model,
          ...(body.max_tokens === undefined ? {max_completion_tokens:cap} : {max_tokens:cap}),
          ...(body.reasoning !== undefined && { reasoning: body.reasoning }),
          ...((config.reasoning || route.routing) && { parameterNames: names }),
          ...(split && body.temperature !== undefined && { temperature: body.temperature }),
          provider,
          ...(body.response_format && { response_format: { type: body.response_format.type,
            ...(body.response_format.json_schema && { json_schema: { strict: body.response_format.json_schema.strict, schema: '[redacted]' } }) } }),
          messages: '[redacted]',
        };
        return diagnosticFetch(input, init);
      } : this.#recorder || observation ? diagnosticFetch : undefined;
      const options = {
        ...agentOptions, signal: agentOptions.signal ? AbortSignal.any([signal, agentOptions.signal]) : signal,
        ...(fetch && { fetch }),
        ...(this.#keys && { apiKey: this.#keys[canonical] }),
        identity: { attribution: null }, temperature: route?.temperature === null ? undefined : route?.temperature ?? 0, maxTokens: requestLimit, maxRetries: 0,
        reasoning: stream ? agentOptions.reasoning : config.thinking,
        onPayload(payload) {
          const sent = payload.max_completion_tokens ?? payload.max_tokens ?? payload.max_output_tokens;
          if (!Number.isInteger(sent) || sent <= 0 || sent > config.maxTokens) throw new Error('provider request output cap invalid');
          requestLimit = sent;
          if (strictAudit) {
            const { reasoning, ...request } = payload;
            return { ...request, provider: auditProvider,
              response_format: { type: 'json_schema', json_schema: { name: 'teacharena_fidelity', strict: true, schema: schema ?? fidelityAuditSchema } } };
          }
          if (learnerJsonMode) {
            if (model.provider !== routes.learner.provider) {
              outboundRejection = 'learner JSON mode requires the configured DeepSeek route';
              throw new Error(outboundRejection);
            }
            return { ...payload, response_format: { type: 'json_object' } };
          }
          if (structuredJudge) {
            const next = {
              ...payload,
              reasoning,
              provider: route.routing ? provider : { ...payload.provider, ...provider },
            };
            if (probe) {
              delete next.max_tokens;
              delete next.max_completion_tokens;
              next[probe.route.maxTokensField] = sent;
            }
            if (route.responseFormat === 'json_schema') {
              next.response_format = { type: 'json_schema', json_schema: { name: 'teacharena_judgement', strict: true, schema } };
            } else delete next.response_format;
            if (split) delete next.thinking;
            return next;
          }
        },
        onResponse({ status }) { httpStatus = status; },
        onProviderStreamEvent(chunk) {
          observation?.event(chunk);
          if (strictAudit) auditUpstream ??= auditUpstreamName(chunk.provider);
          finish_reason = chunk.choices?.[0]?.finish_reason ?? finish_reason;
          reasoningTokens = chunk.usage?.completion_tokens_details?.reasoning_tokens ?? reasoningTokens;
          if (route?.routing && !responseRouteMismatch) {
            if (nonempty(chunk.provider)) reportedProvider = chunk.provider;
            if (nonempty(chunk.model)) reportedModel = chunk.model;
            responseRouteMismatch = !matchesReportedRoute(route, reportedProvider, reportedModel);
          }
        },
      };
      let response, failureKind, parsed, detail, providerError, validationCode = null, normalizations = [];
      const events = [], originalOrder = [];
      const parseMetadata = learnerJsonMode
        ? { allowBoundedCleanup: true, formatCleanups: [] } : {};
      try {
        if (stream) {
          const source = this.#pi.streamSimple(model, request, options);
          for await (const event of source) events.push(event);
          response = await source.result();
        } else response = await this.#pi.completeSimple(model, request, options);
      } catch (error) {
        failureKind = 'provider_failure';
        httpStatus = Number.isInteger(error?.status) ? error.status : httpStatus;
        providerError = error?.code ?? error?.message;
      }
      const timing = observation?.finish();
      if (raw.providerResponsePending) {
        raw.providerResponse = await raw.providerResponsePending;
        delete raw.providerResponsePending;
      }
      if (proxyTag && response) {
        const { errorMessage, ...content } = response;
        response = { ...redactProviderValue(content, diagnosticSecrets), errorMessage };
      }
      const text = response ? textOf(response) : '';
      if (response) {
        failureKind = stopFailure(response, text, reasoningTokens, requestLimit, finish_reason);
        if (!failureKind) {
          try {
            if (!stream && (response.stopReason !== 'stop' || response.content.some(b => b.type === 'toolCall'))) throw new Error('JSON generation did not terminate normally');
            parsed = parse(text, response, originalOrder, parseMetadata);
          }
          catch (error) {
            failureKind = contractFailure;
            if (split) {
              validationCode = retryFeedbackCode(error);
              detail = `judge validation ${validationCode}`;
              raw.validationDetail = error instanceof Error ? error.message : String(error);
              if (proxyTag) raw.validationDetail = redactProviderValue(raw.validationDetail, diagnosticSecrets);
              feedback = validationCode;
            } else detail = error instanceof SyntaxError ? 'invalid JSON document' : error.message;
          }
          if (!failureKind && split) normalizations = Array.isArray(parsed?.normalized) ? parsed.normalized : [];
        }
      }
      if (outboundRejection || responseRouteMismatch) {
        failureKind = 'configuration';
        detail = outboundRejection ?? 'response judge route mismatch';
      } else if (failureKind === 'provider_failure') {
        httpStatus = Number(response?.errorMessage?.match(/^(?:\w+Error: )?(?:status(?: code)?[ :]+)?([45]\d\d)(?:\b|$)/i)?.[1]) || httpStatus;
        detail = signal.aborted ? 'local request timeout' : agentOptions.signal?.aborted ? 'agent request cancelled' : httpStatus >= 400 ? `provider HTTP ${httpStatus}` : response?.stopReason === 'aborted' ? 'provider request aborted' : 'provider request failed';
      }
      const usage = failureKind === 'provider_failure' && !response?.usage?.totalTokens ? null : response?.usage ?? null;
      const rateLimited = Boolean((split || this.#beforeAttempt) && failureKind === 'provider_failure' && (httpStatus === 429
        || /(?:\brate[_ -]?limit(?:ed|ing)?(?=\W|_|$)|\btoo many requests\b)/i.test(response?.errorMessage ?? providerError ?? '')));
      const attemptPath = this.#save({
        ...raw, response: response ? { ...response, errorMessage: undefined } : null,
        ...(parsed?.normalized !== undefined && { normalized: parsed.normalized }),
        ...(learnerJsonMode && { formatCleanups: parseMetadata.formatCleanups ?? [] }),
      }, {
        ...coordinates, ...this.identity(role), policyVersion: config.version ?? callPolicy.version, requestLimit,
        finish_reason: proxyTag ? redactProviderValue(finish_reason, diagnosticSecrets) : finish_reason, httpStatus,
        startedAt, elapsedMs: elapsed(), timeoutMs, ...timing,
        normalized: originalOrder.length > 0, originalOrder,
        ...(split && { retryFeedback: appliedFeedback ?? null, validationCode, normalizations }),
        ...(canonical === 'judge' && { judgementMode: schema ? 'json_schema' : 'text_json' }),
        ...(strictAudit && { auditMode: 'json_schema', ...(auditError && { auditError }), ...(auditUpstream && { auditUpstream }) }),
        ...(route && raw.outbound && { reasoningLimit: raw.outbound.reasoning?.max_tokens ?? null }),
        ...(route?.routing && (proxyTag && responseRouteMismatch ? redactProviderValue({ reportedProvider, reportedModel }, diagnosticSecrets)
          : { reportedProvider, reportedModel })),
        ...(scope.binding && { binding:scope.binding }),
        ...proxyTag,
        stopReason: response?.stopReason ?? null, reasoningTokens, usage, retryCount: split ? attempt - 1 : retries,
        visibleTokens: usage && reasoningTokens !== null && usage.output >= reasoningTokens ? usage.output - reasoningTokens : null,
        failureKind: failureKind ?? null, detail: detail ?? null,
      }, rateLimited);
      if (split) feedback = failureKind === contractFailure ? validationCode : null;
      if (!failureKind) {
        if (stream) {
          for (const event of events) stream.push(event);
          stream.end();
        }
        return { value: parsed, location: { ...coordinates, attemptPath } };
      }
      const stop = split
        ? failureKind === 'configuration' || agentOptions.signal?.aborted || attempt >= maxAttempts
        : callPolicy.retriesPerKind !== undefined && failureKind === 'configuration'
          || !rateLimited && retries++ >= callPolicy.retries || agentOptions.signal?.aborted;
      if (stop) {
        throw failure(failureKind, { ...coordinates, attemptPath }, detail);
      }
      if (!split) priorValidation = canonical === 'judge' && failureKind === contractFailure ? detail : undefined;
    }
  }
}
