import type { SessionEnv, SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { buildPmRoutes } from '../../src/backend/http/index.ts';
import { pmErrorMapper } from '../../src/register.ts';
import { buildSession, type SeededTenant, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function makeErrorHandler(
  ...mappers: Array<(err: Error) => { status: number; body: unknown } | null>
) {
  return (err: Error, c: import('hono').Context) => {
    for (const mapper of mappers) {
      const mapped = mapper(err);
      if (mapped) return c.json(mapped.body as never, mapped.status as never);
    }
    throw err;
  };
}

function appFor(session: SessionScope) {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session as never);
    // createSessionMiddleware (packages/core/src/middleware/session.ts) opens scoped(tenantId, ...)
    // around the downstream handler in production; this stub session middleware must do the same.
    await scoped(session.tenant_id, next);
  });
  app.route('/', buildPmRoutes({} as never));
  app.onError(makeErrorHandler(pmErrorMapper));
  return app;
}

function reviewerApps(t: SeededTenant) {
  const pmoApp = appFor(
    buildSession({ tenant_id: t.tenant_id, user_id: crypto.randomUUID(), roles: ['pm.pmo'] }),
  );
  const bodApp = appFor(
    buildSession({ tenant_id: t.tenant_id, user_id: crypto.randomUUID(), roles: ['pm.bod'] }),
  );
  return { pmoApp, bodApp };
}

