import { createStep } from '@mastra/core/workflows';
import { classifySkillsAgent, classifySkillsOutputSchema } from '../agents/classify-skills.ts';
import { stateAfterClassifySchema, stateAfterLoadSchema } from '../state-schema.ts';

export const classifySkillsStep = createStep({
  id: 'classify-skills',
  inputSchema: stateAfterLoadSchema,
  outputSchema: stateAfterClassifySchema,
  execute: async ({ inputData }) => {
    const result = await classifySkillsAgent.generate(
      [
        {
          role: 'user',
          content: `Title: ${inputData.task.title}\nDescription: ${inputData.task.description ?? ''}`,
        },
      ],
      {
        structuredOutput: { schema: classifySkillsOutputSchema },
      },
    );

    const requiredSkills = result.object?.requiredSkills ?? [];
    if (requiredSkills.length === 0) {
      throw new Error('classify-skills returned no skills');
    }

    return {
      ...inputData,
      requiredSkills,
    };
  },
});
