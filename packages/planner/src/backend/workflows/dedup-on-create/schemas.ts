import { z } from 'zod';

// Link modes map to MS Planner-native primitives:
//   'related'  → new task + task_reference on it pointing to the existing task
//   'sub-task' → checklist_item on the existing task; no new task created
// 'comment' mode was dropped: MS Planner has no task-level comments.
export const LinkModeSchema = z.enum(['related', 'sub-task']);
export type LinkMode = z.infer<typeof LinkModeSchema>;

export const TaskDraftSchema = z.object({
  title: z.string().trim().min(1).max(280),
  description: z.string().optional().default(''),
  skill_tags: z.array(z.string()).optional().default([]),
  plan_id: z.string().uuid().optional(),
  bucket_id: z.string().uuid().optional(),
});
export type TaskDraft = z.infer<typeof TaskDraftSchema>;

export const CandidateSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  score: z.number().min(0).max(1),
  status: z.string(),
  assigneeId: z.string().nullable().optional(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const ClassificationSchema = z.enum(['likely-dup', 'maybe-dup', 'no-match']);
export type Classification = z.infer<typeof ClassificationSchema>;

export const DedupOutputSchema = z.discriminatedUnion('kind', [
  // Standalone new task. `linkedTo` is set when the user chose 'related' mode
  // (a task_reference on the new task points to `linkedTo`).
  z.object({
    kind: z.literal('created'),
    taskId: z.string(),
    linkedTo: z.string().optional(),
  }),
  // No new task; a checklist item was appended to the existing task.
  z.object({
    kind: z.literal('sub-task-added'),
    existingId: z.string(),
    checklistItemId: z.string(),
  }),
  z.object({ kind: z.literal('cancelled') }),
]);
export type DedupOutput = z.infer<typeof DedupOutputSchema>;
