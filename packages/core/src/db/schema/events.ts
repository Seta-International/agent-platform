import { integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

// Actual DDL is hand-written (0001_events_partitioned.sql) — drizzle pgTable cannot
// express PARTITION BY RANGE or the deferred pg_notify trigger. This declaration gives
// typed select/insert against the partitioned table.
export const coreEvents = core.table('events', {
  id: uuid('id').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid('tenant_id').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: text('aggregate_id').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: integer('event_version').notNull(),
  payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
  causedByUserId: uuid('caused_by_user_id'),
  causedByEventId: uuid('caused_by_event_id'),
  traceId: text('trace_id'),
  actor: jsonb('actor').$type<{
    user_id: string;
    tenant_id: string;
    ip?: string;
    user_agent?: string;
  } | null>(),
  before: jsonb('before'),
  after: jsonb('after'),
});
