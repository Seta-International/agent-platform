import { integer, text, timestamp } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export const coreSubscriptionFailureState = core.table('subscription_failure_state', {
  subscription: text('subscription').primaryKey(),
  eventId: text('event_id').notNull(),
  attempts: integer('attempts').notNull(),
  firstFailedAt: timestamp('first_failed_at', { withTimezone: true }).notNull(),
  lastError: text('last_error').notNull(),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
