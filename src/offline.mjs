import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from '@earendil-works/pi-ai';
import { ruler } from '../contracts/judge/schema.mjs';

const response = text => fauxAssistantMessage([fauxText(text)]);
const learner = text => response(JSON.stringify({ text }));
const sampleJudge = dumping => context => {
  const { context_id, rubric, messages } = JSON.parse(context.messages.at(-1).content);
  const selections = [[0, 1, 2], [1, 2, 3], [1, 8], [0, 1], [3, 4], [7, 8]];
  const scores = dumping ? [0, 0, 0, 0, 0, 0] : [2, 1, 2, 2, 0, 2];
  return response(JSON.stringify({ contract_version: ruler, context_id, results: Object.fromEntries(Object.entries(rubric).map(([key, [slots]], i) => [key, {
    score: scores[i], reason: i === 3 && dumping ? `Opening response provides the full solution (${messages[1].id}).` : 'Scripted offline contract fixture; not an independent teaching judgment.',
    evidence_groups: [{ claim: scores[i] === 0 ? 'counterexample' : 'support_chain', slots: Object.fromEntries(slots.map((slot, j) => [slot.split(':')[0], { state: 'observed', message_ids: [messages[selections[i][j]].id] }])) }],
  }])) }));
};

export function offlineResponses(variant) {
  const dumping = variant === 'answer_dump';
  const full = 'Put A=(0,0), B=(13,0), and E=(x,y). Then x²+y²=25 and (x−13)²+y²=144. Subtract to get 169−26x=119, so x=25/13. The perpendicular distance to AD is 25/13 units.';
  const turns = [
    ['AE reaches a vertex. Which direction must a shortest segment to the vertical side AD run?', 'It should be horizontal, not slanted like AE, so I guess I need x.'],
    ['Set A=(0,0), B=(13,0), and E=(x,y). Can you write the two squared distances and subtract them?', 'I got x²+y²=25 and (x−13)²+y²=144. Subtraction removes y².'],
    ['Good. What is left after you expand the difference of the two squares?', '169−26x=119, so x=25/13. That is the horizontal distance.'],
    ['If AD were vertical at x=2 instead, how would you find the distance from an interior point?', 'I would subtract the side coordinate from the point coordinate and take the absolute value. That measures perpendicular separation.'],
  ];
  return [
    ...(!dumping ? [fauxAssistantMessage([fauxToolCall('check_distance', { dx: 3, dy: 4 })], { stopReason: 'toolUse' })] : []),
    ...turns.flatMap(([reply, next], i) => [fauxAssistantMessage([fauxThinking('Private reasoning fixture.'), fauxText(dumping ? full : reply)]), learner(dumping ? (i ? 'Okay, I can copy that.' : 'Can I just use that answer?') : next)]),
    sampleJudge(dumping),
  ];
}
