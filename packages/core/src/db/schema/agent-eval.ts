import { boolean, index, integer, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

/** One row per eval:quality lane invocation (a nightly or manual run). */
export const coreAgentEvalRun = core.table(
  'agent_eval_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    git_sha: text('git_sha').notNull(),
    harness_version: text('harness_version').notNull(),
    model_tier: text('model_tier').notNull(),
    trigger: text('trigger').notNull(), // 'nightly' | 'manual'
    judge_tokens_total: integer('judge_tokens_total').notNull().default(0),
    started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finished_at: timestamp('finished_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_eval_run_by_started').on(t.started_at)],
);

/** One row per (case × scorer) within a run. Advisory scores. */
export const coreAgentEvalScore = core.table(
  'agent_eval_score',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    run_id: uuid('run_id')
      .notNull()
      .references(() => coreAgentEvalRun.id), // same-schema FK (both in core)
    specialist_id: text('specialist_id').notNull(),
    scorer_id: text('scorer_id').notNull(),
    layer: text('layer').notNull(),
    score: real('score').notNull(),
    threshold: real('threshold').notNull(),
    passed: boolean('passed').notNull(),
    reason: text('reason'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_eval_score_by_run').on(t.run_id)],
);
