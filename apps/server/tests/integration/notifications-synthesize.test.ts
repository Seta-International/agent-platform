import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { registerNotificationsRoutes } from '@seta/notifications/http';
import { NotificationStreamHub } from '@seta/notifications/stream';
import { resetNotificationsDb } from '@seta/notifications/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

function buildSession(userId: string, tenantId: string): SessionScope {
  const role_summary = { roles: ['org.admin'], cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: userId,
    tenant_id: tenantId,
    email: 'x@test',
    display_name: 'X',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

function buildApp(session: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session);
    await next();
  });
  registerNotificationsRoutes(app, new NotificationStreamHub());
  return app;
}

describe('POST /api/notifications/v1/__dev/synthesize (dev)', () => {
  it('emits a notification.requested event for the caller and returns 202', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetNotificationsDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
            tenantId,
          ]);
          const app = buildApp(buildSession(userId, tenantId));
          const res = await app.request('/api/notifications/v1/__dev/synthesize', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ event_type: 'core.dev.sample', payload: { title: 'hi' } }),
          });
          expect(res.status).toBe(202);

          const rows = await pool.query<{ event_type: string }>(
            `SELECT event_type FROM core.events
              WHERE event_type = 'notification.requested'
                AND tenant_id = $1::uuid`,
            [tenantId],
          );
          expect(rows.rows).toHaveLength(1);
        } finally {
          resetCoreDb();
          resetNotificationsDb();
          await closePools();
        }
      },
    );
  });
});
