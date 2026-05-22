import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { NotificationStreamHub } from '../src/notifications-stream/hub.ts';
import { registerNotificationsRoutes } from '../src/routes/notifications.ts';

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

describe('POST /api/core/v1/notifications/__dev/synthesize (dev)', () => {
  it('emits a core.notification.requested event for the caller and returns 202', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'T', 't')`, [
            tenantId,
          ]);
          const app = buildApp(buildSession(userId, tenantId));
          const res = await app.request('/api/core/v1/notifications/__dev/synthesize', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ event_type: 'core.dev.sample', payload: { title: 'hi' } }),
          });
          expect(res.status).toBe(202);

          const rows = await pool.query<{ event_type: string }>(
            `SELECT event_type FROM core.events
              WHERE event_type = 'core.notification.requested'
                AND tenant_id = $1::uuid`,
            [tenantId],
          );
          expect(rows.rows).toHaveLength(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
