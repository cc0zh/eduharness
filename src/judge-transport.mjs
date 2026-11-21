import { isDeepStrictEqual as same } from 'node:util';
import { conflictingReasoningKeys } from '../config/judge-reasoning-off.mjs';

const overrides = [...conflictingReasoningKeys, 'models', 'route'];
export const retryFeedbackCodes = Object.freeze(['structure', 'evidence', 'order', 'dependency', 'window']);
const retryFeedbackMessages = Object.freeze({
  structure: 'The previous response failed the required JSON structure rule. Return a complete replacement judgement for the same dimension.',
  evidence: 'The previous response failed the evidence binding rule. Return a complete replacement judgement for the same dimension.',
  order: 'The previous response failed the chronological order rule. Return a complete replacement judgement for the same dimension.',
  dependency: 'The previous response failed the dependency rule. Return a complete replacement judgement for the same dimension.',
  window: 'The previous response failed the observation-window rule. Return a complete replacement judgement for the same dimension.',
});
const genericRetryMessage = 'The previous response failed local validation. Return a complete replacement judgement for the same dimension.';

export function retryFeedbackCode(error) {
  if (retryFeedbackCodes.includes(error?.retryFeedback)) return error.retryFeedback;
  return error instanceof SyntaxError ? 'structure' : 'generic';
}

export function splitRetryPrompt(prompt, code) {
  if (code === null || code === undefined) return prompt;
  const message = Object.hasOwn(retryFeedbackMessages, code) ? retryFeedbackMessages[code] : genericRetryMessage;
  return `${prompt}\nLocal validation rejected the previous response. ${message}`;
}

export function judgeParameters(route, config) {
  const reasoning = config.reasoning ?? (config.reasoningMaxTokens === null ? undefined : { max_tokens: config.reasoningMaxTokens });
  return { reasoning, provider: route.routing ?? { require_parameters: true }, temperature: route.temperature };
}

export function matchesJudgeParameters({ model, max_tokens, max_completion_tokens, reasoning, provider, response_format, temperature }, names, route, config) {
  const expected = judgeParameters(route, config);
  const cap = max_tokens ?? max_completion_tokens;
  const count = expected.reasoning?.max_tokens ?? 0;
  const temperatureMatches = !Object.hasOwn(route, 'temperature')
    || (route.temperature === null ? temperature === undefined : temperature === route.temperature);
  return model === route.id && Number.isInteger(cap) && cap - count >= config.minVisibleTokens && cap <= config.maxTokens
    && same(reasoning, expected.reasoning) && response_format?.type === 'json_schema' && response_format.json_schema?.strict === true
    && temperatureMatches
    && (config.reasoning ? names?.includes('reasoning') && !conflictingReasoningKeys.some(key => names.includes(key)) : true)
    && (route.routing ? same(provider, expected.provider) && Array.isArray(names)
      && names.includes('reasoning') === (expected.reasoning !== undefined) && !overrides.some(key => names.includes(key))
      : provider?.require_parameters === true);
}

export function matchesReportedRoute(route, provider, model) {
  if (!route.routing) return true;
  const [endpoint] = route.routing.only;
  const slug = endpoint.split('/')[0];
  const aliases = route.providerAliases ?? [slug, endpoint];
  return (model == null || model === route.id) && (provider == null || aliases.includes(provider.toLowerCase()));
}
