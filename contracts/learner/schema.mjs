import { exact, nonblank, requireThat } from '../core/schema.mjs';

export const learnerFormat = 'Return one JSON object with exactly one key, "text", a nonempty student utterance. Do not use fences, analysis, notes, or extra text.';
export const learnerJsonExample = '\nExample JSON output: {"text":"<learner utterance>"}';

const learnerObject = /^\{[ \t\r\n]*("(?:[^"\\\x00-\x1f]|\\["\\/bfnrt]|\\u[\da-fA-F]{4})*")[ \t\r\n]*:[ \t\r\n]*("(?:[^"\\\x00-\x1f]|\\[^\x00-\x1f])*")[ \t\r\n]*\}/d;
const openFence = /(?:^|\n)[ \t]*```(?:json)?[ \t]*\r?\n[ \t\r\n]*$/i;
const closeFence = /^[ \t]*\r?\n[ \t\r\n]*```[ \t]*(?=\r?\n|$)/;

function repairString(quoted, cleanups, offset) {
  return quoted.replace(/\\(?:u[\da-fA-F]{4}|[^\r\n])/g, (escape, index) => {
    if (/^\\[bfnrt]$/.test(escape) && /^[\p{L}{]/u.test(quoted.slice(index + 2))) {
      throw new Error('ambiguous JSON control escape');
    }
    if (escape === '\\u') throw new SyntaxError('invalid Unicode escape');
    if (/^\\(?:["\\/bfnrt]|u[\da-fA-F]{4})$/.test(escape)) return escape;
    cleanups.push({ kind: 'unescaped_backslash', offset: offset + index });
    return `\\${escape}`;
  });
}

function cleanLearnerJson(text, cleanups) {
  const start = text.indexOf('{');
  if (start < 0) throw new SyntaxError('invalid JSON document');
  const object = learnerObject.exec(text.slice(start));
  if (!object || JSON.parse(object[1]) !== 'text') throw new SyntaxError('invalid learner JSON object');
  const prefix = text.slice(0, start), suffix = text.slice(start + object[0].length);
  const fenced = openFence.test(prefix) && closeFence.test(suffix);
  const leading = fenced ? prefix.replace(openFence, '') : prefix;
  const trailing = fenced ? suffix.replace(closeFence, '') : suffix;
  if (/[\[\]{}"]|```/.test(leading + trailing)) throw new SyntaxError('ambiguous JSON wrapper');
  if (fenced) cleanups.push({ kind: 'code_fence', count: 2 });
  if (leading.trim()) cleanups.push({ kind: 'leading_text', length: leading.length });
  if (trailing.trim()) cleanups.push({ kind: 'trailing_text', length: trailing.length });
  return { text: JSON.parse(repairString(object[2], cleanups, start + object.indices[2][0])) };
}

function validateLearner(value) {
  requireThat(exact(value, ['text']) && nonblank(value.text), 'expected a nonempty learner text');
  return value;
}

export function parseLearner(text, _response, _originalOrder, metadata) {
  if (metadata?.allowBoundedCleanup) {
    const cleanups = [];
    metadata.formatCleanups = cleanups;
    return validateLearner(cleanLearnerJson(text, cleanups));
  }
  return validateLearner(JSON.parse(text));
}
