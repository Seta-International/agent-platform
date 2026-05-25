import { z } from 'zod';

export const LinkModeSchema = z.enum(['comment', 'related', 'sub-task']);
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
  z.object({ kind: z.literal('created'), taskId: z.string() }),
  z.object({
    kind: z.literal('linked'),
    existingId: z.string(),
    mode: LinkModeSchema,
    newTaskId: z.string().optional(),
  }),
  z.object({ kind: z.literal('cancelled') }),
]);
export type DedupOutput = z.infer<typeof DedupOutputSchema>;
