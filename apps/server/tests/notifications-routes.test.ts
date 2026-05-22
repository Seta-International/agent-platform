import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import * as coreSchema from '@seta/core/db/schema';
import { coreNotifications } from '@seta/core/db/schema';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, createDb, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { NotificationStreamHub } from '../src/notifications-stream/hub.ts';
import { registerNotificationsRoutes } from '../src/routes/notifications.ts';

function buildSession(opts: { tenant_id: string; user_id: string }): SessionScope {
  const role_summary = { roles: ['org.admin'], cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: `${opts.user_id}@test`,
    display_name: 'User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

function buildTestApp(session: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session);
    await next();
  });
  registerNotificationsRoutes(app, new NotificationStreamHub());
  return app;
}

async function seedNotification(opts: {
  pool: Pool;
  tenantId: string;
  userId: string;
  read?: boolean;
}): Promise<string> {
  const db = createDb(opts.pool, coreSchema, { schemaFilter: ['core'] });
  const [row] = await db
    .insert(coreNotifications)
    .values({
      tenantId: opts.tenantId,
      userId: opts.userId,
      eventType: 'test.event',
      sourceEventId: crypto.randomUUID(),
      payload: { title: 'hi' },
      readAt: opts.read ? new Date() : null,
    })
    .returning({ id: coreNotifications.id });
  if (!row) throw new Error('seed failed');
  return row.id;
}

async function withTest<T>(fn: (ctx: { pool: Pool }) => Promise<T>): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

describe('GET /api/core/v1/notifications', () => {
  it('returns only the caller-tenant rows, paginated', async () => {
    await withTest(async ({ pool }) => {
      const tenantA = crypto.randomUUID();
      const tenantB = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const otherUserId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'A', 'a'), ($2, 'B', 'b')`,
        [tenantA, tenantB],
      );
      for (let i = 0; i < 3; i++) {
        await seedNotification({ pool, tenantId: tenantA, userId });
      }
      await seedNotification({ pool, tenantId: tenantA, userId: otherUserId });
      await seedNotification({ pool, tenantId: tenantB, userId });

      const app = buildTestApp(buildSession({ tenant_id: tenantA, user_id: userId }));
      const res = await app.request('/api/core/v1/notifications?limit=2');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: Array<{ id: string }>;
        next_cursor: string | null;
      };
      expect(body.items).toHaveLength(2);
      expect(body.next_cursor).not.toBeNull();

      const page2 = await app.request(
        `/api/core/v1/notifications?limit=2&cursor=${encodeURIComponent(body.next_cursor as string)}`,
      );
      const body2 = (await page2.json()) as typeof body;
      expect(body2.items).toHaveLength(1);
      expect(body2.next_cursor).toBeNull();
    });
  });

  it('respects unread=true', async () => {
    await withTest(async ({ pool }) => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
        tenantId,
      ]);
      await seedNotification({ pool, tenantId, userId });
      await seedNotification({ pool, tenantId, userId, read: true });

      const app = buildTestApp(buildSession({ tenant_id: tenantId, user_id: userId }));
      const res = await app.request('/api/core/v1/notifications?unread=true');
      const body = (await res.json()) as { items: unknown[] };
      expect(body.items).toHaveLength(1);
    });
  });
});

describe('GET /api/core/v1/notifications/unread-count', () => {
  it('counts only the caller-tenant unread rows', async () => {
    await withTest(async ({ pool }) => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
        tenantId,
      ]);
      await seedNotification({ pool, tenantId, userId });
      await seedNotification({ pool, tenantId, userId });
      await seedNotification({ pool, tenantId, userId, read: true });

      const app = buildTestApp(buildSession({ tenant_id: tenantId, user_id: userId }));
      const res = await app.request('/api/core/v1/notifications/unread-count');
      expect(await res.json()).toEqual({ count: 2 });
    });
  });
});

describe('POST /api/core/v1/notifications/:id/read', () => {
  it('marks the row read; 404 when another user tries', async () => {
    await withTest(async ({ pool }) => {
      const tenantId = crypto.randomUUID();
      const owner = crypto.randomUUID();
      const intruder = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
        tenantId,
      ]);
      const id = await seedNotification({ pool, tenantId, userId: owner });

      const intruderApp = buildTestApp(buildSession({ tenant_id: tenantId, user_id: intruder }));
      const r404 = await intruderApp.request(`/api/core/v1/notifications/${id}/read`, {
        method: 'POST',
      });
      expect(r404.status).toBe(404);

      const ownerApp = buildTestApp(buildSession({ tenant_id: tenantId, user_id: owner }));
      const ok = await ownerApp.request(`/api/core/v1/notifications/${id}/read`, {
        method: 'POST',
      });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { read_at: string | null };
      expect(body.read_at).not.toBeNull();
    });
  });
});

describe('POST /api/core/v1/notifications/read-all', () => {
  it('marks every unread row of the caller', async () => {
    await withTest(async ({ pool }) => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
        tenantId,
      ]);
      await seedNotification({ pool, tenantId, userId });
      await seedNotification({ pool, tenantId, userId });

      const app = buildTestApp(buildSession({ tenant_id: tenantId, user_id: userId }));
      const res = await app.request('/api/core/v1/notifications/read-all', { method: 'POST' });
      expect(await res.json()).toEqual({ updated: 2 });
      const after = await app.request('/api/core/v1/notifications/unread-count');
      expect(await after.json()).toEqual({ count: 0 });
    });
  });
});

describe('POST /api/core/v1/notifications/:id/dismiss', () => {
  it('sets dismissed_at; the row no longer appears in list', async () => {
    await withTest(async ({ pool }) => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
        tenantId,
      ]);
      const id = await seedNotification({ pool, tenantId, userId });

      const app = buildTestApp(buildSession({ tenant_id: tenantId, user_id: userId }));
      const dismissed = await app.request(`/api/core/v1/notifications/${id}/dismiss`, {
        method: 'POST',
      });
      expect(dismissed.status).toBe(200);

      const list = await app.request('/api/core/v1/notifications');
      const body = (await list.json()) as { items: unknown[] };
      expect(body.items).toHaveLength(0);
    });
  });
});
