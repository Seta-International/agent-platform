import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { and, eq, sql } from 'drizzle-orm';
import { coreNotificationPrefs } from '../db/schema/notification-prefs.ts';
import { coreNotifications } from '../db/schema/notifications.ts';
import {
  CORE_NOTIFICATION_REQUESTED,
  CORE_NOTIFICATION_REQUESTED_VERSION,
  type CoreNotificationRequestedPayload,
} from './events.ts';

export const NOTIFY_CHANNEL = 'core_notifications';

async function handle(
  event: DomainEvent<CoreNotificationRequestedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { user_ids, target_event_type, target_payload, source_event_id } = event.payload;

  const [pref] = await ctx.tx
    .select({ enabled: coreNotificationPrefs.enabled })
    .from(coreNotificationPrefs)
    .where(
      and(
        eq(coreNotificationPrefs.tenantId, event.tenantId),
        eq(coreNotificationPrefs.eventType, target_event_type),
        eq(coreNotificationPrefs.channel, 'in_app'),
      ),
    )
    .limit(1);
  if (pref && !pref.enabled) return;

  const inserted = await ctx.tx
    .insert(coreNotifications)
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
      target: [coreNotifications.sourceEventId, coreNotifications.userId],
    })
    .returning({ userId: coreNotifications.userId });

  for (const row of inserted) {
    await ctx.tx.execute(sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${row.userId}::text)`);
  }
}

export function coreNotifierSubscriber(): SubscriberDef<CoreNotificationRequestedPayload> {
  return {
    subscription: 'core.notifier.deliver',
    event: CORE_NOTIFICATION_REQUESTED,
    eventVersion: CORE_NOTIFICATION_REQUESTED_VERSION,
    handler: handle,
  };
}
