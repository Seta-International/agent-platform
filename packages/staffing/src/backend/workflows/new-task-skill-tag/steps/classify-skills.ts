import { createStep } from '@mastra/core/workflows';
import { CLASSIFY_SKILLS_AGENT_ID, classifySkillsOutputSchema } from '../agents/classify-skills.ts';
import { stateAfterClassifySchema, stateAfterLoadSchema } from '../state-schema.ts';

export const classifySkillsStep = createStep({
  id: 'classify-skills',
  inputSchema: stateAfterLoadSchema,
  outputSchema: stateAfterClassifySchema,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent(CLASSIFY_SKILLS_AGENT_ID);
    if (!agent) {
      throw new Error(
        `classify-skills agent not registered with Mastra (id=${CLASSIFY_SKILLS_AGENT_ID})`,
      );
    }
    const result = await agent.generate(
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
