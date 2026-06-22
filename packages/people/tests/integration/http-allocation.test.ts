import type { SessionEnv, SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { worker, workerAllocationProjection } from '../../src/backend/db/schema.ts';
import { registerPeopleAllocationRoutes } from '../../src/backend/http/allocations.ts';
import { peopleErrorMapper } from '../../src/register.ts';
import { seedTenant } from '../helpers.ts';

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
  registerPeopleAllocationRoutes(app);
  app.onError((err, c) => {
    const mapped = peopleErrorMapper(err);
    if (mapped) return c.json(mapped.body, mapped.status as Parameters<typeof c.json>[1]);
    throw err;
  });
  return app;
}

describe('People allocation HTTP routes', () => {
  it('GET /allocation/grid returns the scoped monthly grid', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();
        await peopleDb().insert(worker).values({
          tenant_id: t.tenant_id,
          person_id: personId,
          full_name: 'Grid Person',
        });
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          worker_id: personId,
          project_id: crypto.randomUUID(),
          account_id: crypto.randomUUID(),
          account_name: 'Acme',
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          planned_pct: '100',
          bucket: 'billable',
          active: true,
        });

        const app = buildApp(t.adminSession);
        const res = await app.request('/api/people/v1/allocation/grid?year=2026');
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          year: number;
          rows: Array<{ worker_id: string; months: (number | null)[] }>;
          kpis: { member_count: number };
        };
        expect(body.year).toBe(2026);
        expect(body.kpis.member_count).toBe(1);
        expect(body.rows[0]!.months[0]).toBe(100);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('GET /allocation/utilization returns the scoped per-person utilization', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();
        await peopleDb().insert(worker).values({
          tenant_id: t.tenant_id,
          person_id: personId,
          full_name: 'Util Person',
        });
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          worker_id: personId,
          project_id: crypto.randomUUID(),
          account_id: crypto.randomUUID(),
          account_name: 'Acme',
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          planned_pct: '60',
          bucket: 'billable',
          active: true,
        });

        const app = buildApp(t.adminSession);
        const res = await app.request('/api/people/v1/allocation/utilization?asOf=2026-06-15');
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          rows: Array<{ worker_id: string; total_pct: number }>;
        };
        expect(body.rows.find((r) => r.worker_id === personId)?.total_pct).toBe(60);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
