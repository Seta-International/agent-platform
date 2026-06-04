import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerPlannerTasksRoutes } from '../../src/backend/http/index.ts';
import { createGroup, createPlan, createTask } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const JUNE_FROM = '2026-06-01T00:00:00.000Z';
const JUNE_TO = '2026-06-30T23:59:59.999Z';

function testDbOpts() {
  return {
    templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
    baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
  };
}

describe('GET /api/planner/v1/plans/:planId/tasks/calendar', () => {
  it('returns tasks + total_count; validates query params', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;

        const app = new Hono<SessionEnv>();
        app.use(async (c, next) => {
          c.set('user', session);
          await next();
        });
        registerPlannerTasksRoutes(app);

        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
        await createTask({
          plan_id: plan.id,
          title: 'In June',
          due_at: '2026-06-10T12:00:00.000Z',
          session,
        });
        await createTask({
          plan_id: plan.id,
          title: 'In May',
          due_at: '2026-05-10T12:00:00.000Z',
          session,
        });

        const base = `/api/planner/v1/plans/${plan.id}/tasks/calendar`;
        const qs = (from: string, to: string) =>
          `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

        const ok = await app.request(`${base}${qs(JUNE_FROM, JUNE_TO)}`);
        expect(ok.status).toBe(200);
        const body = (await ok.json()) as {
          tasks: { title: string }[];
          total_count: number;
          next_cursor?: string;
        };
        expect(body.total_count).toBe(1);
        expect(body.tasks.map((t) => t.title)).toEqual(['In June']);
        expect(body.next_cursor).toBeUndefined();

        // Missing params → 400
        const missing = await app.request(base);
        expect(missing.status).toBe(400);

        // Non-ISO params → 400
        const bad = await app.request(`${base}?from=2026-06-01&to=2026-06-30`);
        expect(bad.status).toBe(400);

        // Inverted range → 400
        const inverted = await app.request(`${base}${qs(JUNE_TO, JUNE_FROM)}`);
        expect(inverted.status).toBe(400);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
