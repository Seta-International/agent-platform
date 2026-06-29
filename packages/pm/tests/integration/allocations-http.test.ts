import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { buildPmRoutes } from '../../src/backend/http/index.ts';
import { pmErrorMapper } from '../../src/register.ts';
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
  app.onError((err: Error, c) => {
    const mapped = pmErrorMapper(err);
    if (mapped) return c.json(mapped.body as never, mapped.status as never);
    throw err;
  });
  return app;
}

describe('pm allocations HTTP', () => {
  it('POST allocation then GET project allocations returns the row', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool); // pm.strategic has pm.project.manage
        const app = appFor(t.adminSession);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const proj = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_worker_id, phase, status)
           VALUES ($1,$2,'P',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const projectId = proj.rows[0].id as string;
        const worker = crypto.randomUUID();

        const post = await app.request('/api/pm/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            worker_id: worker,
            role: 'Developer',
            planned_pct: 80,
            status: 'committed',
            date_from: '2026-07-01',
            date_to: '2026-12-31',
          }),
        });
        expect(post.status).toBe(201);

        const get = await app.request(`/api/pm/v1/projects/${projectId}/allocations`);
        expect(get.status).toBe(200);
        const body = (await get.json()) as {
          allocations: Array<{
            allocation_id: string;
            worker_id: string;
            planned_pct: number;
            role: string;
          }>;
        };
        expect(body.allocations).toHaveLength(1);
        expect(body.allocations[0]!.worker_id).toBe(worker);
        expect(body.allocations[0]!.planned_pct).toBe(80);
        expect(body.allocations[0]!.role).toBe('Developer');

        // PATCH the row inline (role + RA%), then DELETE it.
        const allocationId = body.allocations[0]!.allocation_id;
        const patch = await app.request(`/api/pm/v1/allocations/${allocationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'Tech Lead', planned_pct: 50 }),
        });
        expect(patch.status).toBe(200);
        const afterPatch = (await (
          await app.request(`/api/pm/v1/projects/${projectId}/allocations`)
        ).json()) as { allocations: Array<{ role: string; planned_pct: number }> };
        expect(afterPatch.allocations[0]!.role).toBe('Tech Lead');
        expect(afterPatch.allocations[0]!.planned_pct).toBe(50);

        const del = await app.request(`/api/pm/v1/allocations/${allocationId}`, {
          method: 'DELETE',
        });
        expect(del.status).toBe(204);
        const afterDelete = (await (
          await app.request(`/api/pm/v1/projects/${projectId}/allocations`)
        ).json()) as { allocations: unknown[] };
        expect(afterDelete.allocations).toHaveLength(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
