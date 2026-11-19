import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runId } from '../contracts/artifacts/schema.mjs';
import { hash, requireThat } from '../contracts/core/schema.mjs';
import { loadRulerSplit } from '../contracts/dataset/ruler-expand.mjs';
import { ruler } from '../contracts/judge/schema.mjs';
import { verifyRun } from '../src/run-receipts.mjs';

const baseline = {
  ruler: 'e1-numbered-evidence-v3',
  fingerprint: '7af16380ef04a8a1af5892859d3bfc8d74cd4477b939e7d614dd79f7b134e6c4',
};
const rubricFiles = ['contracts/judge/schema.mjs', 'contracts/judge/README.md', 'src/judge.mjs'];
const fingerprint = () => hash(rubricFiles.map(path => [path, hash(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n'))]));
const referenceFile = new URL('../contracts/judge/ruler-change.json', import.meta.url);
const readReference = () => existsSync(referenceFile) ? JSON.parse(readFileSync(referenceFile, 'utf8')) : null;

export function checkRulerChange({ current = { ruler, fingerprint: fingerprint() }, root = 'runs', reference = readReference() } = {}) {
  if (current.ruler === baseline.ruler && current.fingerprint === baseline.fingerprint) return;
  requireThat(reference, 'ruler change requires a training run reference');
  requireThat(current.ruler !== baseline.ruler, 'ruler change requires a new ruler version');
  requireThat(reference.ruler === current.ruler && reference.fingerprint === current.fingerprint, 'training reference does not match the changed ruler');
  const sourceId = runId(reference.trainingRunId);
  const verification = verifyRun(root, sourceId);
  requireThat(verification.verified && verification.mode === 'real' && verification.acceptance === true, 'ruler change requires a verified real training run');
  const receiptBytes = readFileSync(join(root, '_receipts', `${sourceId}.json`));
  requireThat(hash(receiptBytes) === reference.trainingReceiptSha256, 'training receipt hash mismatch');
  const receipt = JSON.parse(receiptBytes);
  const split = loadRulerSplit();
  const dir = join(root, sourceId);
  const manifestBytes = readFileSync(join(dir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  requireThat(receipt.manifestSha256 === hash(manifestBytes) && receipt.identityId === manifest.identityId && manifest.id === sourceId && manifest.mode === 'real' && manifest.scenario === 'ruler-expand' && manifest.phase === 'train' && manifest.identity.ruler === baseline.ruler && manifest.identity.dataset.trainSha256 === split.trainSha256, 'invalid training reference identity or split');
  requireThat(hash(receipt.frozen?.map(record => record.taskId) ?? []) === hash(split.train), 'training reference must cover the locked training dialogues');
  for (const { taskId, condition, path, transcriptSha256 } of receipt.frozen) {
    requireThat(/^(normal|answer_dump|lecture|sycophant_close|no_teach)$/.test(condition) && path === `${taskId}/${condition}/transcript.json` && transcriptSha256 === hash(readFileSync(join(dir, path))), `training reference transcript hash mismatch for ${taskId}`);
  }
  const labels = readFileSync(join(dir, 'labels-locked.csv'));
  requireThat(labels.length > 0 && reference.labelsSha256 === hash(labels), 'locked human label hash mismatch');
}
