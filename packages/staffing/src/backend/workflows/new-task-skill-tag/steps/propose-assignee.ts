import { createStep } from '@mastra/core/workflows';
import { stateAfterCandidatesSchema, stateAfterProposeSchema } from '../state-schema.ts';

export const proposeAssigneeStep = createStep({
  id: 'propose-assignee',
  inputSchema: stateAfterCandidatesSchema,
  outputSchema: stateAfterProposeSchema,
  execute: async ({ inputData }) => {
    if (inputData.candidates.length === 0) {
      return {
        ...inputData,
        proposed: null,
        failureReason: 'no_candidates',
      };
    }
    // biome-ignore lint/style/noNonNullAssertion: length === 0 guarded above
    const top = inputData.candidates[0]!;
    const total = inputData.requiredSkills.length;
    return {
      ...inputData,
      proposed: {
        userId: top.userId,
        displayName: top.displayName,
        rationale: `Top match by skill overlap (${top.score} of ${total}): ${top.matchedSkills.join(', ')}`,
      },
      failureReason: null,
    };
  },
});
