import { sql } from 'drizzle-orm';
import { index, integer, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { copilot } from './pg-schema.ts';

export const workflowRuns = copilot.table(
  'workflow_runs',
  {
    runId: uuid('run_id').primaryKey(),
    workflowId: text('workflow_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    startedBy: uuid('started_by').notNull(),
    startedVia: text('started_via').notNull(),
    parentThreadId: uuid('parent_thread_id'),
    parentRunId: uuid('parent_run_id'),
    sourceEventId: uuid('source_event_id'),
    inputSummary: jsonb('input_summary').notNull(),
    status: text('status').notNull(),
    suspendReason: text('suspend_reason'),
    errorSummary: text('error_summary'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
  },
  (t) => [
    index('workflow_runs_tenant_status_started_at_idx').on(
      t.tenantId,
      t.status,
      sql`${t.startedAt} desc`,
    ),
    index('workflow_runs_actor_started_at_idx').on(
      t.tenantId,
      t.startedBy,
      sql`${t.startedAt} desc`,
    ),
    uniqueIndex('workflow_runs_source_event_id_idx').on(t.sourceEventId),
  ],
);

export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type WorkflowRunInsert = typeof workflowRuns.$inferInsert;
