import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';
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
