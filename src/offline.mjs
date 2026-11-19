import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from '@earendil-works/pi-ai';

const response = text => fauxAssistantMessage([fauxText(text)]);
const learner = text => response(JSON.stringify({ text }));
export const sampleJudge = (bad, dumping = bad, absent = []) => context => {
  const { rubric, messages } = JSON.parse(context.messages.at(-1).content);
  const selections = [[0, 1, 2], [1, 2, 3], [1, 8], [0, 1], [3, 4], [7, 8]];
  const scores = bad ? [0, 0, 0, 0, 0, 0] : [2, 1, 2, 2, 0, 2];
  return response(JSON.stringify({ results: Object.fromEntries(Object.entries(rubric).map(([key, [slots]], i) => [key, {
    score: scores[i], evidence: [i === 3 && dumping ? 2 : messages[selections[i][0]].n],
    reason: i === 3 && dumping ? 'Opening response #2 provides the full solution.' : `#${messages[selections[i][0]].n} anchors the scripted offline fixture.`,
    evidence_groups: [{ claim: scores[i] === 0 ? 'counterexample' : 'support_chain', slots: Object.fromEntries(slots.map((slot, j) => {
      const name = slot.split(':')[0];
      const numbers = [messages[selections[i][j]].n];
      return [name, absent.includes(name)
        ? { state: 'not_observed', opportunity_numbers: numbers, reason: 'The expected action is absent at this opportunity in the fixture.' }
        : { state: 'observed', message_numbers: numbers }];
    })) }],
  }])) }));
};

export function offlineResponses(variant) {
  const full = 'Put A=(0,0), B=(13,0), and E=(x,y). Then x²+y²=25 and (x−13)²+y²=144. Subtract to get 169−26x=119, so x=25/13. The perpendicular distance to AD is 25/13 units.';
  const badTurns = {
    answer_dump: [full, 'Okay, I can copy that.'],
    lecture: [`A vertical line has a horizontal normal. Here is the entire derivation. ${full} In general this method uses two circle equations and their difference to locate the horizontal coordinate.`, 'I can repeat the expression you gave.'],
    sycophant_close: ['Yes, your reasoning is right. You have it. Great work, and we are done!', 'So is AE the distance to AD?'],
    no_teach: ['Keep going. You can do this!', 'I am still not sure whether AE is the distance to AD.'],
  };
  const normal = variant === 'normal';
  const absent = {
    lecture: ['late_student_drives_agency'],
    sycophant_close: ['tutor_consolidation_or_transfer_prompt', 'student_consolidated_understanding'],
    no_teach: ['tutor_why_flawed', 'student_corrected_concept'],
  };
  const turns = [
    ['AE reaches a vertex. Which direction must a shortest segment to the vertical side AD run?', 'It should be horizontal, not slanted like AE, so I guess I need x.'],
    ['Set A=(0,0), B=(13,0), and E=(x,y). Can you write the two squared distances and subtract them?', 'I got x²+y²=25 and (x−13)²+y²=144. Subtraction removes y².'],
    ['Good. What is left after you expand the difference of the two squares?', '169−26x=119, so x=25/13. That is the horizontal distance.'],
    ['If AD were vertical at x=2 instead, how would you find the distance from an interior point?', 'I would subtract the side coordinate from the point coordinate and take the absolute value. That measures perpendicular separation.'],
  ];
  return [
    ...(normal ? [fauxAssistantMessage([fauxToolCall('check_distance', { dx: 3, dy: 4 })], { stopReason: 'toolUse' })] : []),
    ...turns.flatMap(([reply, next], i) => {
      const [teacherText, learnerText] = normal ? [reply, next] : badTurns[variant];
      return [fauxAssistantMessage([fauxThinking('Private reasoning fixture.'), fauxText(teacherText)]), learner(variant === 'answer_dump' && i === 0 ? 'Can I just use that answer?' : learnerText)];
    }),
    sampleJudge(!normal, variant === 'answer_dump', absent[variant]),
  ];
}
