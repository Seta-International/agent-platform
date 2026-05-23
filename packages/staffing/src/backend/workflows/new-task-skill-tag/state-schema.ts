import { z } from 'zod';

export const taskRefSchema = z.object({
  taskId: z.string().uuid(),
  tenantId: z.string().uuid(),
  groupId: z.string().uuid(),
});

export const initiatedBySchema = z.object({
  userId: z.string().uuid(),
  via: z.enum(['event', 'chat', 'rerun']),
  threadId: z.string().uuid().optional(),
  sourceEventId: z.string().uuid().optional(),
});

export const candidateSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  matchedSkills: z.array(z.string()),
  score: z.number(),
});

export const proposedSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  rationale: z.string(),
});

export const taskSummarySchema = z.object({
  taskId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  tenantId: z.string(),
  groupId: z.string(),
  skillTags: z.array(z.string()),
});

export const workflowInputSchema = z.object({
  taskRef: taskRefSchema,
  initiatedBy: initiatedBySchema,
});

export const workflowOutputSchema = z.object({
  decision: z.enum(['approve', 'reject', 'modify', 'timeout']),
  assignment: z
    .object({
      taskId: z.string(),
      assigneeUserId: z.string(),
    })
    .nullable(),
});

export const stateAfterLoadSchema = workflowInputSchema.extend({
  task: taskSummarySchema,
});

export const stateAfterClassifySchema = stateAfterLoadSchema.extend({
  requiredSkills: z.array(z.string()).min(1),
});

export const stateAfterCandidatesSchema = stateAfterClassifySchema.extend({
  candidates: z.array(candidateSchema),
});

export const stateAfterProposeSchema = stateAfterCandidatesSchema.extend({
  proposed: proposedSchema.nullable(),
  failureReason: z.string().nullable(),
});

export const stateAfterApprovalSchema = stateAfterProposeSchema.extend({
  decision: z.enum(['approve', 'reject', 'modify', 'timeout']),
  overrideUserId: z.string().optional(),
  note: z.string().optional(),
});

export const awaitApprovalResumeSchema = z.object({
  decision: z.enum(['approve', 'reject', 'modify', 'timeout']),
  overrideUserId: z.string().optional(),
  note: z.string().optional(),
});

export const awaitApprovalSuspendSchema = z.object({
  proposedPayload: proposedSchema.nullable(),
  approverUserId: z.string(),
  fallbackApproverUserId: z.string().nullable(),
  surfaceCanvas: z.boolean(),
  surfaceChatThreadId: z.string().nullable(),
  expiresAt: z.string(),
  suspendReason: z.string(),
  stepId: z.string(),
});
