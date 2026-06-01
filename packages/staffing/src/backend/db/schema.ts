import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const staffing = pgSchema('staffing');

/** One orchestration run (e.g. a single assignee-recommendation pipeline). */
export const orchestrationRuns = staffing.table(
  'orchestration_runs',
  {
    run_id: uuid('run_id').primaryKey(),
    orchestration_id: text('orchestration_id').notNull(),
    tenant_id: uuid('tenant_id').notNull(),
    initiated_by: uuid('initiated_by').notNull(),
    // running | completed | failed | canceled
    status: text('status').notNull().default('running'),
    input: jsonb('input').notNull(),
    // { outputs: { <stepId>: <output> } }
    state: jsonb('state').notNull().default(sql`'{"outputs":{}}'::jsonb`),
    result: jsonb('result'),
    error: text('error'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    finished_at: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('orchestration_runs_by_tenant').on(t.tenant_id, t.created_at)],
);

/** TrustLayer store: one row per executed step, capturing reasoning/citations/confidence. */
export const orchestrationStepTrace = staffing.table(
  'orchestration_step_trace',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    run_id: uuid('run_id').notNull(),
    step_id: text('step_id').notNull(),
    agent_id: text('agent_id').notNull(),
    reasoning_trace: jsonb('reasoning_trace').notNull().default(sql`'[]'::jsonb`),
    evidence_citations: jsonb('evidence_citations').notNull().default(sql`'[]'::jsonb`),
    confidence_score: numeric('confidence_score', { precision: 4, scale: 3 }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('orchestration_step_trace_uniq').on(t.run_id, t.step_id)],
);
