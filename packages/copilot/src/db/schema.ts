import { sql } from 'drizzle-orm';
import { index, integer, jsonb, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
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

export const hitlCalls = copilot.table(
  'hitl_calls',
  {
    callId: varchar('call_id', { length: 64 }).primaryKey(),
    threadId: varchar('thread_id', { length: 64 }).notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    toolName: varchar('tool_name', { length: 128 }).notNull(),
    input: jsonb('input').notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    outcome: jsonb('outcome'),
    requiredPermission: varchar('required_permission', { length: 64 }).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    byThread: index('hitl_by_thread').on(t.threadId),
    byPending: index('hitl_pending').on(t.status, t.expiresAt).where(sql`status = 'pending'`),
  }),
);
