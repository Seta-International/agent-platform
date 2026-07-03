import { bigint, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { agent } from './pg-schema.ts';
import { workflowRuns } from './schema.workflow-runs.ts';

export const workflowRunEventsSeen = agent.table(
  'workflow_run_events_seen',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => workflowRuns.runId, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    eventSeq: bigint('event_seq', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.eventSeq] })],
);

export type WorkflowRunEventSeenRow = typeof workflowRunEventsSeen.$inferSelect;
