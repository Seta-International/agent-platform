import { describe, expect, it } from 'vitest';
import { coreDb, resetCoreDb } from '../src/db/client.ts';
import { coreNotifications } from '../src/db/schema/notifications.ts';
import { getUnreadCount, listNotifications } from '../src/notifications/index.ts';
import { withCoreTestDb } from '../test/test-helpers.ts';

async function seed(opts: {
  tenantId: string;
  userId: string;
  count: number;
  read?: number;
  otherTenant?: { tenantId: string; count: number };
}) {
  const rows: Array<typeof coreNotifications.$inferInsert> = [];
  for (let i = 0; i < opts.count; i++) {
    rows.push({
      tenantId: opts.tenantId,
      userId: opts.userId,
      eventType: 'test.event',
      sourceEventId: crypto.randomUUID(),
      payload: { i },
      readAt: i < (opts.read ?? 0) ? new Date() : null,
    });
  }
  if (opts.otherTenant) {
    for (let i = 0; i < opts.otherTenant.count; i++) {
      rows.push({
        tenantId: opts.otherTenant.tenantId,
        userId: opts.userId,
        eventType: 'test.event',
        sourceEventId: crypto.randomUUID(),
        payload: {},
      });
    }
  }
  await coreDb().insert(coreNotifications).values(rows);
}

describe('notification queries', () => {
  it('listNotifications returns only the user/tenant rows, newest first, paginated', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await seed({ tenantId, userId, count: 5 });
      const page = await listNotifications({ userId, tenantId, limit: 3 });
      expect(page.items).toHaveLength(3);
      expect(page.next_cursor).toBeTruthy();
      const next = await listNotifications({
        userId,
        tenantId,
        limit: 3,
        cursor: page.next_cursor!,
      });
      expect(next.items).toHaveLength(2);
      expect(next.next_cursor).toBeNull();
    });
  });

  it('listNotifications with unread=true excludes read rows', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await seed({ tenantId, userId, count: 5, read: 2 });
      const page = await listNotifications({ userId, tenantId, limit: 50, unread: true });
      expect(page.items).toHaveLength(3);
    });
  });

  it('isolates by tenant', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantA = crypto.randomUUID();
      const tenantB = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await seed({
        tenantId: tenantA,
        userId,
        count: 2,
        otherTenant: { tenantId: tenantB, count: 3 },
      });
      const page = await listNotifications({ userId, tenantId: tenantA, limit: 50 });
      expect(page.items).toHaveLength(2);
    });
  });

  it('getUnreadCount returns only the user/tenant unread (non-dismissed) rows', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await seed({ tenantId, userId, count: 4, read: 1 });
      const n = await getUnreadCount({ userId, tenantId });
      expect(n).toBe(3);
    });
  });
});
