import { policy } from './e1.mjs';

export const hardLearnerScenario = 'hard-learner-fidelity';
export const hardLearnerCheckScope = 'hard-learners';
export const fidelityConditions = Object.freeze(['repeat', 'answer', 'targeted', 'independent']);
export const learnerFixArms = Object.freeze({
  control: Object.freeze({ thinking: policy.learner.thinking, antiSelfFalsification: false }),
  a: Object.freeze({ thinking: 'off', antiSelfFalsification: false }),
  b: Object.freeze({ thinking: policy.learner.thinking, antiSelfFalsification: true }),
  c: Object.freeze({ thinking: 'off', antiSelfFalsification: true }),
});
export const learnerFixSelections = Object.freeze(['pilot', 'a', 'b', 'c']);

export const developmentTopics = Object.freeze({
  'S0-01': {
    opening: "Hi, I'm working on this problem: Let z be a complex number such that z^{13} = 1. Let w_1, w_2, ..., w_k be all the possible values of z + z^3 + z^4 + z^9 + z^{10} + z^{12}. Find w_1^2 + w_2^2 + ... + w_k^2. I thought the sum would always be zero since the roots of unity sum to zero, but that doesn't seem right. Can you help me understand what I'm missing?",
    known: 'Substitution, the given power equation, and that the sum of all thirteen thirteenth roots of unity is zero.',
    unknown: 'Why the selected six terms need not cancel, and how to combine different values of the expression.',
    initialRule: 'The six selected powers are roots of unity, so they must sum to zero.',
    history: {
      stubborn: ['They are powers of a root of unity, so I still think they cancel out.', "The roots cancel. I don't see how picking six of them changes that.", "I'd put zero first. I still expect the powers of a root of unity to cancel."],
      'answer-seeker': ['Could you just tell me which steps to write?', "I don't know. Can you show me the method and the answer?", 'I can do substitutions, but could you do this one and tell me what to write?'],
      pretender: ['Oh, I see. I know how this works now.', "Yeah, it's the cancellation thing. I get it.", "I think I've got it now. Can we move on?"],
    },
    teacher: {
      repeat: 'The sum of all thirteen thirteenth roots of unity is zero. We need the possible values of the expression in the question.',
      answer: 'Write 43. The contributions to the final sum are 36 and 7, and 36+7=43.',
      targeted: 'Try a smaller case. For u³=1 and u≠1, the full sum 1+u+u² is zero. If you keep only u and u², what is the sum? Use that to explain what your first idea missed in the original problem. Leave the final total for later.',
      independent: "Explain in your own words whether the six selected powers have to cancel, and why. Try one concrete first step on your own. Say exactly where you get stuck if you can't finish.",
    },
  },
  'S0-06': {
    opening: "I'm not really sure how to do this problem: Square ABCD has side lengths of 13 units. Point E is inside the square so that AE = 5 units and BE = 12 units. What is the distance from E to side AD? Since AE is 5, isn't that just the answer? Can you help me figure this out?",
    known: 'Properties of a square, right angles, and the Pythagorean theorem.',
    unknown: 'The distinction between the shortest perpendicular to a side and a segment ending at a vertex, and how to find the distance.',
    initialRule: 'AE is already the distance to AD because A lies on AD.',
    history: {
      stubborn: ['I still think it\'s AE. A is already on AD.', "If I end up on that side at A, I don't see why I have to draw a different segment.", "I'd write 5. AE already touches AD at A."],
      'answer-seeker': ['Could you just tell me which segment to calculate?', "I don't know. Can you show me the steps and the answer?", 'I know how to use Pythagoras. Could you show me which lengths to plug in?'],
      pretender: ['Oh, that makes sense. I get it now.', 'Right, the shortest distance. I know what to do.', "I'm pretty sure I've got it. Can we move on?"],
    },
    teacher: {
      repeat: 'The distance from E to AD is the shortest distance from E to that side. We need the distance to the side in the question.',
      answer: 'Write 25/13 units for the distance from E to AD. The final arithmetic gives 25 divided by 13.',
      targeted: 'Sketch AD as the y-axis with A=(0,0). Compare the segments from P=(3,4) to A and to (0,4) on AD. Work out their lengths yourself. Which one is shorter, and what did your original choice for E miss? Leave the exact distance for E for later.',
      independent: "On your own, pick a segment from E to AD and explain why it is the shortest. Try drawing or naming one choice first. Say exactly where you get stuck if you can't justify it.",
    },
  },
});
