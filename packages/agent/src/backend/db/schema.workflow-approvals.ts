import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { agent } from './pg-schema.ts';
import { workflowRuns } from './schema.workflow-runs.ts';

/** Every status a workflow_approvals row is ever written with. */
export const APPROVAL_STATUS = [
  'pending',
  'approved',
  'rejected',
  'modified',
  'superseded',
  'expired',
] as const;

export const workflowApprovals = agent.table(
  'workflow_approvals',
  {
    approvalId: uuid('approval_id').primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => workflowRuns.runId, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    stepId: text('step_id').notNull(),
    proposedPayload: jsonb('proposed_payload').notNull(),
    approverUserId: uuid('approver_user_id').notNull(),
    fallbackApproverUserId: uuid('fallback_approver_user_id'),
    surfaceCanvas: boolean('surface_canvas').notNull().default(true),
    // text, not uuid — thread IDs are arbitrary Mastra text strings (e.g. __LOCALID_* from assistant-ui)
    surfaceChatThreadId: text('surface_chat_thread_id'),
    // Mastra agentic-resume parameters (chat HITL). Null for evented-workflow
    // rows — their presence is the agentic-vs-workflow discriminator.
    mastraRunId: text('mastra_run_id'),
    toolCallId: text('tool_call_id'),
    status: textEnum('status', APPROVAL_STATUS).notNull(),
    decisionPayload: jsonb('decision_payload'),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('workflow_approvals_approver_status_idx').on(t.approverUserId, t.status),
    // Idempotency target for lifecycle-hook.ts ON CONFLICT: the PK is gen_random_uuid(),
    // so without this a re-delivered suspension would insert a duplicate approval.
    unique('workflow_approvals_run_step_unique').on(t.runId, t.stepId),
    // Partial index scanned by the sweeper + list-my-pending-approvals (open approvals only).
    index('workflow_approvals_pending_expires_idx').on(t.expiresAt).where(sql`status = 'pending'`),
    textEnumCheck('workflow_approvals', 'status', APPROVAL_STATUS),
  ],
);

export type WorkflowApprovalRow = typeof workflowApprovals.$inferSelect;
export type WorkflowApprovalInsert = typeof workflowApprovals.$inferInsert;
