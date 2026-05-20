import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerCopilotRoutes } from '../src/backend/routes.ts';
import { buildMastra } from '../src/backend/runtime.ts';
import { withCopilotTestDb } from './test-helpers.ts';

type TestSession = {
  tenant_id: string;
  user_id: string;
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
};

type StorageWithStores = {
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

async function seedThread(
  storage: unknown,
  thread: { id: string; resourceId: string; title?: string },
): Promise<void> {
  const now = new Date();
  await (storage as StorageWithStores).stores.memory.saveThread({
    thread: {
      id: thread.id,
      resourceId: thread.resourceId,
      title: thread.title,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    },
  });
}

function makeApp(args: {
  tenant_id: string;
  user_id: string;
  permissions?: string[];
  mastra: unknown;
}) {
  const app = new Hono<{ Variables: { session: TestSession } }>();
  app.use('*', async (c, next) => {
    c.set('session', {
      tenant_id: args.tenant_id,
      user_id: args.user_id,
      effective_permissions: new Set(
        args.permissions ?? [
          'copilot.chat.use',
          'copilot.thread.read.self',
          'copilot.thread.write.self',
        ],
      ),
      role_summary: { roles: ['org.admin'], cross_tenant_read: false },
    });
    await next();
  });
  registerCopilotRoutes(app, { factory: (() => ({})) as never, mastra: args.mastra as never });
  return app;
}

describe('threads routes', () => {
  it('GET /threads returns empty list initially', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage();
      await (storage as { init: () => Promise<void> }).init();

      const app = makeApp({ tenant_id, user_id: admin_user_id, mastra });
      const res = await app.request('/api/copilot/v1/threads');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { threads: unknown[] };
      expect(body.threads).toEqual([]);
    });
  });

  it('GET /threads/:id returns 404 for a foreign thread', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage();
      await (storage as { init: () => Promise<void> }).init();

      await seedThread(storage, { id: 'foreign-1', resourceId: 'someone-else', title: 'foreign' });

      const app = makeApp({ tenant_id, user_id: admin_user_id, mastra });
      const res = await app.request('/api/copilot/v1/threads/foreign-1');
      expect(res.status).toBe(404);
    });
  });

  it('PATCH /threads/:id returns 404 for a foreign thread (not 403)', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage();
      await (storage as { init: () => Promise<void> }).init();

      await seedThread(storage, { id: 'foreign-2', resourceId: 'someone-else', title: 'foreign' });

      const app = makeApp({ tenant_id, user_id: admin_user_id, mastra });
      const res = await app.request('/api/copilot/v1/threads/foreign-2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'renamed' }),
      });
      expect(res.status).toBe(404);
    });
  });

  it('GET /threads returns 401 when session missing', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage();
      await (storage as { init: () => Promise<void> }).init();

      const app = new Hono<{ Variables: { session: TestSession } }>();
      registerCopilotRoutes(app, { factory: (() => ({})) as never, mastra: mastra as never });
      const res = await app.request('/api/copilot/v1/threads');
      expect(res.status).toBe(401);
    });
  });

  it('GET /threads returns 403 when permission missing', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const mastra = buildMastra({ pool, databaseUrl });
      const storage = mastra.getStorage();
      await (storage as { init: () => Promise<void> }).init();

      const app = makeApp({
        tenant_id,
        user_id: admin_user_id,
        permissions: ['copilot.chat.use'],
        mastra,
      });
      const res = await app.request('/api/copilot/v1/threads');
      expect(res.status).toBe(403);
    });
  });
});
