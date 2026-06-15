import { desc } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const evaluation = pgSchema('evaluation');

export const datasets = evaluation.table(
  'datasets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('datasets_by_tenant').on(t.tenant_id, desc(t.created_at))],
);

export const cases = evaluation.table(
  'cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    dataset_id: uuid('dataset_id').notNull(),
    input: jsonb('input').notNull(),
    ground_truth: text('ground_truth'),
    metadata: jsonb('metadata').notNull().default({}),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('cases_by_dataset').on(t.tenant_id, t.dataset_id)],
);

export const runs = evaluation.table(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    dataset_id: uuid('dataset_id').notNull(),
    status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] })
      .notNull()
      .default('pending'),
    target_model: text('target_model').notNull(),
    scorer_ids: jsonb('scorer_ids').notNull(),
    judge_model: text('judge_model'),
    summary: jsonb('summary'),
    error: text('error'),
    started_at: timestamp('started_at', { withTimezone: true }),
    finished_at: timestamp('finished_at', { withTimezone: true }),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('runs_by_dataset').on(t.tenant_id, t.dataset_id, desc(t.created_at))],
);

export const caseResults = evaluation.table(
  'case_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    run_id: uuid('run_id').notNull(),
    case_id: uuid('case_id').notNull(),
    output: text('output'),
    status: text('status', { enum: ['ok', 'error'] }).notNull(),
    error: text('error'),
    latency_ms: integer('latency_ms'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('case_results_by_run').on(t.run_id),
    uniqueIndex('case_results_run_case_unique').on(t.run_id, t.case_id),
  ],
);

export const scores = evaluation.table(
  'scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    case_result_id: uuid('case_result_id').notNull(),
    scorer_id: text('scorer_id').notNull(),
    score: doublePrecision('score').notNull(),
    reason: text('reason'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('scores_by_case_result').on(t.case_result_id)],
);
