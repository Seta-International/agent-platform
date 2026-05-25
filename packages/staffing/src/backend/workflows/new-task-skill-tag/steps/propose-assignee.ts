import { createStep } from '@mastra/core/workflows';
import { stateAfterCandidatesSchema, stateAfterProposeSchema } from '../state-schema.ts';

const AVAILABILITY_PRIORITY: Record<string, number> = {
  available: 0,
  busy: 1,
  ooo: 2,
};

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
    const sorted = [...inputData.candidates].sort((a, b) => {
      const ap = AVAILABILITY_PRIORITY[a.availabilityStatus ?? 'available'] ?? 1;
      const bp = AVAILABILITY_PRIORITY[b.availabilityStatus ?? 'available'] ?? 1;
      if (ap !== bp) return ap - bp;
      return b.score - a.score;
    });
    // biome-ignore lint/style/noNonNullAssertion: length === 0 guarded above
    const top = sorted[0]!;
    const total = inputData.requiredSkills.length;
    const statusNote =
      top.availabilityStatus && top.availabilityStatus !== 'available'
        ? ` (status: ${top.availabilityStatus})`
        : '';
    return {
      ...inputData,
      candidates: sorted,
      proposed: {
        userId: top.userId,
        displayName: top.displayName,
        rationale: `Top match by availability then skill overlap (${top.score} of ${total})${statusNote}: ${top.matchedSkills.join(', ')}`,
      },
      failureReason: null,
    };
  },
});
