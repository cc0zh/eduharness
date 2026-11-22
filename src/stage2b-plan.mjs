import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { policy, rounds } from '../config/e1.mjs';
import { stage2bHoldoutRoot } from '../config/stage2b-headroom.mjs';
export { stage2bScenario } from '../config/stage2b-headroom.mjs';
import { exact, hash, requireThat } from '../contracts/core/schema.mjs';
import { readTask } from '../contracts/dataset/schema.mjs';
import { splitDimensions } from '../contracts/judge/binary-v3.mjs';
import { splitStopRules } from './split-judge-state.mjs';
import { workingJudge } from './working-judge.mjs';

export const stage2bRunId = 'stage2b-headroom-real-01';
export const stage2bEstimateId = 'stage2b-headroom-estimate-01';
export const stage2bConcurrency = 4;
export const stage2bStudents = Object.freeze(['default', 'stubborn', 'answer-seeker']);
export const stage2bMethodSha = 'b820f7360bf23399e5c9aadf102d0b8359f690247c88bec75892f02211f7d8c9';
export const stage2bAddendumSha = '18e764fd389caed3f7b3d00223866b01a16520f41f7c40ec52b7e4967031f194';
export const stage2bManifestSha = 'b6650ca5b87e84740a2e2f17340bbc472f697cbd2bb75e407d57e6d539ffe677';
export const stage2bLimits = Object.freeze({ maxAttempts: 2592, maxRequestedOutputTokens: 11999232 });
export const stage2bStop = Object.freeze(splitStopRules(48));
export const stage2bAttemptLimits = () => ({ teacher: policy.teacher.maxTokens, learner: policy.learner.maxTokens, judge: workingJudge.policy.judge.maxTokens });
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const idPattern = /^TA2B-F\d{2}-[AB]$/;

export function stage2bBudget() {
  const limits = stage2bAttemptLimits();
  const teacher = rounds * policy.teacher.requestsPerTurn, learner = rounds, judge = splitDimensions.length;
  const cells = 8 * stage2bStudents.length * 2;
  const logicalCalls = cells * (teacher + learner + judge);
  return { typicalCalls: cells * (rounds + learner + judge), logicalCalls, maxCalls: logicalCalls * (policy.retries + 1),
    maxOutputTokens: cells * (teacher * limits.teacher + learner * limits.learner + judge * limits.judge) * (policy.retries + 1) };
}

export function stage2bPlan(dev) {
  requireThat(Array.isArray(dev) && dev.length === 8 && dev.every((row, i) => exact(row, ['id', 'family', 'sha256'])
    && idPattern.test(row.id) && row.family === row.id.slice(0, -2) && sha(row.sha256) && (i === 0 || dev[i - 1].id < row.id))
    && new Set(dev.map(row => row.family)).size === 4, 'expected eight ordered dev tasks from four families');
  return ['r1', 'r2'].flatMap(repetition => dev.flatMap(({ id: taskId, family }) => stage2bStudents.map(student => ({
    folder: `${repetition}/${taskId}/${student}`, taskId, family, student, repetition,
  }))));
}

export function stage2bRegistration(method, addendum) {
  requireThat(hash(method) === stage2bMethodSha && hash(addendum) === stage2bAddendumSha, 'stage 2b preregistration or path addendum SHA256 mismatch');
  const blocks = [...addendum.toString('utf8').matchAll(/^```json\r?\n([\s\S]*?)\r?\n```$/gm)];
  requireThat(blocks.length === 1, 'expected one stage 2b addendum machine block');
  const plan = JSON.parse(blocks[0][1]);
  requireThat(exact(plan, ['manifestSha256', 'dev']) && plan.manifestSha256 === stage2bManifestSha, 'unexpected stage 2b dataset manifest SHA256');
  stage2bPlan(plan.dev);
  return plan;
}

function entry(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export function loadStage2bDev({ primary = process.env.TEACHARENA_STAGE2_HOLDOUT_ROOT?.trim() || stage2bHoldoutRoot, backup, manifestSha256, dev }) {
  stage2bPlan(dev);
  requireThat(sha(manifestSha256), 'invalid dataset manifest SHA256');
  for (const [source, root] of [['primary', primary], ['backup', backup]]) {
    if (!root) continue;
    const manifestPath = join(root, 'manifest.json'), directory = join(root, 'dev');
    const parent = entry(root);
    if (!parent) continue;
    requireThat(parent.isDirectory() && !parent.isSymbolicLink(), 'stage 2b input root must be a regular directory');
    const manifestFile = entry(manifestPath), devDir = entry(directory);
    if (!manifestFile || !devDir) continue;
    requireThat(manifestFile.isFile() && !manifestFile.isSymbolicLink() && devDir.isDirectory() && !devDir.isSymbolicLink(),
      'stage 2b manifest and dev directory must not redirect');
    const bytes = readFileSync(manifestPath);
    if (hash(bytes) !== manifestSha256) continue;
    const expected = new Set(dev.map(({ id }) => id));
    const manifest = JSON.parse(bytes);
    requireThat(Array.isArray(manifest), 'expected stage 2b manifest array');
    const devRows = manifest.filter(row => expected.has(row?.id)).sort((a, b) => a.id.localeCompare(b.id));
    requireThat(same(devRows, dev), 'manifest dev projection differs from the registered list');
    const names = readdirSync(directory, { withFileTypes: true });
    requireThat(names.length === dev.length && names.every(file => file.isFile() && !file.isSymbolicLink() && expected.has(file.name.slice(0, -5))
      && file.name.endsWith('.json')), 'dev directory must contain exactly the registered regular task files');
    const tasks = new Map(dev.map(({ id, sha256 }) => {
      const input = readFileSync(join(directory, `${id}.json`));
      requireThat(hash(input) === sha256, `dev file digest differs: ${id}`);
      const rows = JSON.parse(input);
      requireThat(Array.isArray(rows) && rows.length === 1, `expected one task in dev file: ${id}`);
      return [id, readTask(rows, id)];
    }));
    return { source, directory, manifestSha256, dev, tasks };
  }
  throw Error('no configured stage 2b root has dev and the matching manifest SHA256');
}

export const stage2bCallId = ({ folder, role, turn, call, attempt }) => `${folder.replaceAll('/', ':')}:${role}:${turn}:${call}:${attempt}`;
export const stage2bCallPath = ({ folder, role, turn, call, attempt }) => `${folder}/calls/${role}-${turn}-${call}-${attempt}.json`;
