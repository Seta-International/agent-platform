import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { and, eq, sql } from 'drizzle-orm';
import {
  NOTIFICATION_REQUESTED,
  NOTIFICATION_REQUESTED_VERSION,
  type NotificationRequestedPayload,
} from '../../events.ts';
import { notificationPrefs } from '../db/schema/notification-prefs.ts';
import { notificationsTable } from '../db/schema/notifications.ts';

export const NOTIFY_CHANNEL = 'notifications_changes';

async function handle(
  event: DomainEvent<NotificationRequestedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { user_ids, target_event_type, target_payload, source_event_id } = event.payload;

  const [pref] = await ctx.tx
    .select({ enabled: notificationPrefs.enabled })
    .from(notificationPrefs)
    .where(
      and(
        eq(notificationPrefs.tenantId, event.tenantId),
        eq(notificationPrefs.eventType, target_event_type),
        eq(notificationPrefs.channel, 'in_app'),
      ),
    )
    .limit(1);
  if (pref && !pref.enabled) return;

  const inserted = await ctx.tx
    .insert(notificationsTable)
    .values(
      user_ids.map((userId) => ({
        tenantId: event.tenantId,
        userId,
        eventType: target_event_type,
        sourceEventId: source_event_id,
        payload: target_payload,
      })),
    )
    .onConflictDoNothing({
      target: [notificationsTable.sourceEventId, notificationsTable.userId],
    })
    .returning({ userId: notificationsTable.userId });

  for (const row of inserted) {
    await ctx.tx.execute(sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${row.userId}::text)`);
  }
}

export function notifierSubscriber(): SubscriberDef<NotificationRequestedPayload> {
  return {
    subscription: 'notifications.notifier.deliver',
    event: NOTIFICATION_REQUESTED,
    eventVersion: NOTIFICATION_REQUESTED_VERSION,
    handler: handle,
  };
}
