import { defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// Tool
//
// Tool 2 of the TaskAnalyzer pipeline.
// Called once per task returned by planner_filterTasksByTagAndStatus.
//
// The agent reads `title` and `description` (from the DB row), reasons about
// what skills the task requires, then calls this tool with its conclusions in
// the `skills` field. The execute function normalises and deduplicates.
//
// Input fields `title` and `description` map 1-to-1 to TaskRow columns.
// No invented fields.
// ──────────────────────────────────────────────────────────────────────────────

export const plannerExtractSkillsFromTaskTool = defineCopilotTool({
  id: 'planner_extractSkillsFromTask',
  name: 'Extract Skills From Task',
  description: `
Analyzes the title and description of a single task to extract required skills.

Call this once per task from planner_filterTasksByTagAndStatus output.

How to use:
  1. Read the task's title and description fields carefully.
  2. Identify the specific technical or domain skills needed to complete the task.
  3. Populate the skills array with concrete skill names
     (e.g. "Terraform", "AWS ECS", "PostgreSQL", "React", "System Design").
  4. Avoid generic terms like "programming" or "communication".
  5. If description is null, rely on the title alone.

Call this tool for EVERY task in the list before calling planner_buildTaskSkillQueue.
    `.trim(),

  input: z.object({
    // task_id, title, description come directly from TaskRow columns.
    task_id: z.string().uuid().describe('The id column of the task row.'),
    title: z.string().describe('The title column of the task row.'),
    description: z
      .string()
      .nullable()
      .describe('The description column of the task row. May be null.'),
    skills: z
      .array(z.string().min(1))
      .min(1)
      .max(15)
      .describe(
        'Skills you identified as required for this task based on title and description. ' +
          'Be specific and concrete. Maximum 15 skills per task.',
      ),
  }),

  output: z.object({
    task_id: z.string(),
    title: z.string(),
    skills: z.array(z.string()),
  }),

  rbac: 'planner.task.read',

  execute: async (input, _ctx) => {
    // Normalise: trim whitespace and deduplicate while preserving order.
    const seen = new Set<string>();
    const skills: string[] = [];
    for (const raw of input.skills) {
      const s = raw.trim();
      if (s && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase());
        skills.push(s);
      }
    }

    return {
      task_id: input.task_id,
      title: input.title,
      skills,
    };
  },
});
