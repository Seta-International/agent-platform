import { textEnum, textEnumCheck } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agent } from './pg-schema.ts';

/** Every status a workflow_runs row is ever written with — the evented workflow
 *  lifecycle (running/paused/success/failed/canceled) plus the inline/queued
 *  orchestration kernel, which reuses `success` for a completed run. */
export const WORKFLOW_RUN_STATUS = ['running', 'paused', 'success', 'failed', 'canceled'] as const;

export const workflowRuns = agent.table(
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
    state: jsonb('state').notNull().default({ outputs: {} }),
    result: jsonb('result'),
    status: textEnum('status', WORKFLOW_RUN_STATUS).notNull(),
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
    uniqueIndex('workflow_runs_source_event_id_idx').on(t.tenantId, t.sourceEventId),
    textEnumCheck('workflow_runs', 'status', WORKFLOW_RUN_STATUS),
  ],
);

export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type WorkflowRunInsert = typeof workflowRuns.$inferInsert;
