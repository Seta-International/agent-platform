import { z } from 'zod';

export const WorkflowRunStatus = z.enum([
  'pending',
  'running',
  'paused',
  'success',
  'failed',
  'tripwire',
  'canceled',
]);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatus>;

export const WorkflowRunStartedVia = z.enum(['event', 'chat', 'rerun']);
export type WorkflowRunStartedVia = z.infer<typeof WorkflowRunStartedVia>;

export const ApprovalDecisionKind = z.enum([
  'pending',
  'approved',
  'rejected',
  'superseded',
  'cancelled',
]);
export type ApprovalDecisionKind = z.infer<typeof ApprovalDecisionKind>;

export const WorkflowRunRow = z.object({
  runId: z.string(),
  workflowId: z.string(),
  tenantId: z.string(),
  startedBy: z.string(),
  startedVia: WorkflowRunStartedVia,
  status: z.string(),
  suspendReason: z.string().nullable(),
  errorSummary: z.string().nullable(),
  inputSummary: z.unknown(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  latestApprovalKind: ApprovalDecisionKind.nullable().default(null),
  latestApprovalReason: z.string().nullable().default(null),
});
export type WorkflowRunRow = z.infer<typeof WorkflowRunRow>;

export const ListWorkflowRunsResponse = z.object({
  rows: z.array(WorkflowRunRow),
  nextCursor: z.string().nullable(),
});
export type ListWorkflowRunsResponse = z.infer<typeof ListWorkflowRunsResponse>;

export const WorkflowApprovalRow = z.object({
  approvalId: z.string(),
  runId: z.string(),
  stepId: z.string(),
  proposedPayload: z.unknown(),
  approverUserId: z.string(),
  surfaceCanvas: z.boolean(),
  surfaceChatThreadId: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type WorkflowApprovalRow = z.infer<typeof WorkflowApprovalRow>;

export const PendingApprovalsResponse = z.array(WorkflowApprovalRow);

export const DecideApprovalResponse = z.object({
  runId: z.string(),
  approvalId: z.string().optional(),
  decision: z.enum(['approve', 'reject', 'modify']),
  resumed: z.boolean().optional(),
});
export type DecideApprovalResponse = z.infer<typeof DecideApprovalResponse>;

export const SseTokenResponse = z.object({ token: z.string() });
