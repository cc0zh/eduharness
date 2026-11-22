import { hash } from '../contracts/core/schema.mjs';
import { fauxJson, fauxReply, splitBinaryOfflineResponses } from './offline.mjs';

const opening = 'I think changing the biggest number always moves the median.';
const progress = 'The middle rank stayed third, so my original rule was wrong.';
const practice = 'The center value is 6 in both lists even though their maximums differ.';
const choice = 'I want to compare the middle ranks in a four-value list before and after an extreme changes. This tests whether two middle entries behave differently.';
const execution = 'I chose 2, 4, 6, 8 and then 2, 4, 6, 12. The two middle values are 4 and 6 both times, so the median stays 5.';
const assigned = 'Use 2, 4, 6, 8. Replace 8 with 12 and compare the two medians.';
const teacher = [
  'Which entry is third before and after we change only the maximum?',
  'Explain why the middle rank did not move when the maximum changed.',
  'What is the invariant about the center value in those two lists?',
  assigned,
];
const ref = (n, quote) => ({ n, quote });
const observe = (state, initialBlocker, progress = null, choice = null, edition = 1) => fauxJson({ state, initialBlocker, progress, choice, execution: null,
  ...(edition === 2 && { resolvedBlockers: progress ? [initialBlocker] : [] }) });

export const stage3Fixtures = {
  corpus() {
    const tasks = new Map();
    const dev = Array.from({ length: 4 }, (_, i) => `FIXTURE-${i + 1}`).flatMap(family => ['A', 'B'].map(side => {
      const id = `${family}-${side}`;
      const task = { id, user_scenario: { persona: 'offline learner', instructions: {
        task_instructions: opening, known_info: 'sorted lists', unknown_info: 'what happens to the middle value',
        reason_for_call: 'check the middle value', student_model: { private: 'not in the observer or audit' },
      } } };
      tasks.set(id, task);
      return { id, family, sha256: hash(task) };
    }));
    return { dev, tasks, manifestSha256: hash(dev) };
  },
  dialogue(arm, edition = 1) {
    const candidate = arm === 'candidate';
    const v2 = candidate && edition === 2;
    const learner = [progress, practice, candidate ? choice : practice, execution];
    const replies = candidate ? [teacher[0], 'What would you like to test, and why?', 'Choose a remaining check and tell me why it helps.', 'Try the check you suggested and tell me what it shows.'] : [...teacher];
    if (v2) {
      replies[1] = [assigned, assigned];
      replies[2] = [assigned, 'How would you check your conclusion? Propose your own check, explain why it would help, and try it.'];
    }
    const blocker = ref(1, opening);
    return {
      generation: replies.flatMap((reply, i) => [...[reply].flat().map(fauxReply), fauxJson({ text: learner[i] })]),
      observations: [observe('blocked', blocker, null, null, edition), observe('ready', blocker, ref(3, progress), null, edition),
        observe('ready', blocker, ref(5, practice), null, edition), observe('chosen', blocker, ref(7, choice), ref(7, choice), edition)],
    };
  },
  judgement(arm, messages) {
    const fixtures = splitBinaryOfflineResponses('normal', messages, 1);
    if (arm === 'candidate') fixtures[2] = fauxJson({ answers: {
      A1: { answer: true, evidence: { step: 9, choice: 7 } }, A2: { answer: true, evidence: { choice: 7 } },
    } });
    return fixtures;
  },
  exposure: () => [fauxJson({ specified: 'yes', evidence: ref(8, assigned) })],
  audit(window) {
    const hit = window[6]?.text === choice;
    return [fauxJson({ originWithReason: hit ? 'yes' : 'no', independentExecution: hit ? 'yes' : 'no',
      choice: hit ? ref(7, choice) : null, execution: hit ? ref(9, execution) : null, teacherPrior: hit ? null : ref(8, assigned),
      reason: hit ? 'Learner designed and tried the four-entry test.' : 'The tutor specified the test.' })];
  },
};
