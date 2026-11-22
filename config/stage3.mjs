import { routes } from './e1.mjs';
import { splitJudgeCandidates } from './judge-bakeoff.mjs';

export const stage3Scenario = 'stage3-state-machine';
export const stage3ProxySource = 'HTTPS_PROXY';
export const stage3Concurrency = 4;
export const stage3DevRoot = 'D:/Archive/teacharena/stage2-holdout';
export const stage3DevTasks = Object.freeze([
  ['TA2B-F01-A', '33fae356200d35f6ec83f7f5af791b73fbe62660e19d829568b116b68c65b6d3'],
  ['TA2B-F01-B', '660a3330ee041c9daccbce25399ad9411e641eaf6b96eaba7ce396a5dfb06c97'],
  ['TA2B-F09-A', 'db9165f46c243c04e2ce8cdb917c7920f1c1e6c483b05860637eee2c2ba12618'],
  ['TA2B-F09-B', '5e6c8e0f79917ad9756214391f005662f9169a64a98fe06e7120bd9353c08012'],
  ['TA2B-F12-A', '082e3d4577bae4d40d85ca26437d50c81d8277674aea0809dc0d74ac8daaad0e'],
  ['TA2B-F12-B', 'e72cefad2e8db0599f0387edd26b5a485889659772ba9aa1a99623de808779a5'],
  ['TA2B-F18-A', 'd3b449d0bb91d19d8fa2b735ea3ccc753a32fe93781f6e21ee3551103ea98661'],
  ['TA2B-F18-B', '33d4568a1c07e85a1ffafb700689080a69113590e3feceb9fb551f10ae47febc'],
].map(([id, sha256]) => Object.freeze({ id, family: id.slice(0, -2), sha256 })));
export const observerRoute = Object.freeze({ ...routes.teacher, responseFormat: 'json_object' });
export const observerPolicy = Object.freeze({ version: 'stage3-observer-v1', maxTokens: 768, thinking: 'off', timeoutMs: 20_000 });
const haiku = splitJudgeCandidates.haiku;
export const agencyAudit = Object.freeze({
  route: haiku.route, policy: Object.freeze({ ...haiku.policy.judge, version: 'stage3-agency-audit-v1' }), requiresProxy: true,
});
