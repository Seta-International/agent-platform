import { boolean, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export const coreNotificationPrefs = core.table(
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
