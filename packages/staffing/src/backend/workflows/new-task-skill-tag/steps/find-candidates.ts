import { createStep } from '@mastra/core/workflows';
import { identitySearchUsersBySkillsTool } from '@seta/planner/agent-tools';
import { stateAfterCandidatesSchema, stateAfterClassifySchema } from '../state-schema.ts';

interface CandidatesExecResult {
  candidates: Array<{
    userId: string;
    displayName: string;
    matchedSkills: string[];
    score: number;
  }>;
}

export const findCandidatesStep = createStep({
  id: 'find-candidates',
  inputSchema: stateAfterClassifySchema,
  outputSchema: stateAfterCandidatesSchema,
  execute: async ({ inputData, requestContext }) => {
    const result = (await identitySearchUsersBySkillsTool.execute?.(
      {
        groupId: inputData.taskRef.groupId,
        skills: inputData.requiredSkills,
        limit: 5,
      },
      { requestContext } as Parameters<
        NonNullable<typeof identitySearchUsersBySkillsTool.execute>
      >[1],
    )) as CandidatesExecResult;
    return {
      ...inputData,
      candidates: result.candidates,
    };
  },
});
