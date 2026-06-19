import type { SessionEnv, SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { registerPeopleWorkersRoutes } from '../../src/backend/http/workers.ts';
import { peopleErrorMapper } from '../../src/register.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function buildApp(scope: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope);
    await next();
  });
  registerPeopleWorkersRoutes(app);
  app.onError((err, c) => {
    const mapped = peopleErrorMapper(err);
    if (mapped) return c.json(mapped.body, mapped.status as Parameters<typeof c.json>[1]);
    throw err;
  });
  return app;
}

function withDb(
  fn: (ctx: {
    tenant_id: string;
    admin_user_id: string;
    adminSession: SessionScope;
    pool: import('pg').Pool;
  }) => Promise<void>,
): Promise<void> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      await fn({ ...t, pool });
    } finally {
      resetPeopleDb();
      resetCoreDb();
      await closePools();
    }
  });
}

describe('People workers HTTP routes', () => {
  it('GET /workers lists created worker', async () => {
    await withDb(async ({ adminSession }) => {
      const app = buildApp(adminSession);

      const createRes = await app.request('/api/people/v1/workers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full_name: 'Alice Tester' }),
      });
      expect(createRes.status).toBe(201);

      const listRes = await app.request('/api/people/v1/workers');
      expect(listRes.status).toBe(200);
      const body = (await listRes.json()) as { workers: Array<{ full_name: string }> };
      expect(body.workers.some((w) => w.full_name === 'Alice Tester')).toBe(true);
    });
  });

  it('POST /workers returns 201 with worker_id', async () => {
    await withDb(async ({ adminSession }) => {
      const app = buildApp(adminSession);
      const res = await app.request('/api/people/v1/workers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full_name: 'Bob Creator' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { worker_id: string };
      expect(typeof body.worker_id).toBe('string');
    });
  });

  it('GET /workers/:id returns the worker', async () => {
    await withDb(async ({ adminSession }) => {
      const app = buildApp(adminSession);
      const createRes = await app.request('/api/people/v1/workers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full_name: 'Carol Detail' }),
      });
      const { worker_id } = (await createRes.json()) as { worker_id: string };

      const res = await app.request(`/api/people/v1/workers/${worker_id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { full_name: string };
      expect(body.full_name).toBe('Carol Detail');
    });
  });

  it('PATCH /workers/:id edits and bumps version', async () => {
    await withDb(async ({ adminSession }) => {
      const app = buildApp(adminSession);
      const createRes = await app.request('/api/people/v1/workers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full_name: 'Dan Editor' }),
      });
      const { worker_id } = (await createRes.json()) as { worker_id: string };

      const patchRes = await app.request(`/api/people/v1/workers/${worker_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patch: { full_name: 'Dan Edited' } }),
      });
      expect(patchRes.status).toBe(200);
      const patchBody = (await patchRes.json()) as { version: number };
      expect(patchBody.version).toBeGreaterThan(1);
    });
  });

  it('GET /workers/:id/history returns change rows after edit', async () => {
    await withDb(async ({ adminSession }) => {
      const app = buildApp(adminSession);
      const createRes = await app.request('/api/people/v1/workers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full_name: 'Eve History' }),
      });
      const { worker_id } = (await createRes.json()) as { worker_id: string };

      await app.request(`/api/people/v1/workers/${worker_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patch: { phone: '555-9876' } }),
      });

      const histRes = await app.request(`/api/people/v1/workers/${worker_id}/history`);
      expect(histRes.status).toBe(200);
      const body = (await histRes.json()) as { history: Array<{ action: string }> };
      expect(body.history.length).toBeGreaterThan(0);
    });
  });

  it('POST with empty full_name returns 400 VALIDATION', async () => {
    await withDb(async ({ adminSession }) => {
      const app = buildApp(adminSession);
      const res = await app.request('/api/people/v1/workers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full_name: '' }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('POST by viewer session returns 403', async () => {
    await withDb(async ({ tenant_id, admin_user_id }) => {
      const viewerSession = buildSession({
        tenant_id,
        user_id: admin_user_id,
        roles: ['people.viewer'],
      });
      const app = buildApp(viewerSession);
      const res = await app.request('/api/people/v1/workers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full_name: 'Should Fail' }),
      });
      expect(res.status).toBe(403);
    });
  });

  it('GET /workers/:id with unknown id returns 404', async () => {
    await withDb(async ({ adminSession }) => {
      const app = buildApp(adminSession);
      const res = await app.request(`/api/people/v1/workers/${crypto.randomUUID()}`);
      expect(res.status).toBe(404);
    });
  });
});
