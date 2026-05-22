import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { coreDb, resetCoreDb } from '../src/db/client.ts';
import { coreNotifications } from '../src/db/schema/notifications.ts';
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '../src/notifications/index.ts';
import { waitFor, withCoreTestDb } from '../test/test-helpers.ts';

async function seedOne(tenantId: string, userId: string): Promise<string> {
  const [row] = await coreDb()
    .insert(coreNotifications)
    .values({
      tenantId,
      userId,
      eventType: 'test',
      sourceEventId: crypto.randomUUID(),
      payload: {},
    })
    .returning({ id: coreNotifications.id });
  if (!row) throw new Error('seed failed');
  return row.id;
}

describe('notification mutations', () => {
  it('markNotificationRead sets read_at when null, idempotent', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const id = await seedOne(tenantId, userId);

      const listener = await pool.connect();
      const got: string[] = [];
      listener.on('notification', (m) => {
        if (m.channel === 'core_notifications' && m.payload) got.push(m.payload);
      });
      await listener.query('LISTEN core_notifications');

      try {
        const res1 = await markNotificationRead({ id, userId, tenantId });
        expect(res1.read_at).not.toBeNull();
        const firstReadAt = res1.read_at;

        const res2 = await markNotificationRead({ id, userId, tenantId });
        expect(res2.read_at).toBe(firstReadAt);

        await waitFor(() => got.includes(userId));
      } finally {
        await listener.query('UNLISTEN core_notifications');
        listener.release();
      }
    });
  });

  it('markNotificationRead refuses to cross users', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
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
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await seedOne(tenantId, userId);
      await seedOne(tenantId, userId);
      await seedOne(tenantId, userId);
      const { updated } = await markAllNotificationsRead({ userId, tenantId });
      expect(updated).toBe(3);
      const stillUnread = await coreDb()
        .select({ id: coreNotifications.id })
        .from(coreNotifications)
        .where(and(eq(coreNotifications.userId, userId), eq(coreNotifications.tenantId, tenantId)));
      const { updated: again } = await markAllNotificationsRead({ userId, tenantId });
      expect(again).toBe(0);
      expect(stillUnread).toHaveLength(3);
    });
  });

  it('dismissNotification sets dismissed_at and excludes the row from queries', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const id = await seedOne(tenantId, userId);
      const res = await dismissNotification({ id, userId, tenantId });
      expect(res.dismissed_at).not.toBeNull();
    });
  });
});
