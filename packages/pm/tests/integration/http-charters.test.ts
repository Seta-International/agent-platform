import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { buildPmRoutes } from '../../src/backend/http/index.ts';
import { pmErrorMapper } from '../../src/register.ts';
import { buildSession, seedTenant } from '../helpers.ts';

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

function appFor(session: unknown) {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session as never);
    await next();
  });
  app.route('/', buildPmRoutes({} as never));
  app.onError(makeErrorHandler(pmErrorMapper));
  return app;
}

describe('pm charters + projects HTTP', () => {
  it('submit → approve → list project + error-mapper paths', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);

        // Create account first (required for charter)
        const acctRes = await app.request('/api/pm/v1/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'HTTP Test Client', industry: 'Tech' }),
        });
        expect(acctRes.status).toBe(201);
        const { account_id } = (await acctRes.json()) as { account_id: string };

        // POST /charters → 201
        const submitRes = await app.request('/api/pm/v1/charters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id,
            name: 'HTTP Proj',
            pm_worker_id: t.admin_user_id,
            methodology: 'scrum',
            pricing_model: 'time_materials',
            budget_bmm: 12,
          }),
        });
        expect(submitRes.status).toBe(201);
        const { charter_id } = (await submitRes.json()) as { charter_id: string };

        // GET /charters → lists submitted charter
        const listRes = await app.request('/api/pm/v1/charters');
        expect(listRes.status).toBe(200);
        const listBody = (await listRes.json()) as { charters: Array<{ charter_id: string }> };
        expect(listBody.charters.some((c) => c.charter_id === charter_id)).toBe(true);

        // GET /charters/:id
        const detailRes = await app.request(`/api/pm/v1/charters/${charter_id}`);
        expect(detailRes.status).toBe(200);
        const detail = (await detailRes.json()) as { charter_id: string; name: string };
        expect(detail.charter_id).toBe(charter_id);
        expect(detail.name).toBe('HTTP Proj');

        // PATCH /charters/:id
        const patchRes = await app.request(`/api/pm/v1/charters/${charter_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch: { name: 'HTTP Proj Updated' } }),
        });
        expect(patchRes.status).toBe(200);

        // POST /:id/approve → 200, returns project_id
        const approveRes = await app.request(`/api/pm/v1/charters/${charter_id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(approveRes.status).toBe(200);
        const approveBody = (await approveRes.json()) as { project_id: string };
        expect(typeof approveBody.project_id).toBe('string');
        const { project_id } = approveBody;

        // GET /projects → lists the project
        const projListRes = await app.request('/api/pm/v1/projects');
        expect(projListRes.status).toBe(200);
        const projList = (await projListRes.json()) as { projects: Array<{ project_id: string }> };
        expect(projList.projects.some((p) => p.project_id === project_id)).toBe(true);

        // GET /projects/:id
        const projDetailRes = await app.request(`/api/pm/v1/projects/${project_id}`);
        expect(projDetailRes.status).toBe(200);
        const projDetail = (await projDetailRes.json()) as { project_id: string };
        expect(projDetail.project_id).toBe(project_id);

        // PATCH /projects/:id
        const projPatchRes = await app.request(`/api/pm/v1/projects/${project_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch: { objective: 'Do great things' } }),
        });
        expect(projPatchRes.status).toBe(200);

        // GET /projects/:id/access
        const accessListRes = await app.request(`/api/pm/v1/projects/${project_id}/access`);
        expect(accessListRes.status).toBe(200);
        const accessBody = (await accessListRes.json()) as { access: unknown[] };
        expect(Array.isArray(accessBody.access)).toBe(true);

        // PUT /projects/:id/access
        const setAccessRes = await app.request(`/api/pm/v1/projects/${project_id}/access`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grants: [{ worker_id: t.admin_user_id, level: 'owner' }],
          }),
        });
        expect(setAccessRes.status).toBe(200);

        // GET /projects/:id/staffing-plan
        const planListRes = await app.request(`/api/pm/v1/projects/${project_id}/staffing-plan`);
        expect(planListRes.status).toBe(200);
        const planBody = (await planListRes.json()) as { lines: unknown[] };
        expect(Array.isArray(planBody.lines)).toBe(true);

        // POST /projects/:id/staffing-plan
        const upsertLineRes = await app.request(`/api/pm/v1/projects/${project_id}/staffing-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'Backend Dev', effort_mm: 3 }),
        });
        expect(upsertLineRes.status).toBe(200);
        const lineBody = (await upsertLineRes.json()) as { line_id: string };
        expect(typeof lineBody.line_id).toBe('string');
        const { line_id } = lineBody;

        // DELETE /projects/:id/staffing-plan/:lineId
        const deleteLineRes = await app.request(
          `/api/pm/v1/projects/${project_id}/staffing-plan/${line_id}`,
          { method: 'DELETE' },
        );
        expect(deleteLineRes.status).toBe(200);

        // POST /projects/:id/close → 200
        const closeRes = await app.request(`/api/pm/v1/projects/${project_id}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(closeRes.status).toBe(200);

        // POST /projects/:id/reopen → 200
        const reopenRes = await app.request(`/api/pm/v1/projects/${project_id}/reopen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(reopenRes.status).toBe(200);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('error-mapper: stale version → 409, viewer approve → 403, unknown id → 404, bad body → 400', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);

        // Create account + charter
        const acctRes = await app.request('/api/pm/v1/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Error Client' }),
        });
        const { account_id } = (await acctRes.json()) as { account_id: string };

        const submitRes = await app.request('/api/pm/v1/charters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id,
            name: 'Error Proj',
            pm_worker_id: t.admin_user_id,
          }),
        });
        const { charter_id } = (await submitRes.json()) as { charter_id: string };

        // 409 — stale version on approve
        const staleRes = await app.request(`/api/pm/v1/charters/${charter_id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expected_version: 99 }),
        });
        expect(staleRes.status).toBe(409);

        // 403 — viewer trying to approve
        const viewerSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['pm.viewer'],
        });
        const viewerApp = appFor(viewerSession);
        const forbidRes = await viewerApp.request(`/api/pm/v1/charters/${charter_id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(forbidRes.status).toBe(403);

        // 404 — unknown charter id
        const notFoundRes = await app.request(
          `/api/pm/v1/charters/${crypto.randomUUID()}/approve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );
        expect(notFoundRes.status).toBe(404);

        // 400 — bad POST body (empty object missing required fields)
        const badBodyRes = await app.request('/api/pm/v1/charters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(badBodyRes.status).toBe(400);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('withdraw and reject flows', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);

        const acctRes = await app.request('/api/pm/v1/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Flow Client' }),
        });
        const { account_id } = (await acctRes.json()) as { account_id: string };

        // Charter for withdraw
        const s1 = await app.request('/api/pm/v1/charters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id,
            name: 'Withdraw Proj',
            pm_worker_id: t.admin_user_id,
          }),
        });
        const { charter_id: cw } = (await s1.json()) as { charter_id: string };

        const withdrawRes = await app.request(`/api/pm/v1/charters/${cw}/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(withdrawRes.status).toBe(200);

        // Charter for reject
        const s2 = await app.request('/api/pm/v1/charters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id, name: 'Reject Proj', pm_worker_id: t.admin_user_id }),
        });
        const { charter_id: cr } = (await s2.json()) as { charter_id: string };

        const rejectRes = await app.request(`/api/pm/v1/charters/${cr}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Budget not approved' }),
        });
        expect(rejectRes.status).toBe(200);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
