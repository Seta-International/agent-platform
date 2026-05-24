// rbac: user-self-scoped — every mutation filters on userId from the session,
// so a user can only flip their own notification rows. No tenant-admin gate.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { notificationsDb } from '../db/client.ts';
import { notificationsTable } from '../db/schema/notifications.ts';
import { NOTIFY_CHANNEL } from '../subscribers/notifier.ts';

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
  await notificationsDb().execute(sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${userId}::text)`);
}

export async function markNotificationRead(input: {
  id: string;
  userId: string;
  tenantId: string;
}): Promise<NotificationMutationResult> {
  const rows = await notificationsDb()
    .update(notificationsTable)
    .set({ readAt: sql`COALESCE(${notificationsTable.readAt}, now())` })
    .where(
      and(
        eq(notificationsTable.id, input.id),
        eq(notificationsTable.userId, input.userId),
        eq(notificationsTable.tenantId, input.tenantId),
      ),
    )
    .returning({
      id: notificationsTable.id,
      readAt: notificationsTable.readAt,
      dismissedAt: notificationsTable.dismissedAt,
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
  const rows = await notificationsDb()
    .update(notificationsTable)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(notificationsTable.userId, input.userId),
        eq(notificationsTable.tenantId, input.tenantId),
        isNull(notificationsTable.readAt),
        isNull(notificationsTable.dismissedAt),
      ),
    )
    .returning({ id: notificationsTable.id });
  if (rows.length > 0) await notifyUser(input.userId);
  return { updated: rows.length };
}

export async function dismissNotification(input: {
  id: string;
  userId: string;
  tenantId: string;
}): Promise<NotificationMutationResult> {
  const rows = await notificationsDb()
    .update(notificationsTable)
    .set({ dismissedAt: sql`COALESCE(${notificationsTable.dismissedAt}, now())` })
    .where(
      and(
        eq(notificationsTable.id, input.id),
        eq(notificationsTable.userId, input.userId),
        eq(notificationsTable.tenantId, input.tenantId),
      ),
    )
    .returning({
      id: notificationsTable.id,
      readAt: notificationsTable.readAt,
      dismissedAt: notificationsTable.dismissedAt,
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
