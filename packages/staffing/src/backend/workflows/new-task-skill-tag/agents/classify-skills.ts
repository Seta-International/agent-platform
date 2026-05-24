import { Agent } from '@mastra/core/agent';
import { resolveModel } from '@seta/copilot/models';
import { z } from 'zod';

export const classifySkillsOutputSchema = z.object({
  requiredSkills: z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .min(3)
    .max(7),
});

export const classifySkillsAgent = new Agent({
  id: 'classify-skills',
  name: 'classify-skills',
  instructions: `
You extract the 3-7 most likely required skill tags from a software task.
Output ONLY lowercased single-token or hyphenated skills (e.g. "postgres", "react-query", "system-design").
Do NOT include human languages, soft skills, or company names. Output exactly the JSON shape requested.
`.trim(),
  model: resolveModel(undefined, { tierHint: 'fast' }).model,
});
