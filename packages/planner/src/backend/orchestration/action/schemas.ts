import { z } from 'zod';
import { UpdateTaskPatchSchema } from '../../inputs.ts';

/** The six fields people actually say out loud (design D4). `bucket_id` is
 *  excluded: it is a UUID needing a name→id resolution step, which is a new way
 *  to pick the wrong thing. It arrives with FUT-805 AC1. */
export const UpdateTaskActionPatchSchema = UpdateTaskPatchSchema.pick({
  title: true,
  description: true,
  due_at: true,
  start_at: true,
  priority_number: true,
  percent_complete: true,
});
export type UpdateTaskActionPatch = z.infer<typeof UpdateTaskActionPatchSchema>;

/** What the MODEL may produce. Dates are looser here than in the domain schema
 *  (a bare `YYYY-MM-DD` is allowed) because the tool normalises them in code —
 *  see date-normalize.ts. Everything is re-validated against
 *  UpdateTaskActionPatchSchema after normalisation. */
export const ToolPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  due_at: z
    .string()
    .min(10)
    .nullable()
    .optional()
    .describe('YYYY-MM-DD, or a full ISO timestamp with offset. Never a relative phrase.'),
  start_at: z
    .string()
    .min(10)
    .nullable()
    .optional()
    .describe('YYYY-MM-DD, or a full ISO timestamp with offset. Never a relative phrase.'),
  priority_number: z
    .union([z.literal(1), z.literal(3), z.literal(5), z.literal(9)])
    .optional()
    .describe('1 urgent, 3 important, 5 medium, 9 low.'),
  percent_complete: z
    .union([z.literal(0), z.literal(50), z.literal(100)])
    .optional()
    .describe('0 not started, 50 in progress, 100 completed.'),
});
export type ToolPatch = z.infer<typeof ToolPatchSchema>;

export const UpdateTaskToolInputSchema = z.object({
  taskId: z
    .string()
    .trim()
    .min(1)
    .describe(
      'Task UUID, or an ordinal reference into the tasks already listed in this ' +
        'conversation: "#1"/"first", "#2"/"second", "last".',
    ),
  patch: ToolPatchSchema,
});

export const UpdateTaskToolOutputSchema = z.object({
  updated: z.boolean(),
  taskId: z.string().nullable(),
  /** Set when the write was refused for a reason the agent should explain. */
  refusal: z.string().nullable().optional(),
});

export const UpdateTaskSuspendSchema = z.object({ card: z.unknown() });

/** The resume payload. It is READ OFF THE PERSISTED CARD, never off the confirm
 *  request — that is FUT-804 AC5 and the reason no field here is client-supplied. */
export const UpdateTaskResumeSchema = z.object({
  action: z.enum(['update', 'decline']),
  taskId: z.string(),
  patch: UpdateTaskActionPatchSchema.optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().optional(),
});
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
