import { sql } from 'drizzle-orm';
import { index, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export const coreNotifications = core.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    eventType: text('event_type').notNull(),
    sourceEventId: uuid('source_event_id').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    sourceUserUnique: unique('notifications_source_user_unique').on(t.sourceEventId, t.userId),
    unreadIdx: index('notifications_unread_idx')
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.readAt} IS NULL AND ${t.dismissedAt} IS NULL`),
  }),
);
