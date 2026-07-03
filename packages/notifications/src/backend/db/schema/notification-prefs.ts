import { textEnum, textEnumCheck } from '@seta/shared-db';
import { boolean, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { notifications } from './_notifications-schema.ts';

export const NOTIFICATION_CHANNELS = ['in_app', 'email'] as const;

export const notificationPrefs = notifications.table(
  'notification_prefs',
  {
    tenantId: uuid('tenant_id').notNull(),
    // event_type is deliberately free text: open event-name set, not an enum.
    eventType: text('event_type').notNull(),
    channel: textEnum('channel', NOTIFICATION_CHANNELS).notNull(),
    enabled: boolean('enabled').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.eventType, t.channel] }),
    textEnumCheck('notification_prefs', 'channel', NOTIFICATION_CHANNELS),
  ],
);
