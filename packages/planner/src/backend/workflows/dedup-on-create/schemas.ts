import { z } from 'zod';

// Legacy link mode kept for batch/import paths that still reference it.
export const LinkModeSchema = z.enum(['related', 'sub-task']);
export type LinkMode = z.infer<typeof LinkModeSchema>;

export const TaskDraftSchema = z.object({
  title: z.string().trim().min(1).max(280),
  description: z.string().optional().default(''),
  labels: z.array(z.string()).optional().default([]),
  plan_id: z.string().uuid().optional(),
  bucket_id: z.string().uuid().optional(),
});
export type TaskDraft = z.infer<typeof TaskDraftSchema>;

/**
 * Input for the redesigned dedupOnCreate workflow.
 * Task is ALREADY created; workflow checks for duplicates after creation.
 */
export const DedupInputSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(280),
  description: z.string().optional().default(''),
  plan_id: z.string().uuid(),
});
export type DedupInput = z.infer<typeof DedupInputSchema>;

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

// --- HITL action schema (user decision) ---

export const DupActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('link'), existingIds: z.array(z.string().uuid()).min(1) }),
  z.object({ kind: z.literal('delete') }),
  z.object({ kind: z.literal('leave') }),
]);
export type DupAction = z.infer<typeof DupActionSchema>;

// --- Workflow output ---

export const DedupOutputSchema = z.discriminatedUnion('kind', [
  // Task kept as-is (no duplicates found, or user chose "Leave it")
  z.object({ kind: z.literal('kept'), taskId: z.string() }),
  // Task kept + linked as related to existing task(s)
  z.object({ kind: z.literal('linked'), taskId: z.string(), linkedTo: z.array(z.string()) }),
  // Task was deleted by user decision
  z.object({ kind: z.literal('deleted'), taskId: z.string() }),
  // Workflow triggered — returned immediately to the caller
  z.object({ kind: z.literal('workflow-started'), runId: z.string() }),
]);
export type DedupOutput = z.infer<typeof DedupOutputSchema>;
