import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { registerCopilotRoutes } from '../../src/backend/routes.ts';
import { withCopilotTestDb } from '../helpers.ts';

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
const fakePool = {
  connect: async () => {
    throw new Error('no pool in unit test');
  },
} as unknown as Pool;
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
    registerCopilotRoutes(app, { factory: fakeFactory, mastra: fakeMastra, pool: fakePool });
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
    registerCopilotRoutes(app, { factory: fakeFactory, mastra: fakeMastra, pool: fakePool });
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
      registerCopilotRoutes(app, { factory: fakeFactory, mastra: fakeMastra, pool: fakePool });
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
      registerCopilotRoutes(app, { factory: fakeFactory, mastra: fakeMastra, pool: fakePool });
      const res = await app.request('/api/copilot/v1/chat/router', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('injects a [Context: ...] prefix into the last user message when a data-page-context part is present', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });

      // Recording factory whose agent.stream captures the messages it receives.
      const captured: { messages?: unknown[] } = {};
      const recordingAgent = {
        stream: async (messages: unknown[]) => {
          captured.messages = messages;
          return {} as never;
        },
      };
      const recordingSessionAgents = {
        get: (name: string) => (name === 'router' ? recordingAgent : undefined),
        names: () => ['router'],
        specs: () => [
          { name: 'router', label: 'R', description: 'r', instructions: '', tools: [] },
        ],
      };
      const recordingFactory = Object.assign(() => recordingSessionAgents, {
        specs: [{ name: 'router', label: 'R', description: 'r', instructions: '', tools: [] }],
        names: ['router'],
      }) as never;

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
      registerCopilotRoutes(app, {
        factory: recordingFactory,
        mastra: fakeMastra,
        pool: fakePool,
      });

      const res = await app.request('/api/copilot/v1/chat/router', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              id: 'm1',
              role: 'user',
              parts: [
                { type: 'text', text: 'help me reorder this' },
                {
                  type: 'data-page-context',
                  id: 'p1',
                  data: {
                    kind: 'planner.task',
                    id: 'task-8f3e',
                    label: 'Q3 launch',
                    summary: 'Marketing checklist.',
                  },
                },
              ],
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const last = (captured.messages ?? []).at(-1) as
        | { parts: Array<{ type: string; text?: string }> }
        | undefined;
      const text = (last?.parts ?? []).find((p) => p.type === 'text') as
        | { text: string }
        | undefined;
      expect(text?.text).toBe(
        '[Context: planner.task#task-8f3e — "Q3 launch"\nSummary: Marketing checklist.]\n\nhelp me reorder this',
      );
    });
  });
});

describe('GET /api/copilot/v1/threads/:id (data-page-context round-trip)', () => {
  it('returns data-page-context parts verbatim from stored messages', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const { buildMastra } = await import('../../src/backend/runtime.ts');
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage() as unknown as {
        init: () => Promise<void>;
        stores: {
          memory: {
            saveThread: (args: {
              thread: {
                id: string;
                resourceId: string;
                title?: string;
                createdAt: Date;
                updatedAt: Date;
                metadata?: Record<string, unknown>;
              };
            }) => Promise<unknown>;
            saveMessages: (args: { messages: unknown[] }) => Promise<unknown>;
          };
        };
      };
      await storage.init();

      const threadId = 'thread-ctx-1';
      const now = new Date();
      await storage.stores.memory.saveThread({
        thread: {
          id: threadId,
          resourceId: admin_user_id,
          title: 'with context',
          createdAt: now,
          updatedAt: now,
          metadata: {},
        },
      });
      await storage.stores.memory.saveMessages({
        messages: [
          {
            id: 'msg-ctx-1',
            threadId,
            resourceId: admin_user_id,
            role: 'user',
            createdAt: now,
            content: {
              format: 2,
              parts: [
                { type: 'text', text: 'hi' },
                {
                  type: 'data-page-context',
                  id: 'p1',
                  data: { kind: 'planner.task', id: 't1', label: 'X' },
                },
              ],
            },
          },
        ],
      });

      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set([
            'copilot.chat.use',
            'copilot.thread.read.self',
            'copilot.thread.write.self',
          ]),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerCopilotRoutes(app, {
        factory: (() => ({})) as never,
        mastra: mastra as never,
        pool,
      });

      const res = await app.request(`/api/copilot/v1/threads/${threadId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        messages: Array<{ parts: Array<{ type: string; data?: { id: string } }> }>;
      };
      const m = body.messages[0];
      expect(m).toBeDefined();
      const part = m?.parts.find((p) => p.type === 'data-page-context');
      expect(part).toBeDefined();
      expect(part?.data?.id).toBe('t1');
    });
  });
});
