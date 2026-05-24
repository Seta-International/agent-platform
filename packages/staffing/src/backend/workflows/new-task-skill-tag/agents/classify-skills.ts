import type { AgentSpec } from '@seta/core';
import { z } from 'zod';

export const classifySkillsOutputSchema = z.object({
  requiredSkills: z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .min(3)
    .max(7),
});

export const CLASSIFY_SKILLS_AGENT_ID = 'classify-skills';

// Staffing declares the agent's behavioural contract; copilot's engine resolves
// the model from `defaultTier` and constructs the Mastra Agent at runtime build.
// The workflow step retrieves it from Mastra by id — staffing never touches
// the model registry directly.
export const classifySkillsSpec: AgentSpec = {
  id: CLASSIFY_SKILLS_AGENT_ID,
  defaultTier: 'fast',
  tools: [],
  rbac: [],
  instructions: `
You extract the 3-7 most likely required skill tags from a software task.
Output ONLY lowercased single-token or hyphenated skills (e.g. "postgres", "react-query", "system-design").
Do NOT include human languages, soft skills, or company names. Output exactly the JSON shape requested.
`.trim(),
};
