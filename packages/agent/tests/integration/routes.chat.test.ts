import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { registerAgentRoutes } from '../../src/backend/routes.ts';
import { withAgentTestDb } from '../helpers.ts';

type TestSession = {
  tenant_id: string;
  user_id: string;
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
};

const fakeSupervisor = {
  stream: async () => ({}) as never,
} as never;

const fakeMastra = { getStorage: () => null } as never;
const fakePool = {
  connect: async () => {
    throw new Error('no pool in unit test');
  },
} as unknown as Pool;

const v6UserMessage = (text: string) => ({
  id: 'm-1',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text }],
});

describe('POST /api/agent/v1/chat', () => {
  it('returns 401 when no session', async () => {
    const app = new Hono<{ Variables: { session: TestSession } }>();
    registerAgentRoutes(app, { supervisor: fakeSupervisor, mastra: fakeMastra, pool: fakePool });
    const res = await app.request('/api/agent/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [v6UserMessage('hi')] }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when session lacks agent.chat.use', async () => {
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
    registerAgentRoutes(app, { supervisor: fakeSupervisor, mastra: fakeMastra, pool: fakePool });
    const res = await app.request('/api/agent/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [v6UserMessage('hi')] }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['agent.chat.use']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        supervisor: fakeSupervisor,
        mastra: fakeMastra,
        pool: fakePool,
      });
      const res = await app.request('/api/agent/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('returns 404 when the supplied id belongs to another user', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
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
          };
        };
      };
      await storage.init();
      const now = new Date();
      const foreignThreadId = 'foreign-thread-1';
      await storage.stores.memory.saveThread({
        thread: {
          id: foreignThreadId,
          resourceId: 'someone-else',
          title: 'not mine',
          createdAt: now,
          updatedAt: now,
          metadata: {},
        },
      });

      // The supervisor should never be called — failure mode is leaking
      // another user's thread. Surface that loudly if the guard regresses.
      const trippedSupervisor = {
        stream: async () => {
          throw new Error('supervisor.stream should not be reached when ownership check fires');
        },
      } as never;

      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['agent.chat.use']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        supervisor: trippedSupervisor,
        mastra: mastra as never,
        pool,
      });

      const res = await app.request('/api/agent/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: foreignThreadId, messages: [v6UserMessage('hijack')] }),
      });
      expect(res.status).toBe(404);
    });
  });

  it('injects a [Context: ...] prefix into the last user message when a data-page-context part is present', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });

      const captured: { messages?: unknown[] } = {};
      const recordingSupervisor = {
        stream: async (messages: unknown[]) => {
          captured.messages = messages;
          return {} as never;
        },
      } as never;

      const app = new Hono<{ Variables: { session: TestSession } }>();
      app.use('*', async (c, next) => {
        c.set('session', {
          tenant_id,
          user_id: admin_user_id,
          effective_permissions: new Set(['agent.chat.use']),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        supervisor: recordingSupervisor,
        mastra: fakeMastra,
        pool: fakePool,
      });

      const res = await app.request('/api/agent/v1/chat', {
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

describe('GET /api/agent/v1/threads/:id (data-page-context round-trip)', () => {
  it('returns data-page-context parts verbatim from stored messages', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
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
            'agent.chat.use',
            'agent.thread.read.self',
            'agent.thread.write.self',
          ]),
          role_summary: { roles: ['org.admin'], cross_tenant_read: false },
        });
        await next();
      });
      registerAgentRoutes(app, {
        supervisor: fakeSupervisor,
        mastra: mastra as never,
        pool,
      });

      const res = await app.request(`/api/agent/v1/threads/${threadId}`);
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
