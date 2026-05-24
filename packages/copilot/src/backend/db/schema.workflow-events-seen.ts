import { bigint, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { copilot } from './pg-schema.ts';

export const workflowRunEventsSeen = copilot.table(
  'workflow_run_events_seen',
  {
    runId: uuid('run_id').notNull(),
    eventSeq: bigint('event_seq', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.eventSeq] })],
);

export type WorkflowRunEventSeenRow = typeof workflowRunEventsSeen.$inferSelect;
