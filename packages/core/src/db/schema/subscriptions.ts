import { bigserial, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export const coreSubscriptionCursors = core.table('subscription_cursors', {
  subscription: text('subscription').primaryKey(),
  lastProcessedEventId: uuid('last_processed_event_id').notNull(),
  // Paired with lastProcessedEventId for tuple-comparison (occurred_at, id) advancement.
  // Without the timestamp half, v4 UUIDs would let the cursor jump arbitrarily in byte
  // order and lose events whose ids sort lexicographically below the cursor.
  lastProcessedOccurredAt: timestamp('last_processed_occurred_at', { withTimezone: true })
    .notNull()
    .default(new Date(0)),
  lastProcessedAt: timestamp('last_processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const coreSubscriptionProcessed = core.table('subscription_processed', {
  subscription: text('subscription').notNull(),
  eventId: uuid('event_id').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const coreSubscriptionDeadLetter = core.table('subscription_dead_letter', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  subscription: text('subscription').notNull(),
  eventId: uuid('event_id').notNull(),
  eventType: text('event_type').notNull(),
  attempts: integer('attempts').notNull(),
  lastError: text('last_error').notNull(),
  payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
  firstFailedAt: timestamp('first_failed_at', { withTimezone: true }).notNull(),
  deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }).notNull().defaultNow(),
});
