import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { RequestContextSchema, registerToolPermission } from '../_types.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Tool 1 of the SkillMatcher pipeline.
//
// Receives task_id + skills[] from the Orchestrator queue payload (output of
// TaskAnalyzer). Formats them into a single natural-language query string
// that the embedding model can encode meaningfully.
//
// Pure logic — no DB, no DI needed.
// ──────────────────────────────────────────────────────────────────────────────

export type FormatQueryDeps = Record<string, never>;

export function makeSkillMatcherFormatQueryTool(_deps: FormatQueryDeps = {}) {
  return registerToolPermission(
    createTool({
      id: 'skillMatcher_formatQuery',
      description: `
First tool in the SkillMatcher pipeline.

Receives the task_id and skills list from the Orchestrator (output of the
TaskAnalyzer queue). Formats them into a single query string suitable for
embedding and vector search.

Call this before skillMatcher_contextSearch.
      `.trim(),

      inputSchema: z.object({
        task_id: z.string().uuid().describe('task_id from the Orchestrator queue payload.'),
        skills: z
          .array(z.string().min(1))
          .min(1)
          .describe('Skills list from the Orchestrator queue payload for this task_id.'),
      }),

      outputSchema: z.object({
        task_id: z.string(),
        query: z
          .string()
          .describe(
            'Formatted query string ready to be embedded. ' +
              'Contains all skills joined into a natural-language sentence.',
          ),
        skill_count: z.number().int(),
      }),

      requestContextSchema: RequestContextSchema,

      execute: async (input, _ctx) => {
        // Build a natural-language query so the embedding model encodes
        // semantic relationships between skills, not just keyword proximity.
        // Example: ["Terraform", "AWS ECS", "PostgreSQL"]
        //   → "Engineer with skills in Terraform, AWS ECS, and PostgreSQL"
        const skills = input.skills;
        let query: string;

        if (skills.length === 1) {
          query = `Engineer with skills in ${skills[0]}`;
        } else {
          const allButLast = skills.slice(0, -1).join(', ');
          const last = skills[skills.length - 1];
          query = `Engineer with skills in ${allButLast}, and ${last}`;
        }

        return {
          task_id: input.task_id,
          query,
          skill_count: skills.length,
        };
      },
    }),
    'planner.task.read',
  );
}
