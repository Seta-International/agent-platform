import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { RequestContextSchema, registerToolPermission } from '../_types.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Tool 3 of the AvaiChecker pipeline.
//
// The LLM reads each user's in_progress_tasks and assigns a numeric urgency
// score (1–9) per task:
//   1 = most urgent  (e.g. priority: 'urgent', due today)
//   9 = least urgent (e.g. priority: 'low',    no due date)
//
// Ranking logic (executed by LLM, not hardcoded):
//   • User with NO tasks       → highest availability → top of list
//   • User with tasks          → ranked by overall urgency burden
//   • More urgent tasks        → lower availability  → pushed to bottom
//   • Fewest urgent tasks wins → ranked above heavier users
//
// execute() receives the LLM-provided ranked_order (user_ids sorted high→low
// availability), reorders the users array accordingly, and returns the sorted
// list WITHOUT adding any new availability field — only reordering.
//
// Output fields: user_id, name, status, in_progress_tasks — nothing extra.
// ──────────────────────────────────────────────────────────────────────────────

// Full task data — used as input so LLM can assess urgency (priority + due_at).
const InProgressTaskInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  priority: z.enum(['urgent', 'important', 'medium', 'low']),
  due_at: z.string().nullable(),
});

// Simplified task — output only carries what downstream agents need.
const InProgressTaskOutputSchema = z.object({
  task_id: z.string(),
  priority: z.enum(['urgent', 'important', 'medium', 'low']),
});

const UserInputSchema = z.object({
  user_id: z.string(),
  name: z.string().nullable(),
  status: z.enum(['available', 'busy', 'ooo']),
  in_progress_tasks: z.array(InProgressTaskInputSchema),
});

export const avaiCheckerRankByAvailabilityTool = registerToolPermission(
  createTool({
    id: 'avaiChecker_rankByAvailability',
    description: `
Third tool in the AvaiChecker pipeline.

Rank users by availability from highest to lowest based on their current
in_progress_tasks workload. Use this ranking logic:

  1. Users with NO in_progress_tasks → highest availability → rank first.
  2. Users WITH tasks → assess urgency of each task on a scale 1–9:
       1 = most urgent  (priority "urgent", due soon)
       9 = least urgent (priority "low", no due date)
  3. Users whose tasks are least urgent rank higher (more available).
  4. Users whose tasks are most urgent rank lower (less available).

After assessing all users, populate ranked_order with user_ids sorted
from HIGHEST availability to LOWEST availability.

Do NOT invent new fields or scores in the output — only reorder the list.
Output fields per user: user_id, name, status, in_progress_tasks.
    `.trim(),

    inputSchema: z.object({
      users: z
        .array(UserInputSchema)
        .min(1)
        .describe(
          'Combined output of avaiChecker_checkUserAvailability and ' +
            'avaiChecker_checkInProgressTasks for all users. ' +
            'Must include name (from the Orchestrator queue / SkillMatcher output).',
        ),
      ranked_order: z
        .array(z.string())
        .min(1)
        .describe(
          'User IDs sorted from HIGHEST availability to LOWEST availability. ' +
            "You determine this order by assessing each user's task urgency (1–9 scale). " +
            'Every user_id in users[] must appear exactly once here.',
        ),
    }),

    outputSchema: z.object({
      ranked_users: z.array(
        z.object({
          user_id: z.string(),
          name: z.string().nullable(),
          status: z.enum(['available', 'busy', 'ooo']),
          in_progress_tasks: z.array(InProgressTaskOutputSchema),
        }),
      ),
      total: z.number().int(),
    }),

    requestContextSchema: RequestContextSchema,

    execute: async (input, _ctx) => {
      // Build lookup map for O(1) access.
      const userMap = new Map(input.users.map((u) => [u.user_id, u]));

      // Reorder according to LLM-provided ranked_order.
      // Unknown IDs in ranked_order are silently skipped.
      // Users not mentioned in ranked_order are appended at the end.
      const seen = new Set<string>();
      const ranked_users: Array<{
        user_id: string;
        name: string | null;
        status: 'available' | 'busy' | 'ooo';
        in_progress_tasks: Array<{
          task_id: string;
          priority: 'urgent' | 'important' | 'medium' | 'low';
        }>;
      }> = [];

      const toOutput = (user: (typeof input.users)[number]) => ({
        user_id: user.user_id,
        name: user.name,
        status: user.status,
        in_progress_tasks: user.in_progress_tasks.map((t) => ({
          task_id: t.id,
          priority: t.priority,
        })),
      });

      for (const uid of input.ranked_order) {
        const user = userMap.get(uid);
        if (user && !seen.has(uid)) {
          ranked_users.push(toOutput(user));
          seen.add(uid);
        }
      }

      // Append any users the LLM omitted (safety net).
      for (const user of input.users) {
        if (!seen.has(user.user_id)) {
          ranked_users.push(toOutput(user));
        }
      }

      return { ranked_users, total: ranked_users.length };
    },
  }),
  'planner.task.read',
);
