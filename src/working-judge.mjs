import { splitJudgeCandidates } from '../config/judge-bakeoff.mjs';
import { hash } from '../contracts/core/schema.mjs';
import { splitBinaryOutputContract, splitBinaryRuler } from '../contracts/judge/binary-v3.mjs';
import { gradeBinaryDimension } from './binary-judge-v3.mjs';
import { Models } from './models.mjs';

const judgePolicy = 'gemini';
const { policy, route } = splitJudgeCandidates[judgePolicy];

export const workingJudge = Object.freeze({
  ruler: splitBinaryRuler,
  judgeOutputContract: splitBinaryOutputContract,
  policy,
  routes: Object.freeze({ judge: route }),
  judgePolicy,
  judgeTransport: Object.freeze({ proxied: true, proxySource: 'HTTPS_PROXY' }),
});

export const workingJudgeFingerprintFiles = Object.freeze([
  'package-lock.json', 'config/e1.mjs', 'config/judge-bakeoff.mjs', 'contracts/judge/binary.mjs',
  'contracts/judge/binary-v3.mjs', 'src/binary-judge-v3.mjs', 'src/models.mjs', 'src/judge-transport.mjs',
  'src/openrouter-proxy.mjs', 'src/provider-response-diagnostics.mjs', 'src/split-judge-state.mjs', 'src/split-judge-replay.mjs', 'src/working-judge.mjs',
]);

export function workingJudgeFingerprint(sources) {
  const { ruler, judgeOutputContract, policy, routes, judgeTransport } = workingJudge;
  const judgingSources = Object.fromEntries(workingJudgeFingerprintFiles.map(path => {
    const sha = sources[path];
    if (typeof sha !== 'string' || !/^[a-f0-9]{64}$/.test(sha)) throw new Error(`missing judge source digest: ${path}`);
    return [path, sha];
  }));
  return hash({ ruler, judgeOutputContract, policy, routes, judgeTransport, sources: judgingSources });
}

export function createWorkingJudge({ mode, responses, save, recorder, cell, beforeAttempt }) {
  if (!['offline', 'real'].includes(mode)) throw new Error('working judge requires an explicit mode');
  const models = new Models({ mode, responses, save, recorder, cell, beforeAttempt, judgePolicy, roles: ['judge'],
    judgeProxySource: mode === 'real' ? workingJudge.judgeTransport.proxySource : undefined });
  return (messages, scope) => gradeBinaryDimension(models, messages, { ...scope, ruler: workingJudge.ruler });
}
