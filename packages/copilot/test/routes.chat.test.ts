import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerCopilotRoutes } from '../src/backend/routes.ts';
import { withCopilotTestDb } from './test-helpers.ts';

type TestSession = {
  tenant_id: string;
  user_id: string;
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
};

const fakeAgent = {
  stream: async () => ({}) as never,
};

const fakeMastra = { getStorage: () => null } as never;
const fakeSessionAgents = {
  get: (name: string) => (name === 'router' ? fakeAgent : undefined),
  names: () => ['router'],
  specs: () => [{ name: 'router', label: 'R', description: 'r', instructions: '', tools: [] }],
};
const fakeFactory = Object.assign(() => fakeSessionAgents, {
  specs: [{ name: 'router', label: 'R', description: 'r', instructions: '', tools: [] }],
  names: ['router'],
}) as never;

const v6UserMessage = (text: string) => ({
  id: 'm-1',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text }],
});

describe('POST /api/copilot/v1/chat/:agentName', () => {
  it('returns 401 when no session', async () => {
    const app = new Hono<{ Variables: { session: TestSession } }>();
    registerCopilotRoutes(app, { factory: fakeFactory, mastra: fakeMastra });
    const res = await app.request('/api/copilot/v1/chat/router', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [v6UserMessage('hi')] }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when session lacks copilot.chat.use', async () => {
    const app = new Hono<{ Variables: { session: TestSession } }>();
    app.use('*', async (c, next) => {
      c.set('session', {
        tenant_id: 't',
        user_id: 'u',
        effective_permissions: new Set<string>(),
        role_summary: { roles: [], cross_tenant_read: false },
      });
      await next();
    });
    registerCopilotRoutes(app, { factory: fakeFactory, mastra: fakeMastra });
    const res = await app.request('/api/copilot/v1/chat/router', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [v6UserMessage('hi')] }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown agent name', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['copilot.chat.use']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerCopilotRoutes(app, { factory: fakeFactory, mastra: fakeMastra });
      const res = await app.request('/api/copilot/v1/chat/unknown', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [v6UserMessage('hi')] }),
      });
      expect(res.status).toBe(404);
    });
  });

  it('returns 400 for invalid body', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['copilot.chat.use']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerCopilotRoutes(app, { factory: fakeFactory, mastra: fakeMastra });
      const res = await app.request('/api/copilot/v1/chat/router', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      expect(res.status).toBe(400);
    });
  });
});
