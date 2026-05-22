import { index, integer, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { copilot } from './pg-schema.ts';

export const rateLimits = copilot.table(
  'rate_limits',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    turns: integer('turns').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.userId, t.windowStart] }),
    byTenantWindow: index('rl_by_tenant_window').on(t.tenantId, t.windowStart),
  }),
);

export * from './schema.tenant-knowledge-chunks.ts';
export * from './schema.tenant-knowledge-embeddings.ts';
export * from './schema.tenant-knowledge-files.ts';
export * from './schema.workflow-approvals.ts';
export * from './schema.workflow-events-seen.ts';
export * from './schema.workflow-runs.ts';
