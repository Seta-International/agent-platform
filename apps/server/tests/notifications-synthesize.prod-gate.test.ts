import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotificationStreamHub } from '../src/notifications-stream/hub.ts';
import { registerNotificationsRoutes } from '../src/routes/notifications.ts';

describe('POST /api/core/v1/notifications/__dev/synthesize (prod)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  beforeAll(() => {
    process.env.NODE_ENV = 'production';
  });
  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns 404 when NODE_ENV=production', async () => {
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const role_summary = { roles: ['org.admin'], cross_tenant_read: false };
    const session: SessionScope = {
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
    const app = new Hono<SessionEnv>();
    app.use('*', async (c, next) => {
      c.set('user', session);
      await next();
    });
    registerNotificationsRoutes(app, new NotificationStreamHub());
    const res = await app.request('/api/core/v1/notifications/__dev/synthesize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'core.dev.sample', payload: {} }),
    });
    expect(res.status).toBe(404);
  });
});
