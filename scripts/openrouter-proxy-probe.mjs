import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import http from 'node:http';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { requireThat } from '../contracts/core/schema.mjs';
import { make403Probe, probeMaxTokens } from '../config/judge-bakeoff-probe.mjs';
import { loadCredentials, requireCheckReceipt } from '../src/real-preflight.mjs';
import { Models } from '../src/models.mjs';

export const defaultReportPath = resolve('.tmp/scratch/judge-bakeoff/proxy-probe.md');
export const maxOpenRouterRequests = 4;
export const maxGeoRequests = 1;
const regionEndpoint = 'https://ipapi.co/json/';
const probeSchema = Type.Object({ ok: Type.Boolean() }, { additionalProperties: false });

export function selectProxySource(proxy, env = process.env) {
  const [source, raw] = proxy !== undefined ? ['argument', proxy] : [
    ['HTTPS_PROXY', env.HTTPS_PROXY?.trim() || env.https_proxy?.trim()],
    ['HTTP_PROXY', env.HTTP_PROXY?.trim() || env.http_proxy?.trim()],
  ].find(([, value]) => value) ?? [null, null];
  if (!source) return { source: null, proxy: null };
  const url = URL.parse(raw.trim());
  requireThat(url && ['http:', 'https:'].includes(url.protocol) && url.hostname
    && url.pathname === '/' && !url.search && !url.hash, 'proxy must be an http(s) URL without a path, query, or fragment');
  return { source, proxy: url.href.replace(/\/$/, '') };
}

