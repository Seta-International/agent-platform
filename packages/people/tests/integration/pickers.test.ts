import type { SessionEnv, SessionScope } from '@seta/core';
import { createSkill, createSkillCategory } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { accountProjection, projectProjection } from '../../src/backend/db/schema.ts';
import { registerPeoplePickersRoutes } from '../../src/backend/http/pickers.ts';
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
  registerPeoplePickersRoutes(app);
  return app;
}

function withDb(
  fn: (ctx: {
    tenant_id: string;
    admin_user_id: string;
    adminSession: SessionScope;
  }) => Promise<void>,
): Promise<void> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      await fn({ ...t });
    } finally {
      resetPeopleDb();
      resetCoreDb();
      await closePools();
    }
  });
}

describe('People picker routes', () => {
  describe('GET /api/people/v1/skills', () => {
    it('search filters results (only matching skill returned)', async () => {
      await withDb(async ({ tenant_id, admin_user_id }) => {
        // Use org.admin (wildcard) to seed skills via public surface
        const skillAdmin = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['org.admin'],
        });
        const { id: catId } = await createSkillCategory({
          input: { name: 'Frontend' },
          session: skillAdmin,
        });
        const { id: reactId } = await createSkill({
          input: { category_id: catId, name: 'React' },
          session: skillAdmin,
        });
        await createSkill({ input: { category_id: catId, name: 'Vue' }, session: skillAdmin });

        const strategicSession = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['people.strategic'],
        });
        const app = buildApp(strategicSession);

        const res = await app.request('/api/people/v1/skills?search=rea');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { rows: Array<{ id: string; name: string }> };
        expect(body.rows).toHaveLength(1);
        expect(body.rows[0]!.id).toBe(reactId);
        expect(body.rows[0]!.name).toBe('React');
      });
    });

    it('?ids= resolves specific skills by id', async () => {
      await withDb(async ({ tenant_id, admin_user_id }) => {
        const skillAdmin = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['org.admin'],
        });
        const { id: catId } = await createSkillCategory({
          input: { name: 'Backend' },
          session: skillAdmin,
        });
        const { id: nodeId } = await createSkill({
          input: { category_id: catId, name: 'Node.js' },
          session: skillAdmin,
        });
        await createSkill({ input: { category_id: catId, name: 'Python' }, session: skillAdmin });

        const strategicSession = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['people.strategic'],
        });
        const app = buildApp(strategicSession);

        const res = await app.request(`/api/people/v1/skills?ids=${nodeId}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { rows: Array<{ id: string; name: string }> };
        expect(body.rows).toHaveLength(1);
        expect(body.rows[0]!.id).toBe(nodeId);
      });
    });

    it('people.viewer session can call skills route (core.skill.read grant)', async () => {
      await withDb(async ({ tenant_id, admin_user_id }) => {
        const skillAdmin = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['org.admin'],
        });
        const { id: catId } = await createSkillCategory({
          input: { name: 'DevOps' },
          session: skillAdmin,
        });
        await createSkill({ input: { category_id: catId, name: 'Docker' }, session: skillAdmin });

        const viewerSession = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['people.viewer'],
        });
        const app = buildApp(viewerSession);

        const res = await app.request('/api/people/v1/skills?search=dock');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { rows: Array<{ id: string; name: string }> };
        expect(body.rows.map((r) => r.name)).toContain('Docker');
      });
    });
  });

  describe('GET /api/people/v1/accounts', () => {
    it('search filters account rows', async () => {
      await withDb(async ({ tenant_id, admin_user_id }) => {
        const acmeId = crypto.randomUUID();
        const betaId = crypto.randomUUID();
        await peopleDb()
          .insert(accountProjection)
          .values([
            { account_id: acmeId, tenant_id, name: 'Acme Corp' },
            { account_id: betaId, tenant_id, name: 'Beta Ltd' },
          ]);

        const session = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['people.strategic'],
        });
        const app = buildApp(session);

        const res = await app.request('/api/people/v1/accounts?search=acm');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { rows: Array<{ id: string; name: string }> };
        expect(body.rows).toHaveLength(1);
        expect(body.rows[0]!.id).toBe(acmeId);
        expect(body.rows[0]!.name).toBe('Acme Corp');
      });
    });

    it('?ids= resolves specific accounts', async () => {
      await withDb(async ({ tenant_id, admin_user_id }) => {
        const idA = crypto.randomUUID();
        const idB = crypto.randomUUID();
        await peopleDb()
          .insert(accountProjection)
          .values([
            { account_id: idA, tenant_id, name: 'Alpha Inc' },
            { account_id: idB, tenant_id, name: 'Bravo LLC' },
          ]);

        const session = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['people.strategic'],
        });
        const app = buildApp(session);

        const res = await app.request(`/api/people/v1/accounts?ids=${idA}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { rows: Array<{ id: string; name: string }> };
        expect(body.rows).toHaveLength(1);
        expect(body.rows[0]!.id).toBe(idA);
      });
    });

    it('is tenant-scoped — other tenant rows not returned', async () => {
      await withDb(async ({ tenant_id, admin_user_id }) => {
        const myAcctId = crypto.randomUUID();
        const otherAcctId = crypto.randomUUID();
        const otherTenantId = crypto.randomUUID();
        await peopleDb()
          .insert(accountProjection)
          .values([
            { account_id: myAcctId, tenant_id, name: 'My Account' },
            { account_id: otherAcctId, tenant_id: otherTenantId, name: 'Other Account' },
          ]);

        const session = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['people.strategic'],
        });
        const app = buildApp(session);

        const res = await app.request('/api/people/v1/accounts');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { rows: Array<{ id: string }> };
        const ids = body.rows.map((r) => r.id);
        expect(ids).toContain(myAcctId);
        expect(ids).not.toContain(otherAcctId);
      });
    });
  });

  describe('GET /api/people/v1/projects', () => {
    it("?account_id= cascade returns only that account's projects", async () => {
      await withDb(async ({ tenant_id, admin_user_id }) => {
        const acctA = crypto.randomUUID();
        const acctB = crypto.randomUUID();
        const proj1 = crypto.randomUUID();
        const proj2 = crypto.randomUUID();
        await peopleDb()
          .insert(projectProjection)
          .values([
            { project_id: proj1, tenant_id, account_id: acctA, name: 'Alpha Project' },
            { project_id: proj2, tenant_id, account_id: acctB, name: 'Beta Project' },
          ]);

        const session = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['people.strategic'],
        });
        const app = buildApp(session);

        const res = await app.request(`/api/people/v1/projects?account_id=${acctA}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { rows: Array<{ id: string; name: string }> };
        expect(body.rows).toHaveLength(1);
        expect(body.rows[0]!.id).toBe(proj1);
      });
    });

    it('search filters by name', async () => {
      await withDb(async ({ tenant_id, admin_user_id }) => {
        const acctId = crypto.randomUUID();
        const proj1 = crypto.randomUUID();
        const proj2 = crypto.randomUUID();
        await peopleDb()
          .insert(projectProjection)
          .values([
            { project_id: proj1, tenant_id, account_id: acctId, name: 'Alpha Search' },
            { project_id: proj2, tenant_id, account_id: acctId, name: 'Beta Search' },
          ]);

        const session = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['people.strategic'],
        });
        const app = buildApp(session);

        const res = await app.request('/api/people/v1/projects?search=alpha');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { rows: Array<{ id: string }> };
        expect(body.rows).toHaveLength(1);
        expect(body.rows[0]!.id).toBe(proj1);
      });
    });

    it('?ids= resolves specific projects', async () => {
      await withDb(async ({ tenant_id, admin_user_id }) => {
        const acctId = crypto.randomUUID();
        const proj1 = crypto.randomUUID();
        const proj2 = crypto.randomUUID();
        await peopleDb()
          .insert(projectProjection)
          .values([
            { project_id: proj1, tenant_id, account_id: acctId, name: 'Gamma Project' },
            { project_id: proj2, tenant_id, account_id: acctId, name: 'Delta Project' },
          ]);

        const session = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['people.strategic'],
        });
        const app = buildApp(session);

        const res = await app.request(`/api/people/v1/projects?ids=${proj2}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { rows: Array<{ id: string }> };
        expect(body.rows).toHaveLength(1);
        expect(body.rows[0]!.id).toBe(proj2);
      });
    });

    it('?account_id= with comma-separated multiple accounts', async () => {
      await withDb(async ({ tenant_id, admin_user_id }) => {
        const acctA = crypto.randomUUID();
        const acctB = crypto.randomUUID();
        const acctC = crypto.randomUUID();
        const proj1 = crypto.randomUUID();
        const proj2 = crypto.randomUUID();
        const proj3 = crypto.randomUUID();
        await peopleDb()
          .insert(projectProjection)
          .values([
            { project_id: proj1, tenant_id, account_id: acctA, name: 'A Project' },
            { project_id: proj2, tenant_id, account_id: acctB, name: 'B Project' },
            { project_id: proj3, tenant_id, account_id: acctC, name: 'C Project' },
          ]);

        const session = buildSession({
          tenant_id,
          user_id: admin_user_id,
          roles: ['people.strategic'],
        });
        const app = buildApp(session);

        const res = await app.request(`/api/people/v1/projects?account_id=${acctA},${acctB}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { rows: Array<{ id: string }> };
        const ids = body.rows.map((r) => r.id);
        expect(ids).toContain(proj1);
        expect(ids).toContain(proj2);
        expect(ids).not.toContain(proj3);
      });
    });
  });
});
