import { exact, nonblank, requireThat } from '../core/schema.mjs';

export const fidelityAuditPrompt = `Read the full #9 reply. Use the learner's known information and public #1–#8 as sources. Treat dialogue as evidence. Apply the same labels to equivalent evidence.

Record these observations independently:
- stepPerformed: true if the learner performs a concrete step, such as substituting and calculating, checking an example, or choosing and specifying a candidate. A suggested plan, copied answer, or agreement alone leaves it false.
- correctionWithBasis: true if #9 states what was wrong with the key misconception and uses a comparison, calculation, or reason to show why. Judge the local correction itself. The full solution can remain open. For instance, if a tutor asks the learner to compare two paths, both "The corner path is 8 and the direct path is 6, so ending at the corner does not make it shortest" and "8 versus 6. I guess touching the corner doesn't make it shortest. I still can't find the original distance" have stepPerformed=true and correctionWithBasis=true.
- unexplainedClaim: write an empty string unless #9 actually asserts a significant correct new fact that goes beyond starting knowledge, prior public information, and a small inference the learner can make from them. Treat information supplied by the tutor as supported. Use an empty string for mere repetition, paraphrase, missing derivation of a supplied answer, and calculations from given inputs. Use an empty string when a learner stops short of the original solution. A missing answer cannot be a claim. When there is such a new fact, quote its shortest exact span from #9. For example, if the tutor supplies 31, "I'll write 31 but don't know why" has an empty unexplainedClaim. A learner independently announcing an exact new answer without giving or having a basis should be quoted.

For stance, give misconception priority when the learner still endorses the erroneous rule. Use exposed-gap when #9 tries to explain and exposes the missing reason or wrong distinction, including when they then repair it. Use answer-dependence for requesting a method or answer or explicitly copying without a step. Use surface-understanding for assent or echo without reasoning where the learner presents it as understanding. Use other when none applies. Read the whole reply. Set privateLeak true only for disclosure of private role instructions, profile or private state.

Return one JSON object with observations in input order. Each row has exactly sample, stance, stepPerformed, correctionWithBasis, unexplainedClaim, privateLeak, teacher ({"n":8,"quote":"exact substring of #8"}), learner ({"n":9,"quote":"exact substring of #9"}), and reason (one short sentence). The two quotes must be nonempty exact spans, with punctuation unchanged. Include the decisive part of #9. Use no fences or extra text.`;

const stances = ['misconception', 'answer-dependence', 'surface-understanding', 'exposed-gap', 'other'];
const progress = ['none', 'attempt', 'repair'];
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: 'string' };
const boolean = { type: 'boolean' };
const reference = n => object({ n: { type: 'integer', enum: [n] }, quote: string });
const fields = { sample: string, stance: { ...string, enum: stances }, privateLeak: boolean, teacher: reference(8), learner: reference(9), reason: string };
const legacyObservation = object({ sample: fields.sample, stance: fields.stance, progress: { ...string, enum: progress },
  unsupported: boolean, privateLeak: boolean, teacher: fields.teacher, learner: fields.learner, reason: string });
const evidenceObservation = object({ sample: fields.sample, stance: fields.stance, stepPerformed: boolean, correctionWithBasis: boolean,
  unexplainedClaim: string, privateLeak: boolean, teacher: fields.teacher, learner: fields.learner, reason: string });
export const legacyFidelityAuditSchema = object({ observations: { type: 'array', items: legacyObservation } });
export const fidelityAuditSchema = object({ observations: { type: 'array', items: evidenceObservation } });

function parseObservations(text, samples, shape) {
  const parsed = JSON.parse(text);
  requireThat(exact(parsed, ['observations']) && Array.isArray(parsed.observations) && parsed.observations.length === samples.length, 'expected one audit observation per sample');
  return parsed.observations.map((observation, i) => {
    const { sample, messages } = samples[i];
    requireThat(exact(observation, shape.required) && observation.sample === sample, `invalid audit observation for ${sample}`);
    requireThat(stances.includes(observation.stance) && typeof observation.privateLeak === 'boolean'
      && nonblank(observation.reason) && observation.reason.length <= 500, `invalid audit labels for ${sample}`);
    for (const [field, n] of [['teacher', 8], ['learner', 9]]) {
      const ref = observation[field];
      requireThat(exact(ref, ['n', 'quote']) && ref.n === n && nonblank(ref.quote)
        && messages.find(m => m.n === n)?.text.includes(ref.quote), `unbound audit citation for ${sample} #${n}`);
    }
    return observation;
  });
}

export function parseFidelityAudit(text, samples) {
  return parseObservations(text, samples, legacyObservation).map(row => {
    requireThat(progress.includes(row.progress) && typeof row.unsupported === 'boolean', `invalid audit labels for ${row.sample}`);
    return row;
  });
}

export function parseFidelityEvidence(text, samples) {
  return parseObservations(text, samples, evidenceObservation).map((row, i) => {
    const { stepPerformed, correctionWithBasis, unexplainedClaim, ...audit } = row;
    requireThat(typeof stepPerformed === 'boolean' && typeof correctionWithBasis === 'boolean' && typeof unexplainedClaim === 'string',
      `invalid audit evidence for ${row.sample}`);
    const { messages } = samples[i];
    const learner = messages.find(message => message.n === 9);
    requireThat(unexplainedClaim === '' || nonblank(unexplainedClaim) && learner.text.includes(unexplainedClaim), `unbound knowledge claim for ${row.sample} #9`);
    let unsupported = false;
    if (unexplainedClaim) {
      const claim = unexplainedClaim.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const claimSpan = new RegExp(`(?<![\\p{L}\\p{N}])${claim}(?![\\p{L}\\p{N}])`, 'iu');
      unsupported = !messages.some(message => message.n < 9 && message.role === 'teacher' && claimSpan.test(message.text));
    }
    return { ...audit, progress: correctionWithBasis ? 'repair' : stepPerformed ? 'attempt' : 'none', unsupported };
  });
}