const redactAddresses = text => String(text)
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, match => isIP(match) === 4 ? '[IP REDACTED]' : match)
  .replace(/(?<![0-9a-f:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![0-9a-f:])/gi,
    match => isIP(match) === 6 ? '[IP REDACTED]' : match);

const secretText = text => redactAddresses(text)
  .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[PROXY CREDENTIALS REDACTED]@')
  .replace(/\b(?:Bearer|Basic)\s+[^\s,;"'}]+/gi, '[REDACTED]')
  .replace(/\b(?:sk-or-v1-|sk-ant-api\d{2}-|AIza|sk-)[A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]')
  .replace(/(OPENROUTER_API_KEY|api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret)(\s*[:=]\s*)([^\s,;"'}]+)/gi, '$1$2[REDACTED]');

export function redactProxyResult(value, secrets = []) {
  const scrub = text => secretText(secrets.reduce((safe, secret) => safe.replaceAll(secret, '[REDACTED]'), text));
  const secretName = /(?:^|[_-])(authorization|api[_-]?key|key|token|secret|password|cookie|proxyurl)(?:$|[_-])/i;
  const scrubValue = (item, name) => {
    if (name === 'ip' || name === 'query') return '[REDACTED]';
    if (typeof item === 'string') return scrub(item);
    if (Array.isArray(item)) return item.map(value => scrubValue(value));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item)
      .filter(([key]) => !secretName.test(key)).map(([key, value]) => [scrub(key), scrubValue(value, key)]));
    return item;
  };
  return scrubValue(value);
}

function parseProbe(text) {
  const value = JSON.parse(text);
  requireThat(Value.Check(probeSchema, value) && value.ok === true, 'proxy probe JSON response mismatch');
  return value;
}

async function requestRegion() {
  let statusCode = null;
  try {
    const response = await fetch(regionEndpoint, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    statusCode = response.status;
    if (response.ok) {
      const data = await response.json();
      const code = data?.country_code;
      if (typeof code === 'string' && /^[A-Z]{2}$/.test(code)) {
        const country = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
        return { statusCode, region: { countryCode: code, country, status: 'available' } };
      }
    } else {
      void response.body?.cancel().catch(() => {});
    }
  } catch {}
  return { statusCode, region: { countryCode: null, country: null, status: 'unavailable' } };
}

export async function runProxyProbe({ proxy, env = process.env, runRoot = resolve('.tmp/scratch/judge-bakeoff/proxy-probe'),
  confirmCost, head } = {}) {
  const { source, proxy: resolvedProxy } = selectProxySource(proxy, env);
  requireThat(resolvedProxy, 'proxy address required: pass --proxy or configure HTTPS_PROXY / HTTP_PROXY');
  requireThat(confirmCost === true, 'real proxy probe requires --confirm-cost');
  requireThat(typeof http.setGlobalProxyFromEnv === 'function', 'use Node.js with http.setGlobalProxyFromEnv (tested on 24.20)');
  requireThat(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'proxy probe requires TLS certificate verification');
  loadCredentials(['judge']);
  const key = process.env.OPENROUTER_API_KEY?.trim();
  requireThat(key, 'missing OPENROUTER_API_KEY');
  const url = new URL(resolvedProxy);
  const user = decodeURIComponent(url.username), password = decodeURIComponent(url.password);
  const secrets = [key, resolvedProxy, url.origin, url.username, url.password, user, password,
    user && Buffer.from(`${user}:${password}`).toString('base64')].filter(Boolean).sort((a, b) => b.length - a.length);
  const sanitize = value => redactProxyResult(value, secrets);
  const id = `proxy-probe-${randomUUID()}`;
  const runDir = join(resolve(runRoot), id);
  const results = { id, head, proxy: { source }, proxyUsed: true, region: null,
    geoRequests: 0, openRouterRequests: 0, reservedRequests: 0, requestedOutputTokens: 0,
    limits: { maxGeoRequests, maxOpenRouterRequests, maxTokensPerRequest: probeMaxTokens }, candidates: [] };
  const requestLog = join(runDir, 'requests.jsonl');
  const append = event => appendFileSync(requestLog, `${JSON.stringify(sanitize(event))}\n`);
  const writeJson = (name, value, flag = 'w') => writeFileSync(join(runDir, name), `${JSON.stringify(sanitize(value), null, 2)}\n`, { flag });
  const restore = http.setGlobalProxyFromEnv({ HTTPS_PROXY: resolvedProxy, HTTP_PROXY: resolvedProxy, NO_PROXY: '' });
  try {
    mkdirSync(runDir, { recursive: true });
    results.geoRequests = 1;
    append({ type: 'region_start' });
    results.region = await requestRegion();
    append({ type: 'region_end', ...results.region });

    for (const candidateKey of ['haiku', 'gemini']) {
      requireThat(results.openRouterRequests < maxOpenRouterRequests, 'proxy probe hard OpenRouter request cap reached');
      const setting = make403Probe(candidateKey, 'A');
      const attemptPath = `${candidateKey}-A.json`;
      let saved, started = false;
      const recorder = { append(event) {
        if (event.type === 'request_start') {
          requireThat(!started && results.openRouterRequests < maxOpenRouterRequests
            && results.openRouterRequests < results.reservedRequests, 'proxy probe hard OpenRouter request cap reached');
          started = true;
          results.openRouterRequests++;
        }
        append({ ...event, candidate: candidateKey, step: 'A' });
      } };
      const models = new Models({ mode: 'real', roles: ['judge'], judgePolicy: candidateKey, judgeProbeStep: 'A',
        cell: `${id}/${candidateKey}`, recorder,
        reserve(_where, limit) {
          requireThat(limit === probeMaxTokens && results.reservedRequests < maxOpenRouterRequests, 'proxy probe request or output cap exceeded');
          results.reservedRequests++;
          results.requestedOutputTokens += limit;
        },
        save(raw, meter) {
          const { binding, outbound, providerResponse } = raw;
          saved = { raw: { binding, outbound, providerResponse }, meter, pid: process.pid };
          writeJson(attemptPath, saved, 'wx');
          return attemptPath;
        } });
      let accepted = false, failure = null;
      try {
        const result = await models.complete({ role: 'judge', turn: 1, call: 1,
          binding: { proxyProbeId: id, candidate: candidateKey, step: 'A', head } },
          { systemPrompt: '', messages: [{ role: 'user', timestamp: Date.now(), content: 'Reply with the JSON object {"ok":true}.' }] },
          parseProbe, probeSchema);
        accepted = result.value.ok === true;
      } catch (error) { failure = { kind: error.failure?.kind ?? 'probe_failure', detail: error.failure?.detail ?? 'probe failed' }; }
      results.candidates.push({ candidate: candidateKey, model: setting.route.id, providerPin: setting.route.routing.only[0], step: 'A', accepted,
        attemptPath, httpStatus: saved?.meter.httpStatus ?? null, failureKind: saved?.meter.failureKind ?? failure?.kind ?? null,
        providerResponse: saved?.raw.providerResponse ?? null, reportedProvider: saved?.meter.reportedProvider ?? null,
        reportedModel: saved?.meter.reportedModel ?? null, failure });
      writeJson('result.json', results);
    }
  } finally {
    restore();
  }
  return { ...sanitize(results), runDir };
}

export function renderProxyReport(input) {
  const results = redactProxyResult(input);
  const accepted = results.candidates.filter(candidate => candidate.accepted).length;
  const geoDenied = ({ providerResponse }) => providerResponse?.status === 403
    && providerResponse.body.includes('Gate Endpoints with Geo Restrictions');
  const verdict = accepted === 2 ? '通过' : accepted ? '部分通过'
    : results.candidates.length === 2 && results.candidates.every(geoDenied) ? '仍被地区拒绝' : '未能验证';
  const pathFor = (name) => results.runDir
    ? relative(dirname(defaultReportPath), join(results.runDir, name)).replaceAll('\\', '/') : name;
  const diagnostics = results.candidates.map(candidate => {
    const response = candidate.providerResponse;
    const indent = value => value.split('\n').map(line => '    ' + line).join('\n');
    return [
      `### ${candidate.model ?? candidate.candidate} / ${candidate.providerPin ?? 'A'}`, '',
      `HTTP ${candidate.httpStatus ?? '无响应'}；${candidate.accepted ? '通过 JSON 校验' : candidate.failure?.detail ?? '未通过'}。`,
      `实报供应商 ${candidate.reportedProvider ?? '未知'}，模型 ${candidate.reportedModel ?? '未知'}。`,
      '', '诊断头：', '', indent(JSON.stringify(response?.headers ?? {})), '',
      `响应正文${response?.bodyTruncated ? '（截断）' : ''}：`, '', indent(response?.body || '无正文'), '',
      ...(candidate.attemptPath ? [`[调用原件](${pathFor(candidate.attemptPath)})`, ''] : []),
    ].join('\n');
  }).join('\n\n');
  return [
    '# OpenRouter 代理出口 403 探针', '',
    `本次代理出口：**${verdict}**。两个模型中 ${accepted} 个通过 A 探针。`,
    `代理来源 ${results.proxy.source ?? '未知'}。地区查询 HTTP ${results.region?.statusCode ?? '无响应'}，出口地区 ${results.region?.region?.country ?? '未知'}（${results.region?.region?.countryCode ?? '未知'}）。不记录 IP 或代理地址。`,
    `OpenRouter 出站尝试 ${results.openRouterRequests}/${maxOpenRouterRequests} 次，地区查询 ${results.geoRequests}/${maxGeoRequests} 次，每次生成上限 ${probeMaxTokens} token。`,
    `运行 ID：${results.id}。运行 HEAD：${results.head ?? '未知'}。`,
    ...(results.runDir ? [`[请求日志](${pathFor('requests.jsonl')})`, ''] : ['']),
    diagnostics,
    ...(accepted === 2 ? ['接入 bakeoff 时，给该运行显式配置代理，保留固定端点与 strict schema，把代理方式纳入新评测身份。探针通过不等于 bakeoff 达线。未实施接入，也未补跑。', ''] : []),
  ].join('\n');
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: { proxy: { type: 'string' }, 'confirm-cost': { type: 'boolean' } } }));
  } catch {
    throw Error('usage: node scripts/openrouter-proxy-probe.mjs [--proxy <url>] --confirm-cost');
  }
  requireThat(selectProxySource(values.proxy).proxy, 'proxy address required: pass --proxy or configure HTTPS_PROXY / HTTP_PROXY');
  requireThat(values['confirm-cost'], 'real proxy probe requires --confirm-cost');
  const { head } = requireCheckReceipt();
  mkdirSync(dirname(defaultReportPath), { recursive: true });
  const report = openSync(defaultReportPath, 'wx');
  try {
    const result = await runProxyProbe({ proxy: values.proxy, confirmCost: true, head });
    writeFileSync(report, renderProxyReport(result));
    console.log(JSON.stringify({ id: result.id, proxySource: result.proxy.source, country: result.region.region.countryCode,
      geoRequests: result.geoRequests, openRouterRequests: result.openRouterRequests,
      candidates: result.candidates.map(({ candidate, httpStatus, accepted }) => ({ candidate, httpStatus, accepted })) }));
    if (!result.candidates.every(candidate => candidate.accepted)) process.exitCode = 1;
  } catch (error) {
    writeFileSync(report, '# OpenRouter 代理出口 403 探针\n\n未能验证。运行未完整结算，不自动重跑。\n');
    throw error;
  } finally {
    closeSync(report);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(secretText(error.message)); process.exitCode = 2; });
}
