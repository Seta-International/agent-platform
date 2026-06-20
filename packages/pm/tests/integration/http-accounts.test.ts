import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { buildPmRoutes } from '../../src/backend/http/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function appFor(session: unknown) {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session as never);
    await next();
  });
  app.route('/', buildPmRoutes({} as never));
  return app;
}

describe('pm accounts HTTP', () => {
  it('POST creates, GET lists, PATCH edits, PUT sets recruiters', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);

        const created = await app.request('/api/pm/v1/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Acme', industry: 'Fintech' }),
        });
        expect(created.status).toBe(201);
        const { account_id } = (await created.json()) as { account_id: string };

        const listed = await app.request('/api/pm/v1/accounts');
        expect(listed.status).toBe(200);
        const list = (await listed.json()) as { accounts: Array<{ account_id: string }> };
        expect(list.accounts.some((a) => a.account_id === account_id)).toBe(true);

        const patched = await app.request(`/api/pm/v1/accounts/${account_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch: { name: 'Acme Corp' } }),
        });
        expect(patched.status).toBe(200);

        const r1 = crypto.randomUUID();
        const recruiters = await app.request(`/api/pm/v1/accounts/${account_id}/recruiters`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recruiter_worker_ids: [r1] }),
        });
        expect(recruiters.status).toBe(200);
        expect(await recruiters.json()).toMatchObject({ added: 1, removed: 0 });

        const detail = await app.request(`/api/pm/v1/accounts/${account_id}`);
        const body = (await detail.json()) as { recruiter_worker_ids: string[] };
        expect(body.recruiter_worker_ids).toEqual([r1]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
