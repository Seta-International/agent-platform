import { boolean, index, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agent } from './pg-schema.ts';
import { workflowRuns } from './schema.workflow-runs.ts';

export const workflowApprovals = agent.table(
  'workflow_approvals',
  {
    approvalId: uuid('approval_id').primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => workflowRuns.runId, { onDelete: 'cascade' }),
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
    status: text('status').notNull(),
    decisionPayload: jsonb('decision_payload'),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('workflow_approvals_approver_status_idx').on(t.approverUserId, t.status)],
);

export type WorkflowApprovalRow = typeof workflowApprovals.$inferSelect;
export type WorkflowApprovalInsert = typeof workflowApprovals.$inferInsert;
