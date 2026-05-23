import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { notificationsDb, resetNotificationsDb } from '../src/backend/db/client.ts';
import { notificationsTable } from '../src/backend/db/schema/notifications.ts';
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '../src/index.ts';
import { waitFor, withNotificationsTestDb } from './test-helpers.ts';

async function seedOne(tenantId: string, userId: string): Promise<string> {
  const [row] = await notificationsDb()
    .insert(notificationsTable)
    .values({
      tenantId,
      userId,
      eventType: 'test',
      sourceEventId: crypto.randomUUID(),
      payload: {},
    })
    .returning({ id: notificationsTable.id });
  if (!row) throw new Error('seed failed');
  return row.id;
}

describe('notification mutations', () => {
  it('markNotificationRead sets read_at when null, idempotent', async () => {
    await withNotificationsTestDb(async ({ pool }) => {
      resetNotificationsDb();
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const id = await seedOne(tenantId, userId);

      const listener = await pool.connect();
      const got: string[] = [];
      listener.on('notification', (m) => {
        if (m.channel === 'notifications_changes' && m.payload) got.push(m.payload);
      });
      await listener.query('LISTEN notifications_changes');

      try {
        const res1 = await markNotificationRead({ id, userId, tenantId });
        expect(res1.read_at).not.toBeNull();
        const firstReadAt = res1.read_at;

        const res2 = await markNotificationRead({ id, userId, tenantId });
        expect(res2.read_at).toBe(firstReadAt);

        await waitFor(() => got.includes(userId));
      } finally {
        await listener.query('UNLISTEN notifications_changes');
        listener.release();
      }
    });
  });

  it('markNotificationRead refuses to cross users', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const tenantId = crypto.randomUUID();
      const owner = crypto.randomUUID();
      const intruder = crypto.randomUUID();
      const id = await seedOne(tenantId, owner);
      await expect(markNotificationRead({ id, userId: intruder, tenantId })).rejects.toThrow(
        /not found/i,
      );
    });
  });

  it('markAllNotificationsRead marks every unread row of the user', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await seedOne(tenantId, userId);
      await seedOne(tenantId, userId);
      await seedOne(tenantId, userId);
      const { updated } = await markAllNotificationsRead({ userId, tenantId });
      expect(updated).toBe(3);
      const stillUnread = await notificationsDb()
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(
          and(eq(notificationsTable.userId, userId), eq(notificationsTable.tenantId, tenantId)),
        );
      const { updated: again } = await markAllNotificationsRead({ userId, tenantId });
      expect(again).toBe(0);
      expect(stillUnread).toHaveLength(3);
    });
  });

  it('dismissNotification sets dismissed_at and excludes the row from queries', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const id = await seedOne(tenantId, userId);
      const res = await dismissNotification({ id, userId, tenantId });
      expect(res.dismissed_at).not.toBeNull();
    });
  });
});
