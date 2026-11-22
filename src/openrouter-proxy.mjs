const PROXY_ENV_NAMES = Object.freeze(['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']);
const UNAVAILABLE = 'OpenRouter proxy unavailable: set HTTPS_PROXY or HTTP_PROXY to an http(s) URL with TLS verification enabled';

function staticFailure() {
  return new Error(UNAVAILABLE);
}

export function resolveOpenRouterProxySource(env = process.env) {
  if (!env || typeof env !== 'object') throw staticFailure();
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw staticFailure();
  const source = PROXY_ENV_NAMES.find(name => typeof env[name] === 'string' && env[name].trim().length > 0);
  if (!source) throw staticFailure();
  let url;
  try {
    url = new URL(env[source].trim());
  } catch {
    throw staticFailure();
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw staticFailure();
  return { source, proxy: url.href.replace(/\/$/, '') };
}
