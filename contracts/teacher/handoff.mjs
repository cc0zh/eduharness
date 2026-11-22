import { requireThat } from '../core/schema.mjs';
import { publicReply } from './schema.mjs';

export const handoffRequests = Object.freeze([
  'How would you check your conclusion? Propose your own check, explain why it would help, and try it.',
  'How would you check your reasoning so far? Propose your own check, explain why it would help, and try it.',
  'What would you do to resolve the part that is still open? Propose your own method, explain why it would help, and try it.',
]);
export const handoffFallbackReply = 'What is the reason for one step you have already tried?';
export const handoffRejection = kind => ['teacher_generation_contract', 'empty_unconfirmed', 'output_truncated',
  'output_limit_empty_unconfirmed', 'reasoning_exhausted_empty'].includes(kind);

export function validateHandoffResponse(text, response, canContinue) {
  const usedTool = response.content.some(block => block.type === 'toolCall');
  if (response.stopReason === 'toolUse' && usedTool && canContinue) return;
  requireThat(response.stopReason === 'stop' && !usedTool, 'handoff requires a complete public reply');
  const reply = publicReply(text);
  requireThat(handoffRequests.includes(reply), 'handoff must be exactly one open question without a supplied method, check or expression');
  return reply;
}
