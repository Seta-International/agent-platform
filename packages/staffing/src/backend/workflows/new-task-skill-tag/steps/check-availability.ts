import { createStep } from '@mastra/core/workflows';
import { getUserProfile } from '@seta/identity';
import { stateAfterAvailabilitySchema, stateAfterCandidatesSchema } from '../state-schema.ts';

export const checkAvailabilityStep = createStep({
  id: 'check-availability',
  inputSchema: stateAfterCandidatesSchema,
  outputSchema: stateAfterAvailabilitySchema,
  execute: async ({ inputData }) => {
    const enriched = await Promise.all(
      inputData.candidates.map(async (candidate) => {
        const profile = await getUserProfile(candidate.userId);
        return {
          ...candidate,
          availabilityStatus: profile?.availability_status ?? 'available',
        };
      }),
    );
    return { ...inputData, candidates: enriched };
  },
});
