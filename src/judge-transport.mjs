import { isDeepStrictEqual as same } from 'node:util';
import { conflictingReasoningKeys } from '../config/judge-reasoning-off.mjs';

const overrides = [...conflictingReasoningKeys, 'models', 'route'];

export function judgeParameters(route, config) {
  const reasoning = config.reasoning ?? (config.reasoningMaxTokens === null ? undefined : { max_tokens: config.reasoningMaxTokens });
  return { reasoning, provider: route.routing ?? { require_parameters: true } };
}

export function matchesJudgeParameters({ model, max_tokens, max_completion_tokens, reasoning, provider, response_format }, names, route, config) {
  const expected = judgeParameters(route, config);
  const cap = max_tokens ?? max_completion_tokens;
  const count = expected.reasoning?.max_tokens ?? 0;
  return model === route.id && Number.isInteger(cap) && cap - count >= config.minVisibleTokens && cap <= config.maxTokens
    && same(reasoning, expected.reasoning) && response_format?.type === 'json_schema' && response_format.json_schema?.strict === true
    && (config.reasoning ? names?.includes('reasoning') && !conflictingReasoningKeys.some(key => names.includes(key)) : true)
    && (route.routing ? same(provider, expected.provider) && Array.isArray(names)
      && names.includes('reasoning') === (expected.reasoning !== undefined) && !overrides.some(key => names.includes(key))
      : provider?.require_parameters === true);
}

export function matchesReportedRoute(route, provider, model) {
  if (!route.routing) return true;
  const [endpoint] = route.routing.only;
  const slug = endpoint.split('/')[0];
  return (model == null || model === route.id) && (provider == null || [slug, endpoint].includes(provider.toLowerCase()));
}
