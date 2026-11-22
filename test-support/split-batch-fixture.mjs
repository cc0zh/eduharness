import { fauxAssistantMessage } from '@earendil-works/pi-ai';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { splitJudgeCandidates } from '../config/judge-bakeoff.mjs';
import { rounds, taskId } from '../config/e1.mjs';
import { hash } from '../contracts/core/schema.mjs';
import { bindBinary } from '../contracts/judge/binary.mjs';
import { binaryDimensionSchema, splitDimensions, splitBinaryIdentityVersion, splitBinaryOutputContract, splitBinaryRuler } from '../contracts/judge/binary-v3.mjs';
import { runCellBatch } from '../src/cell-batch.mjs';
import { contrastFolders } from '../src/judge-contrast-plan.mjs';
import { startRunReceipt } from '../src/run-receipts.mjs';
import { evaluationIdentity, executeCell } from '../src/run.mjs';

const [root, id, probe] = process.argv.slice(2);
const resume = process.argv.includes('--resume');
const scenario = 'S1-judge-bakeoff';
const mode = 'offline';
const concurrency = probe === 'provider-stop' ? 4 : 1;
const { policy, runId: registeredId } = splitJudgeCandidates.qwen;
const source = { prior: [] };
const messages = Array.from({ length: rounds * 2 + 1 }, (_, i) => ({
  id: `fixture:m:${i + 1}`, role: i % 2 ? 'teacher' : 'learner', turn: Math.ceil(i / 2), text: `Fixture message ${i + 1}`,
}));
const view = bindBinary(messages);
const bytes = Buffer.from(JSON.stringify(messages));
const planned = contrastFolders.map(id => {
  const [repetition, condition] = id.split('/');
  return { id, ...(condition && { repetition, condition }), sourceRunId: 'fixture', archive: `fixture/${id}`, transcriptSha256: hash(bytes) };
});
const budget = { typicalCalls: 108, maxCalls: 324, maxOutputTokens: 324 * policy.judge.maxTokens };
const limits = { maxAttempts: budget.maxCalls, maxRequestedOutputTokens: budget.maxOutputTokens };
const identity = { ...evaluationIdentity({ mode, limits, provenance: source }), version: splitBinaryIdentityVersion, ruler: splitBinaryRuler,
  judgeOutputContract: splitBinaryOutputContract, planned, policy, judgePolicy: 'qwen', registeredId };
const identityId = hash({ mode, scenario, identity });
const argv = ['--scenario', scenario, '--judge-policy', 'qwen', '--id', id, '--concurrency', String(concurrency), ...(resume ? ['--resume'] : [])];
const openRun = extra => {
  recorder = startRunReceipt({ root, id, mode, argv, ...extra });
  return recorder;
};
let recorder;
if (probe === 'interrupt' && !resume) {
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    rename(from, to);
    if (!String(to).endsWith(`${id}.requests.jsonl`)) return;
    const event = JSON.parse(fs.readFileSync(to, 'utf8').trimEnd().split('\n').at(-1));
    if (event.type === 'settle' && event.meter.call === 1 && !event.meter.failureKind) process.kill(process.pid, 'SIGKILL');
  };
  syncBuiltinESMExports();
}

const fill = schema => schema.properties ? Object.fromEntries(Object.entries(schema.properties).map(([key, property]) => [key, fill(property)]))
  : schema.type === 'boolean' ? false : null;

try {
  const result = await runCellBatch({ root, id, resume, openRun, concurrency }, { id, scenario, taskId, mode, identity, identityId, budget, limits, planned, source }, (folder, context) => {
    const row = planned.find(sample => sample.id === folder);
    const cursor = context.control.splitNext?.();
    const fixtures = splitDimensions.slice((cursor?.call ?? 1) - 1).map(dimension => {
      const body = fill(binaryDimensionSchema(view, dimension));
      if (probe === 'cross' && folder === 'r1/normal' && body.answers.S3) body.answers.S3 = { answer: true, evidence: { opening: 2 } };
      return fauxAssistantMessage(JSON.stringify(body));
    });
    if (probe === 'cross' && folder === 'r1/answer_dump') fixtures.unshift(fauxAssistantMessage('{'), fauxAssistantMessage(''), fauxAssistantMessage('{} extra'));
    if (probe === 'provider-stop') fixtures.splice(0, fixtures.length, ...Array.from({ length: 3 }, () => fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'provider unavailable' })));
    return executeCell({ ...context, id, mode, variant: row.condition ?? row.id, coordinate: row.repetition && { repetition: row.repetition },
      frozen: messages, frozenBytes: bytes, judgeOnly: row.sourceRunId, fixtures });
  });
  recorder.finish({ exitCode: result.acceptance ? 0 : 1, acceptance: result.acceptance });
  process.stdout.write(JSON.stringify(result));
  process.exitCode = result.acceptance ? 0 : 1;
} catch (error) {
  console.error(error.stack);
  process.exitCode = 2;
}
