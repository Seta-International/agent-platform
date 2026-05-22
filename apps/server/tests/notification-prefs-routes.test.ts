import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { NotificationStreamHub } from '../src/notifications-stream/hub.ts';
import { registerNotificationsRoutes } from '../src/routes/notifications.ts';

function buildSession(opts: {
  tenant_id: string;
  user_id: string;
  roles?: string[];
}): SessionScope {
  const role_summary = {
    roles: opts.roles ?? ['tenant.admin'],
    cross_tenant_read: false,
  };
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

describe('GET /api/core/v1/notification-prefs', () => {
  it('returns the matrix with 8 default rows for tenant admin', async () => {
    await withTest(async () => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const app = buildTestApp(buildSession({ tenant_id: tenantId, user_id: userId }));
      const res = await app.request('/api/core/v1/notification-prefs');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        rows: Array<{
          event_type: string;
          in_app_enabled: boolean;
          email_enabled: boolean;
          email_available: boolean;
        }>;
      };
      expect(body.rows).toHaveLength(8);
      expect(body.rows[0]).toMatchObject({
        in_app_enabled: true,
        email_enabled: false,
        email_available: false,
      });
    });
  });

  it('returns 403 for non-admin caller', async () => {
    await withTest(async () => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const app = buildTestApp(
        buildSession({ tenant_id: tenantId, user_id: userId, roles: ['planner.member'] }),
      );
      const res = await app.request('/api/core/v1/notification-prefs');
      expect(res.status).toBe(403);
    });
  });
});

describe('PATCH /api/core/v1/notification-prefs', () => {
  it('persists a toggle and reads it back', async () => {
    await withTest(async ({ pool }) => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
        tenantId,
      ]);
      const app = buildTestApp(buildSession({ tenant_id: tenantId, user_id: userId }));
      const patch = await app.request('/api/core/v1/notification-prefs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_type: 'planner.task.assigned',
          channel: 'in_app',
          enabled: false,
        }),
      });
      expect(patch.status).toBe(200);

      const get = await app.request('/api/core/v1/notification-prefs');
      const body = (await get.json()) as {
        rows: Array<{ event_type: string; in_app_enabled: boolean }>;
      };
      const row = body.rows.find((r) => r.event_type === 'planner.task.assigned');
      expect(row?.in_app_enabled).toBe(false);
    });
  });

  it('rejects unknown event_type with 400', async () => {
    await withTest(async ({ pool }) => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
        tenantId,
      ]);
      const app = buildTestApp(buildSession({ tenant_id: tenantId, user_id: userId }));
      const res = await app.request('/api/core/v1/notification-prefs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_type: 'not.a.real.event',
          channel: 'in_app',
          enabled: false,
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('rejects malformed body with 400', async () => {
    await withTest(async ({ pool }) => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
        tenantId,
      ]);
      const app = buildTestApp(buildSession({ tenant_id: tenantId, user_id: userId }));
      const res = await app.request('/api/core/v1/notification-prefs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_type: 'planner.task.assigned',
          channel: 'sms',
          enabled: true,
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('returns 403 for non-admin', async () => {
    await withTest(async ({ pool }) => {
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
        tenantId,
      ]);
      const app = buildTestApp(
        buildSession({ tenant_id: tenantId, user_id: userId, roles: ['planner.member'] }),
      );
      const res = await app.request('/api/core/v1/notification-prefs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_type: 'planner.task.assigned',
          channel: 'in_app',
          enabled: false,
        }),
      });
      expect(res.status).toBe(403);
    });
  });
});