const POST_JSON = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('pm charters + projects HTTP', () => {
  it('submit → pmo-signoff → bod-approve → list project + error-mapper paths', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);
        const { pmoApp, bodApp } = reviewerApps(t);

        const acctRes = await app.request(
          '/api/pm/v1/accounts',
          POST_JSON({ name: 'HTTP Test Client', industry: 'Tech' }),
        );
        expect(acctRes.status).toBe(201);
        const { account_id } = (await acctRes.json()) as { account_id: string };

        const submitRes = await app.request(
          '/api/pm/v1/charters',
          POST_JSON({
            account_id,
            name: 'HTTP Proj',
            pm_worker_id: t.admin_user_id,
            methodology: 'scrum',
            pricing_model: 'time_materials',
            budget_bmm: 12,
          }),
        );
        expect(submitRes.status).toBe(201);
        const { charter_id } = (await submitRes.json()) as { charter_id: string };

        const listRes = await app.request('/api/pm/v1/charters');
        expect(listRes.status).toBe(200);
        const listBody = (await listRes.json()) as { charters: Array<{ charter_id: string }> };
        expect(listBody.charters.some((c) => c.charter_id === charter_id)).toBe(true);

        const detailRes = await app.request(`/api/pm/v1/charters/${charter_id}`);
        expect(detailRes.status).toBe(200);

        const patchRes = await app.request(`/api/pm/v1/charters/${charter_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch: { name: 'HTTP Proj Updated' } }),
        });
        expect(patchRes.status).toBe(200);

        // legacy /approve route is gone
        const goneRes = await app.request(
          `/api/pm/v1/charters/${charter_id}/approve`,
          POST_JSON({}),
        );
        expect(goneRes.status).toBe(404);

        // PMO sign-off (200), then BoD approve (200, returns project_id)
        const pmoRes = await pmoApp.request(
          `/api/pm/v1/charters/${charter_id}/pmo-signoff`,
          POST_JSON({}),
        );
        expect(pmoRes.status).toBe(200);
        const approveRes = await bodApp.request(
          `/api/pm/v1/charters/${charter_id}/bod-approve`,
          POST_JSON({}),
        );
        expect(approveRes.status).toBe(200);
        const { project_id } = (await approveRes.json()) as { project_id: string };
        expect(typeof project_id).toBe('string');

        const projListRes = await app.request('/api/pm/v1/projects');
        const projList = (await projListRes.json()) as { projects: Array<{ project_id: string }> };
        expect(projList.projects.some((p) => p.project_id === project_id)).toBe(true);

        const projPatchRes = await app.request(`/api/pm/v1/projects/${project_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch: { objective: 'Do great things' } }),
        });
        expect(projPatchRes.status).toBe(200);

        const setAccessRes = await app.request(`/api/pm/v1/projects/${project_id}/access`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grants: [{ worker_id: t.admin_user_id, level: 'owner' }] }),
        });
        expect(setAccessRes.status).toBe(200);

        const closeRes = await app.request(
          `/api/pm/v1/projects/${project_id}/close`,
          POST_JSON({}),
        );
        expect(closeRes.status).toBe(200);
        const reopenRes = await app.request(
          `/api/pm/v1/projects/${project_id}/reopen`,
          POST_JSON({}),
        );
        expect(reopenRes.status).toBe(200);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('error-mapper: stale version → 409, viewer sign-off → 403, unknown id → 404, bad body → 400', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);
        const { pmoApp } = reviewerApps(t);

        const acctRes = await app.request(
          '/api/pm/v1/accounts',
          POST_JSON({ name: 'Error Client' }),
        );
        const { account_id } = (await acctRes.json()) as { account_id: string };

        const submitRes = await app.request(
          '/api/pm/v1/charters',
          POST_JSON({ account_id, name: 'Error Proj', pm_worker_id: t.admin_user_id }),
        );
        const { charter_id } = (await submitRes.json()) as { charter_id: string };

        // 409 — stale version on pmo-signoff
        const staleRes = await pmoApp.request(
          `/api/pm/v1/charters/${charter_id}/pmo-signoff`,
          POST_JSON({ expected_version: 99 }),
        );
        expect(staleRes.status).toBe(409);

        // 403 — viewer trying to sign off
        const viewerApp = appFor(
          buildSession({ tenant_id: t.tenant_id, user_id: t.admin_user_id, roles: ['pm.viewer'] }),
        );
        const forbidRes = await viewerApp.request(
          `/api/pm/v1/charters/${charter_id}/pmo-signoff`,
          POST_JSON({}),
        );
        expect(forbidRes.status).toBe(403);

        // 404 — unknown charter id
        const notFoundRes = await pmoApp.request(
          `/api/pm/v1/charters/${crypto.randomUUID()}/pmo-signoff`,
          POST_JSON({}),
        );
        expect(notFoundRes.status).toBe(404);

        // 400 — bad submit body
        const badBodyRes = await app.request('/api/pm/v1/charters', POST_JSON({}));
        expect(badBodyRes.status).toBe(400);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('withdraw (submitter) and reject (PMO at submitted stage) flows', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);
        const { pmoApp } = reviewerApps(t);

        const acctRes = await app.request(
          '/api/pm/v1/accounts',
          POST_JSON({ name: 'Flow Client' }),
        );
        const { account_id } = (await acctRes.json()) as { account_id: string };

        const s1 = await app.request(
          '/api/pm/v1/charters',
          POST_JSON({ account_id, name: 'Withdraw Proj', pm_worker_id: t.admin_user_id }),
        );
        const { charter_id: cw } = (await s1.json()) as { charter_id: string };
        const withdrawRes = await app.request(`/api/pm/v1/charters/${cw}/withdraw`, POST_JSON({}));
        expect(withdrawRes.status).toBe(200);

        const s2 = await app.request(
          '/api/pm/v1/charters',
          POST_JSON({ account_id, name: 'Reject Proj', pm_worker_id: t.admin_user_id }),
        );
        const { charter_id: cr } = (await s2.json()) as { charter_id: string };
        const rejectRes = await pmoApp.request(
          `/api/pm/v1/charters/${cr}/reject`,
          POST_JSON({ reason: 'Budget not approved' }),
        );
        expect(rejectRes.status).toBe(200);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('DELETE staffing-plan line with stale expected_version → 409; invalid value → 400', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);
        const { pmoApp, bodApp } = reviewerApps(t);

        const acctRes = await app.request(
          '/api/pm/v1/accounts',
          POST_JSON({ name: 'Guard Client' }),
        );
        const { account_id } = (await acctRes.json()) as { account_id: string };

        const submitRes = await app.request(
          '/api/pm/v1/charters',
          POST_JSON({
            account_id,
            name: 'Guard Proj',
            pm_worker_id: t.admin_user_id,
            methodology: 'scrum',
            pricing_model: 'fixed_price',
            budget_bmm: 10,
          }),
        );
        const { charter_id } = (await submitRes.json()) as { charter_id: string };
        await pmoApp.request(`/api/pm/v1/charters/${charter_id}/pmo-signoff`, POST_JSON({}));
        const approveRes = await bodApp.request(
          `/api/pm/v1/charters/${charter_id}/bod-approve`,
          POST_JSON({}),
        );
        const { project_id } = (await approveRes.json()) as { project_id: string };

        const upsertRes = await app.request(
          `/api/pm/v1/projects/${project_id}/staffing-plan`,
          POST_JSON({ role: 'QA', effort_mm: 1 }),
        );
        const { line_id } = (await upsertRes.json()) as { line_id: string };

        const badVersionRes = await app.request(
          `/api/pm/v1/projects/${project_id}/staffing-plan/${line_id}?expected_version=abc`,
          { method: 'DELETE' },
        );
        expect(badVersionRes.status).toBe(400);

        const staleRes = await app.request(
          `/api/pm/v1/projects/${project_id}/staffing-plan/${line_id}?expected_version=99`,
          { method: 'DELETE' },
        );
        expect(staleRes.status).toBe(409);

        const okRes = await app.request(
          `/api/pm/v1/projects/${project_id}/staffing-plan/${line_id}?expected_version=1`,
          { method: 'DELETE' },
        );
        expect(okRes.status).toBe(200);
        const okBody = (await okRes.json()) as { deleted: boolean };
        expect(okBody.deleted).toBe(true);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
