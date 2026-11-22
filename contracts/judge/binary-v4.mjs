export const splitBinaryV4Ruler = 'e1-binary-v4';
export const splitBinaryV4IdentityVersion = 'evaluation-identity-v6';

export const v4EvidenceRule = "Judge only from the actual questions and steps shown in the dialogue; a tutor's later claim or denial about what was asked or done is neither evidence nor a disqualifier for a real earlier message.";
export const v4QuestionRules = Object.freeze({
  V1: 'Merely claiming a check happened does not count as V1, and a later false claim or denial does not erase a real earlier V1 prompt.',
  A1: 'Routine algebra or arithmetic (such as subtracting given equations, canceling stated terms, or solving the resulting linear equation) after the tutor already supplied the setup or expansion does not qualify.',
  A2: 'Applying a method or check assigned by the tutor (including adjusting a constant during a transfer check) does not qualify as originating a method.',
});
