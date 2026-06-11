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
  'modified',
  'superseded',
  'cancelled',
  'expired',
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
  // True when the row is an agentic native-suspend card (resume via /chat/resume).
  agentic: z.boolean().default(false),
  // Decision fields are absent on the legacy my-pending-approvals response —
  // defaults keep both endpoints parseable with one schema.
  status: ApprovalDecisionKind.default('pending'),
  decisionPayload: z.unknown().nullable().default(null),
  decidedAt: z.string().nullable().default(null),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type WorkflowApprovalRow = z.infer<typeof WorkflowApprovalRow>;

export const PendingApprovalsResponse = z.array(WorkflowApprovalRow);

export const ThreadApprovalsResponse = z.array(WorkflowApprovalRow);

export const DecideApprovalResponse = z.object({
  runId: z.string(),
  approvalId: z.string().optional(),
  resumed: z.boolean().optional(),
});
export type DecideApprovalResponse = z.infer<typeof DecideApprovalResponse>;

export const SseTokenResponse = z.object({ token: z.string() });

export const WorkflowDefinitionRow = z.object({
  id: z.string(),
  domain: z.string(),
  description: z.string(),
  hitlSteps: z.array(z.string()).default([]),
});
export type WorkflowDefinitionRow = z.infer<typeof WorkflowDefinitionRow>;

export const ListWorkflowDefinitionsResponse = z.object({
  rows: z.array(WorkflowDefinitionRow),
});
export type ListWorkflowDefinitionsResponse = z.infer<typeof ListWorkflowDefinitionsResponse>;
