import { and, eq, isNull, sql } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';
import { coreNotifications } from '../db/schema/notifications.ts';
import { NOTIFY_CHANNEL } from './subscriber.ts';

export class NotificationNotFound extends Error {
  constructor() {
    super('Notification not found');
    this.name = 'NotificationNotFound';
  }
}

export interface NotificationMutationResult {
  id: string;
  read_at: string | null;
  dismissed_at: string | null;
}

async function notifyUser(userId: string): Promise<void> {
  await coreDb().execute(sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${userId}::text)`);
}

export async function markNotificationRead(input: {
  id: string;
  userId: string;
  tenantId: string;
}): Promise<NotificationMutationResult> {
  const rows = await coreDb()
    .update(coreNotifications)
    .set({ readAt: sql`COALESCE(${coreNotifications.readAt}, now())` })
    .where(
      and(
        eq(coreNotifications.id, input.id),
        eq(coreNotifications.userId, input.userId),
        eq(coreNotifications.tenantId, input.tenantId),
      ),
    )
    .returning({
      id: coreNotifications.id,
      readAt: coreNotifications.readAt,
      dismissedAt: coreNotifications.dismissedAt,
    });
  const row = rows[0];
  if (!row) throw new NotificationNotFound();
  await notifyUser(input.userId);
  return {
    id: row.id,
    read_at: row.readAt ? row.readAt.toISOString() : null,
    dismissed_at: row.dismissedAt ? row.dismissedAt.toISOString() : null,
  };
}

export async function markAllNotificationsRead(input: {
  userId: string;
  tenantId: string;
}): Promise<{ updated: number }> {
  const rows = await coreDb()
    .update(coreNotifications)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(coreNotifications.userId, input.userId),
        eq(coreNotifications.tenantId, input.tenantId),
        isNull(coreNotifications.readAt),
        isNull(coreNotifications.dismissedAt),
      ),
    )
    .returning({ id: coreNotifications.id });
  if (rows.length > 0) await notifyUser(input.userId);
  return { updated: rows.length };
}

export async function dismissNotification(input: {
  id: string;
  userId: string;
  tenantId: string;
}): Promise<NotificationMutationResult> {
  const rows = await coreDb()
    .update(coreNotifications)
    .set({ dismissedAt: sql`COALESCE(${coreNotifications.dismissedAt}, now())` })
    .where(
      and(
        eq(coreNotifications.id, input.id),
        eq(coreNotifications.userId, input.userId),
        eq(coreNotifications.tenantId, input.tenantId),
      ),
    )
    .returning({
      id: coreNotifications.id,
      readAt: coreNotifications.readAt,
      dismissedAt: coreNotifications.dismissedAt,
    });
  const row = rows[0];
  if (!row) throw new NotificationNotFound();
  await notifyUser(input.userId);
  return {
    id: row.id,
    read_at: row.readAt ? row.readAt.toISOString() : null,
    dismissed_at: row.dismissedAt ? row.dismissedAt.toISOString() : null,
  };
}
