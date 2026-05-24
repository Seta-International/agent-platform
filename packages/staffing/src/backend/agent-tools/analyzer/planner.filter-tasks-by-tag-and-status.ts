import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';

export type FilteredTask = {
  id: string;
  tenant_id: string;
  plan_id: string;
  bucket_id: string | null;
  title: string;
  description: string | null;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  progress: 'not_started' | 'in_progress' | 'completed' | 'deferred';
  review_state: 'needs_review' | null;
  skill_tags: string[];
  due_at: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
};

// ──────────────────────────────────────────────────────────────────────────────
// Dependency contract
//
// Caller injects `filterTasks` which resolves the SessionScope from the actor's
// user_id, maps priority_number/is_deferred to priority/progress fields, and
// delegates to listTasks() from @seta/planner internally.
// ──────────────────────────────────────────────────────────────────────────────

export type FilterTasksDeps = {
  filterTasks: (params: {
    userId: string;
    skillTags: string[];
    status: 'not_started' | 'in_progress' | 'completed' | 'deferred';
    limit: number;
  }) => Promise<FilteredTask[]>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Tool
//
// Tool 1 of the TaskAnalyzer pipeline.
// Queries planner.tasks:
//   WHERE skill_tags && ARRAY[...tags]   -- GIN overlap, any tag matches
//     AND progress = :status
//
// Output fields mirror TaskWithAssigneesRow exactly — no invented fields.
// ──────────────────────────────────────────────────────────────────────────────

export function makePlannerFilterTasksByTagAndStatusTool(deps: FilterTasksDeps) {
  return defineCopilotTool({
    id: 'planner_filterTasksByTagAndStatus',
    name: 'Filter Tasks By Tag',
    description: `
Queries the tasks table and returns tasks where:
  • skill_tags overlaps with the given tags (GIN && operator)
  • progress matches the given status

Use this as the FIRST tool in the TaskAnalyzer pipeline when the user asks to
find tasks related to a topic with a specific status.

Examples:
  "tasks related to infrastructure to review"
    → tags: ["infrastructure"], status: "not_started"
  "in-progress devops tasks"
    → tags: ["devops"], status: "in_progress"

After calling this tool, pass each task to planner_extractSkillsFromTask.
      `.trim(),

    input: z.object({
      tags: z
        .array(z.string().min(1))
        .min(1)
        .describe(
          'Skill tags to filter by. Uses GIN overlap (&&): returns tasks whose ' +
            'skill_tags column contains ANY of these values.',
        ),
      status: z
        .enum(['not_started', 'in_progress', 'completed', 'deferred'])
        .default('not_started')
        .describe(
          'Maps to the progress column: ' +
            '"not_started" = todo, "in_progress" = doing, ' +
            '"completed" = done, "deferred" = on hold.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe('Maximum number of tasks to return.'),
    }),

    // Output shape matches FilteredTask — caller maps DB fields to this shape.
    output: z.object({
      tasks: z.array(
        z.object({
          id: z.string(),
          tenant_id: z.string(),
          plan_id: z.string(),
          bucket_id: z.string().nullable(),
          title: z.string(),
          description: z.string().nullable(),
          priority: z.enum(['urgent', 'important', 'medium', 'low']),
          progress: z.enum(['not_started', 'in_progress', 'completed', 'deferred']),
          review_state: z.enum(['needs_review']).nullable(),
          skill_tags: z.array(z.string()),
          due_at: z.string().nullable(),
          sort_order: z.number(),
          created_by: z.string(),
          created_at: z.string(),
          updated_at: z.string(),
          deleted_at: z.string().nullable(),
          version: z.number(),
        }),
      ),
      total: z.number().int(),
    }),

    rbac: 'planner.task.read',

    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);

      const tasks = await deps.filterTasks({
        userId: actor.user_id,
        skillTags: input.tags,
        status: input.status ?? 'not_started',
        limit: input.limit ?? 50,
      });

      return {
        tasks,
        total: tasks.length,
      };
    },
  });
}
