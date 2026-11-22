import fs from 'node:fs';
import childProcess from 'node:child_process';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const syntheticTask = [{ id: 'S0-06', user_scenario: { persona: 'Synthetic learner', instructions: {
  task_instructions: 'This is a synthetic dialogue for testing runner receipts.',
  reason_for_call: 'Practice a problem.', known_info: 'Basic arithmetic.', unknown_info: 'The next step.', student_model: {},
} } }];
const realRead = fs.readFileSync;
fs.readFileSync = (path, ...args) => {
  const name = String(path).replaceAll('\\', '/');
  const encoding = typeof args[0] === 'string' ? args[0] : args[0]?.encoding;
  if (name.endsWith('/stage0_situated_tutoring.json')) {
    const data = Buffer.from(JSON.stringify(syntheticTask));
    return encoding ? data.toString(encoding) : data;
  }
  if (/(?:^|\/)(?:ruler-expand-v1\.json|s0-v1\.json|labels-locked\.csv|ruler-freeze\.json)$/.test(name)) throw Error('protected input disabled in runner tests');
  const value = realRead(path, ...args);
  return process.env.RUNNER_SOURCE_DRIFT && name.endsWith('/src/s1-binary.mjs') ? Buffer.concat([value, Buffer.from('\n')]) : value;
};
const realExec = childProcess.execFileSync;
childProcess.execFileSync = (file, args, ...rest) => process.env.RUNNER_HEAD_DRIFT && file === 'git' && args.at(-2) === 'rev-parse' && args.at(-1) === 'HEAD'
  ? `${'a'.repeat(40)}\n` : realExec(file, args, ...rest);
syncBuiltinESMExports();

const fetch = globalThis.fetch;
globalThis.fetch = (input, ...args) => {
  if (new URL(input?.url ?? input).hostname !== '127.0.0.1') throw Error('network disabled in runner tests');
  return fetch(input, ...args);
};

const probe = process.env.RUNNER_FAUX_PROBE;
function pauseAtCrashPoint() {
  process.send('crash point');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
}
if (probe === 'kill-after-start') {
  const link = fs.linkSync;
  fs.linkSync = (from, to) => {
    link(from, to);
    if (String(to).replaceAll('\\', '/').endsWith('/early.start.json')) pauseAtCrashPoint();
  };
  syncBuiltinESMExports();
} else if (probe === 'kill-after-settlement') {
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    rename(from, to);
    if (String(to).endsWith('/settlement.requests.jsonl') || String(to).endsWith('\\settlement.requests.jsonl')) {
      const event = JSON.parse(realRead(to, 'utf8').trim().split('\n').at(-1));
      if (event.type === 'settle' && event.meter.role === 'judge' && !event.meter.failureKind) pauseAtCrashPoint();
    }
  };
  syncBuiltinESMExports();
}
if (probe) {
  const original = import.meta.resolve('@earendil-works/pi-ai');
  const shim = 'data:text/javascript,' + encodeURIComponent(`
    export * from ${JSON.stringify(original)};
    import { fauxAssistantMessage, fauxProvider as realFaux } from ${JSON.stringify(original)};
    export const fauxProvider = options => globalThis.runnerFaux(realFaux(options), fauxAssistantMessage);
  `);
  registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@earendil-works/pi-ai' && context.parentURL.endsWith('/src/models.mjs')) return { url: shim, shortCircuit: true };
    return next(specifier, context);
  } });
  let cells = 0;
  globalThis.runnerFaux = (faux, response) => {
    const set = faux.setResponses;
    faux.setResponses = fixtures => {
      const cell = ++cells;
      if (fixtures.length !== 1) throw Error('expected a judge-only faux fixture');
      const [good] = fixtures;
      let attempt = 0;
      const factory = async () => {
        attempt++;
        if (probe === 'crash' && cell === 2) {
          process.send?.('second cell in flight');
          await sleep(60_000);
        }
        if (probe === 'stop' && cell === 1) {
          if (attempt === 1) return response('{');
          if (attempt === 2) return response('{"incomplete":true}', { stopReason: 'length' });
          return response('');
        }
        if (probe === 'stop') {
          await sleep(220);
          if (cell === 3) return response('{} extra');
        }
        if (probe === 'rate') {
          await sleep(cell === 1 ? 12 : 140);
          if (cell === 1 && attempt === 1) return response('', { stopReason: 'error', errorMessage: '429 rate limited' });
          if (cell === 1 && attempt === 2) return response('');
          if (cell === 1 && attempt === 3) return response('{} extra');
        }
        if (probe === 'delays') await sleep(cell === 1 ? 120 : 20);
        if ((probe === 'crash' || probe === 'low') && cell === 1) {
          const { answers } = JSON.parse(good.content[0].text);
          for (const [key, answer] of Object.entries(answers)) if (key !== 'P0') {
            answer.answer = false;
            for (const slot of Object.keys(answer.evidence)) answer.evidence[slot] = null;
          }
          return response(JSON.stringify({ answers }));
        }
        return good;
      };
      set(Array.from({ length: 12 }, () => factory));
    };
    return faux;
  };
}
