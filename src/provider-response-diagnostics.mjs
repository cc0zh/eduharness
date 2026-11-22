export const MAX_PROVIDER_DIAGNOSTIC_BODY_BYTES = 16_384;
const ALLOWED_HEADERS = new Set(['content-type', 'content-length', 'retry-after', 'x-request-id', 'request-id']);
const SENSITIVE_NAME = /(^|[-_\s])(authorization|proxy-authorization|api[_\s-]?key|key|access[_\s-]?token|refresh[_\s-]?token|token|secret)($|[-_\s])/i;
const TOKEN_TEXT = /\b(?:sk-or-v1-|sk-ant-api\d{2}-|AIza|sk-)[A-Za-z0-9_-]{8,}\b/gi;
const BEARER_TEXT = /\bBearer\s+[^\s,;"'}]+/gi;
const SECRET_FIELD_NAMES = 'authorization|proxy-authorization|OPENROUTER_API_KEY|api[_\\s-]?key|access[_\\s-]?token|refresh[_\\s-]?token|client[_\\s-]?secret|key|token|secret';
const QUOTED_SECRET_FIELD = new RegExp(`(["'])(${SECRET_FIELD_NAMES})\\1(\\s*:\\s*)(["'])((?:\\\\.|(?!\\4)[\\s\\S])*)(?:\\4|$)`, 'gi');
const PLAIN_QUOTED_SECRET_FIELD = new RegExp(`\\b(${SECRET_FIELD_NAMES})(\\s*[:=]\\s*)(["'])((?:\\\\.|(?!\\3)[\\s\\S])*)(?:\\3|$)`, 'gi');
const PLAIN_SECRET_ASSIGNMENT = new RegExp(`(?<!["'])\\b(${SECRET_FIELD_NAMES})(\\s*[:=]\\s*)(?:(Bearer|Basic)\\s+)?([^\\s,;}"']+)`, 'gi');
const AUTH_SCHEME = /^\s*(Bearer|Basic)\s+/i;
const PROXY_USERINFO = /(\bhttps?:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi;

function scrubSecrets(value, secrets) {
  return secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), value);
}

function sortedSecrets(secrets) {
  return (Array.isArray(secrets) ? secrets : []).filter(secret => typeof secret === 'string' && secret.length > 0)
    .sort((left, right) => right.length - left.length);
}

function redactText(value, secrets = []) {
  const redactField = (name, separator, quote, fieldValue, keyQuote = '') => {
    const scheme = AUTH_SCHEME.exec(fieldValue)?.[1];
    return `${keyQuote}${name}${keyQuote}${separator}${quote}${scheme ? `${scheme} ` : ''}[REDACTED]${quote}`;
  };
  return scrubSecrets(value, secrets)
    .replace(PROXY_USERINFO, '$1[PROXY CREDENTIALS REDACTED]@')
    .replace(QUOTED_SECRET_FIELD, (_match, quote, name, separator, valueQuote, fieldValue) =>
      redactField(name, separator, valueQuote, fieldValue, quote))
    .replace(PLAIN_QUOTED_SECRET_FIELD, (_match, name, separator, valueQuote, fieldValue) =>
      redactField(name, separator, valueQuote, fieldValue))
    .replace(PLAIN_SECRET_ASSIGNMENT, (_match, name, separator, scheme) => `${name}${separator}${scheme ? `${scheme} ` : ''}[REDACTED]`)
    .replace(BEARER_TEXT, 'Bearer [REDACTED]')
    .replace(TOKEN_TEXT, '[REDACTED]');
}

function redactValue(value, fieldName = '', secrets = []) {
  if (SENSITIVE_NAME.test(fieldName)) return '[REDACTED]';
  if (typeof value === 'string') return redactText(value, secrets);
  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === 'string'
      && SENSITIVE_NAME.test(value[0].replaceAll('_', '-'))) return [value[0], '[REDACTED]'];
    return value.map(item => redactValue(item, '', secrets));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [scrubSecrets(key, secrets), redactValue(item, key, secrets)]));
  }
  return value;
}

export const redactProviderValue = (value, secrets) => redactValue(value, '', sortedSecrets(secrets));

function diagnosticHeaders(headers, secrets = []) {
  const captured = {};
  headers?.forEach((value, name) => {
    const key = name.toLowerCase();
    if (!ALLOWED_HEADERS.has(key) && !key.startsWith('x-openrouter-')) return;
    if (SENSITIVE_NAME.test(key)) return;
    captured[scrubSecrets(key, secrets)] = redactText(value, secrets);
  });
  return Object.fromEntries(Object.entries(captured).sort(([left], [right]) => left.localeCompare(right)));
}

async function readBoundedBody(response, maxBodyBytes) {
  if (!response.body) return { text: '', truncated: false };
  const reader = response.clone().body?.getReader();
  if (!reader) return { text: '', truncated: false };
  const chunks = [];
  let length = 0, truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const available = Math.max(0, maxBodyBytes - length);
    const take = Math.min(available, value.byteLength);
    if (take) {
      chunks.push(value.subarray(0, take));
      length += take;
    }
    if (take < value.byteLength) {
      truncated = true;
      void reader.cancel().catch(() => {});
      break;
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), truncated };
}

function boundedUtf8(value, maxBytes) {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) return { value, truncated: false };
  let end = maxBytes;
  while (end > 0) {
    try {
      return { value: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end)), truncated: true };
    } catch {
      end--;
    }
  }
  return { value: '', truncated: true };
}

export async function captureProviderResponse(response, { maxBodyBytes = MAX_PROVIDER_DIAGNOSTIC_BODY_BYTES, secrets = [] } = {}) {
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > MAX_PROVIDER_DIAGNOSTIC_BODY_BYTES) {
    throw new RangeError(`maxBodyBytes must be an integer from 1 through ${MAX_PROVIDER_DIAGNOSTIC_BODY_BYTES}`);
  }
  const orderedSecrets = sortedSecrets(secrets);
  let body = '';
  let bodyTruncated = false;
  try {
    const read = await readBoundedBody(response, maxBodyBytes);
    bodyTruncated = read.truncated;
    try {
      body = JSON.stringify(redactValue(JSON.parse(read.text), '', orderedSecrets));
    } catch {
      body = redactText(read.text, orderedSecrets);
    }
    const bounded = boundedUtf8(body, maxBodyBytes);
    body = bounded.value;
    bodyTruncated ||= bounded.truncated;
  } catch {
    body = '[REDACTED: response body unavailable]';
  }
  return { status: response.status, headers: diagnosticHeaders(response.headers, orderedSecrets), body, bodyTruncated };
}
