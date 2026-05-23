import { boolean, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { notifications } from './_notifications-schema.ts';

export const notificationPrefs = notifications.table(
  'notification_prefs',
  {
    tenantId: uuid('tenant_id').notNull(),
    eventType: text('event_type').notNull(),
    channel: text('channel').notNull(),
    enabled: boolean('enabled').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.eventType, t.channel] })],
);
