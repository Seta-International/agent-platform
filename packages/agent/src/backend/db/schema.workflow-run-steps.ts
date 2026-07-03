import { sql } from 'drizzle-orm';
import { check, jsonb, numeric, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agent } from './pg-schema.ts';
import { workflowRuns } from './schema.workflow-runs.ts';

export const workflowRunSteps = agent.table(
  'workflow_run_steps',
  {
    tenant_id: uuid('tenant_id').notNull(),
    run_id: uuid('run_id')
      .notNull()
      .references(() => workflowRuns.runId, { onDelete: 'cascade' }),
    step_id: text('step_id').notNull(),
    agent_id: text('agent_id').notNull(),
    reasoning_trace: jsonb('reasoning_trace').notNull().default([]),
    evidence_citations: jsonb('evidence_citations').notNull().default([]),
    confidence_score: numeric('confidence_score', { precision: 4, scale: 3 }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.run_id, t.step_id] }),
    check('workflow_run_steps_confidence_check', sql`confidence_score BETWEEN 0 AND 1`),
  ],
);

export type WorkflowRunStepRow = typeof workflowRunSteps.$inferSelect;
export type WorkflowRunStepInsert = typeof workflowRunSteps.$inferInsert;
