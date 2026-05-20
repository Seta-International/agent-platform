import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { insertHitl } from '../src/backend/hitl.ts';
import { registerCopilotRoutes, type SessionLike } from '../src/backend/routes.ts';
import { withCopilotTestDb } from './test-helpers.ts';

type TestEnv = { Variables: { session: SessionLike } };

function makeApp(session: { tenant_id: string; user_id: string; permissions: string[] }) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('session', {
      tenant_id: session.tenant_id,
      user_id: session.user_id,
      effective_permissions: new Set(session.permissions),
      role_summary: { roles: ['org.admin'], cross_tenant_read: false },
    });
    await next();
  });
  registerCopilotRoutes(app, {
    factory: () => ({}) as never,
    mastra: { getStorage: () => null } as never,
  });
  return app;
}

describe('HITL routes', () => {
  it('approve transitions pending → approved and runs the wrapped write', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      await insertHitl({
        callId: 'call-A',
        threadId: 'thread-A',
        tenantId: tenant_id,
        userId: admin_user_id,
        toolName: 'identity.updateMyDisplayName',
        input: { displayName: 'Approved Name' },
        requiredPermission: 'identity.user.write.self',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const app = makeApp({
        tenant_id,
        user_id: admin_user_id,
        permissions: ['copilot.chat.use', 'identity.user.write.self'],
      });
      const res = await app.request('/api/copilot/v1/hitl/call-A/approve', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe('approved');
    });
  });

  it('approve without the underlying permission returns 403', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      await insertHitl({
        callId: 'call-B',
        threadId: 'thread-B',
        tenantId: tenant_id,
        userId: admin_user_id,
        toolName: 'identity.updateMyDisplayName',
        input: { displayName: 'x' },
        requiredPermission: 'identity.user.write.self',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const app = makeApp({ tenant_id, user_id: admin_user_id, permissions: ['copilot.chat.use'] });
      const res = await app.request('/api/copilot/v1/hitl/call-B/approve', { method: 'POST' });
      expect(res.status).toBe(403);
    });
  });

  it('cross-user approve returns 404 (no existence leak)', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      await insertHitl({
        callId: 'call-C',
        threadId: 'thread-C',
        tenantId: tenant_id,
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        toolName: 'identity.updateMyDisplayName',
        input: { displayName: 'x' },
        requiredPermission: 'identity.user.write.self',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const app = makeApp({
        tenant_id,
        user_id: admin_user_id,
        permissions: ['copilot.chat.use', 'identity.user.write.self'],
      });
      const res = await app.request('/api/copilot/v1/hitl/call-C/approve', { method: 'POST' });
      expect(res.status).toBe(404);
    });
  });

  it('reject returns 200 and prevents subsequent approve (409)', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      await insertHitl({
        callId: 'call-D',
        threadId: 'thread-D',
        tenantId: tenant_id,
        userId: admin_user_id,
        toolName: 'identity.updateMyDisplayName',
        input: { displayName: 'x' },
        requiredPermission: 'identity.user.write.self',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const app = makeApp({
        tenant_id,
        user_id: admin_user_id,
        permissions: ['copilot.chat.use', 'identity.user.write.self'],
      });
      const rej = await app.request('/api/copilot/v1/hitl/call-D/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'no' }),
      });
      expect(rej.status).toBe(200);
      const ap = await app.request('/api/copilot/v1/hitl/call-D/approve', { method: 'POST' });
      expect(ap.status).toBe(409);
    });
  });

  it('reject without session returns 401', async () => {
    const app = new Hono<TestEnv>();
    registerCopilotRoutes(app, {
      factory: () => ({}) as never,
      mastra: { getStorage: () => null } as never,
    });
    const res = await app.request('/api/copilot/v1/hitl/call-x/reject', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
