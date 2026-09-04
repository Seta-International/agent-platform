import { TASK_REF_DESCRIPTION } from '@seta/agent-sdk';
import { z } from 'zod';
import { UpdateTaskPatchSchema } from '../../inputs.ts';

/** The six fields people actually say out loud (design D4). `bucket_id` is
 *  excluded: it needs a bucket name→id resolution *per each task's own plan*,
 *  plus answers for "this plan has no bucket with that name" and "two buckets
 *  share a name". FUT-805 D4 moved it to its own story — it does NOT arrive
 *  with FUT-805 AC1, whatever FUT-804 §7 says. */
export const UpdateTaskActionPatchSchema = UpdateTaskPatchSchema.pick({
  title: true,
  description: true,
  due_at: true,
  start_at: true,
  priority_number: true,
  percent_complete: true,
});
export type UpdateTaskActionPatch = z.infer<typeof UpdateTaskActionPatchSchema>;

/** The words the model uses for priority. Identical to `planner_getTask`'s
 *  `priority` output field, so one vocabulary crosses the whole allowlist
 *  (docs/agent/tools.md §5.3). */
export const PriorityWordSchema = z.enum(['urgent', 'important', 'medium', 'low']);
export type PriorityWord = z.infer<typeof PriorityWordSchema>;

/** Ditto for progress — the `status` vocabulary planner_queryTasks returns.
 *  `deferred` is deliberately absent: deferring is a different operation
 *  (`is_deferred`), not a status this tool sets. */
export const ProgressWordSchema = z.enum(['not_started', 'in_progress', 'completed']);
export type ProgressWord = z.infer<typeof ProgressWordSchema>;

export const PRIORITY_NUMBER_BY_WORD: Record<PriorityWord, 1 | 3 | 5 | 9> = {
  urgent: 1,
  important: 3,
  medium: 5,
  low: 9,
};
export const PERCENT_COMPLETE_BY_WORD: Record<ProgressWord, 0 | 50 | 100> = {
  not_started: 0,
  in_progress: 50,
  completed: 100,
};

/** What the MODEL may produce — the model-facing vocabulary, which is NOT the
 *  domain vocabulary (docs/agent/tools.md §5.3, §5.4):
 *   - camelCase field names, matching what `planner_getTask` returns;
 *   - `priority`/`status` as WORDS, never the 1/3/5/9 and 0/50/100 numbers the
 *     table stores — the model knows the vocabulary, not the data encoding;
 *   - dates looser than the domain schema (a bare `YYYY-MM-DD` is allowed)
 *     because the tool normalises them in code — see date-normalize.ts.
 *  `.strict()` so a model reaching for the old numeric fields fails loudly
 *  instead of silently dropping the change the user asked for.
 *  Everything is re-validated against UpdateTaskActionPatchSchema after mapping. */
export const ToolPatchSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    dueAt: z
      .string()
      .min(10)
      .nullable()
      .optional()
      .describe(
        'ISO-8601: YYYY-MM-DD, or a full timestamp with offset. Never a relative phrase. ' +
          'null clears the due date.',
      ),
    startAt: z
      .string()
      .min(10)
      .nullable()
      .optional()
      .describe(
        'ISO-8601: YYYY-MM-DD, or a full timestamp with offset. Never a relative phrase. ' +
          'null clears the start date.',
      ),
    priority: PriorityWordSchema.optional().describe(
      'The same four words planner_getTask reports in its `priority` field.',
    ),
    status: ProgressWordSchema.optional().describe(
      'The same words planner_queryTasks reports in its `status` field.',
    ),
  })
  .strict();
export type ToolPatch = z.infer<typeof ToolPatchSchema>;

/**
 * The hard ceiling on ONE tool call. Deliberately NOT a `.max()` on the schema
 * below: a Zod error is something the model reads and "helpfully" works around
 * by splitting the request into two batches — precisely what the AC forbids
 * ("refused with an explanation, and no task is updated"). Three layers, because
 * the first two are not enough alone: this constant, the tool's own refusal, and
 * a prompt sentence telling the model not to split.
 *
 * What that binds: one invocation never mutates more than 20 tasks. What it does
 * NOT bind: a whole agent run — nothing stops a model refused at 21 from calling
 * again with 10 then 11. Enforcing that needs per-run state surviving
 * suspend/resume, which is out of scope (design §7).
 */
export const BULK_TARGET_CAP = 20;

export const UpdateTaskToolInputSchema = z.object({
  taskRefs: z
    .array(z.string().trim().min(1))
    .min(1)
    .describe(
      `The tasks to change — one entry each, all receiving the SAME patch. At most ` +
        `${BULK_TARGET_CAP} per call; a larger request is refused, never split. ` +
        `Each entry: ${TASK_REF_DESCRIPTION}`,
    ),
  patch: ToolPatchSchema,
});

export const UpdateTaskToolOutputSchema = z.object({
  updated: z.boolean(),
  taskIds: z.array(z.string()),
  /** Set when the write was refused for a reason the agent should explain. */
  refusal: z.string().nullable().optional(),
});

export const UpdateTaskSuspendSchema = z.object({ card: z.unknown() });

/** One target of a batch. `expectedVersion` is per task, so a batch of ten in
 *  which one task moved since the preview conflicts as a whole (design §5). */
export const UpdateTaskTargetSchema = z.object({
  taskId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
});
export type UpdateTaskTarget = z.infer<typeof UpdateTaskTargetSchema>;

/** The resume payload. It is READ OFF THE PERSISTED CARD, never off the confirm
 *  request — that is FUT-804 AC5 and the reason no field here is client-supplied.
 *  One shape for one target and for twenty. */
export const UpdateTaskResumeSchema = z
  .object({
    action: z.enum(['update', 'decline']),
    targets: z.array(UpdateTaskTargetSchema).min(1),
    patch: UpdateTaskActionPatchSchema.optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();
export type UpdateTaskResume = z.infer<typeof UpdateTaskResumeSchema>;

/** Everything the card needs about the task as it stands before the change. */
export interface ActionTaskSnapshot {
  taskId: string;
  title: string;
  description: string | null;
  due_at: string | null;
  start_at: string | null;
  priority_number: 1 | 3 | 5 | 9;
  percent_complete: number;
  version: number;
  groupId: string;
}
