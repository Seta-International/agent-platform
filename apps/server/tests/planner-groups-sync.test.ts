import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { createUser } from '@seta/identity';
import { addGroupMember, createGroup, createPlan, deletePlan } from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { handleServerError } from '../src/build.ts';
import { registerPlannerGroupsRoutes } from '../src/routes/planner-groups.ts';

function buildSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
  display_name: string;
  roles?: string[];
  accessible_group_ids?: string[];
}): SessionScope {
  const role_summary = { roles: opts.roles ?? ['org.admin'], cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email,
    display_name: opts.display_name,
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: opts.accessible_group_ids ?? [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

function buildTestApp(session: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session);
    await next();
  });
  registerPlannerGroupsRoutes(app);
  app.onError(handleServerError);
  return app;
}

async function seedTenant(pool: Pool, slug: string) {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenantId,
    `Tenant ${slug}`,
    slug,
  ]);
  const adminEmail = `admin-${slug}@example.test`;
  const adminResult = await createUser(
    {
      tenant_id: tenantId,
      email: adminEmail,
      name: 'Admin',
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  await pool.query(
    `INSERT INTO planner.assignee_projection
       (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
       VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', 'UTC')
       ON CONFLICT (user_id) DO NOTHING`,
    [adminResult.user_id, tenantId, 'Admin', adminEmail],
  );
  return { tenantId, adminUserId: adminResult.user_id, adminEmail };
}

const dbEnv = () => ({
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
});

describe('planner groups sync routes', () => {
  it('PATCH /groups/:id/members/:userId/role returns 204 on happy path', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'role-ok');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
        const memberId = crypto.randomUUID();
        await addGroupMember({ group_id: group.id, user_id: memberId, session });

        const app = buildTestApp(session);
        const res = await app.request(
          `/api/planner/v1/groups/${group.id}/members/${memberId}/role`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'owner' }),
          },
        );

        expect(res.status).toBe(204);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('POST /groups/:id/link/m365 returns 200 with external_source m365', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'link-ok');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });

        const app = buildTestApp(session);
        const res = await app.request(`/api/planner/v1/groups/${group.id}/link/m365`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ external_id: 'ext-1' }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as { external_source: string; external_id: string | null };
        expect(body.external_source).toBe('m365');
        expect(body.external_id).toBe('ext-1');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('POST /groups/:id/link/m365 returns 409 LINKED_DUPLICATE when external_id is already taken', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'link-dup');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const groupA = await createGroup({ tenant_id: tenantId, name: 'A', session });
        const groupB = await createGroup({ tenant_id: tenantId, name: 'B', session });

        const app = buildTestApp(session);

        const firstRes = await app.request(`/api/planner/v1/groups/${groupA.id}/link/m365`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ external_id: 'ext-2' }),
        });
        expect(firstRes.status).toBe(200);

        const dupRes = await app.request(`/api/planner/v1/groups/${groupB.id}/link/m365`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ external_id: 'ext-2' }),
        });

        expect(dupRes.status).toBe(409);
        const body = (await dupRes.json()) as { error: string };
        expect(body.error).toBe('LINKED_DUPLICATE');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('POST /groups/:id/unlink returns 200 with external_source native and external_id null', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'unlink-ok');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });

        const app = buildTestApp(session);
        const linkRes = await app.request(`/api/planner/v1/groups/${group.id}/link/m365`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ external_id: 'ext-3' }),
        });
        expect(linkRes.status).toBe(200);

        const unlinkRes = await app.request(`/api/planner/v1/groups/${group.id}/unlink`, {
          method: 'POST',
        });

        expect(unlinkRes.status).toBe(200);
        const body = (await unlinkRes.json()) as {
          external_source: string;
          external_id: string | null;
        };
        expect(body.external_source).toBe('native');
        expect(body.external_id).toBeNull();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('POST /groups/:id/members on a linked group returns 409 LINKED_GROUP_IMMUTABLE_MEMBERS', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'linked-immutable');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });

        const app = buildTestApp(session);
        const linkRes = await app.request(`/api/planner/v1/groups/${group.id}/link/m365`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ external_id: 'ext-4' }),
        });
        expect(linkRes.status).toBe(200);

        const addRes = await app.request(`/api/planner/v1/groups/${group.id}/members`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ user_id: crypto.randomUUID() }),
        });

        expect(addRes.status).toBe(409);
        const body = (await addRes.json()) as { error: string };
        expect(body.error).toBe('LINKED_GROUP_IMMUTABLE_MEMBERS');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('PATCH /groups/:id/members/:userId/role returns 400 on invalid role', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'role-bad');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });

        const app = buildTestApp(session);
        const res = await app.request(
          `/api/planner/v1/groups/${group.id}/members/${crypto.randomUUID()}/role`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'admin' }),
          },
        );

        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('VALIDATION');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('listGroupsWithCounts via HTTP', () => {
  it('GET /groups?withCounts=true returns plan_count and member_count', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'counts-ok');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Counts Group', session });
        await createPlan({ group_id: group.id, name: 'Plan A', session });

        const memberId = crypto.randomUUID();
        await addGroupMember({ group_id: group.id, user_id: memberId, session });

        const app = buildTestApp(session);
        const res = await app.request(`/api/planner/v1/groups?withCounts=true`);

        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          groups: Array<Record<string, unknown>>;
        };
        expect(Array.isArray(body.groups)).toBe(true);
        const g = body.groups.find((r) => r.id === group.id);
        expect(g).toBeDefined();
        expect(g?.plan_count).toBe(1);
        expect(Number(g?.member_count)).toBeGreaterThanOrEqual(1); // at least the explicitly added member
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('GET /groups (without withCounts) does not include plan_count or member_count', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'counts-absent');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        await createGroup({ tenant_id: tenantId, name: 'Plain Group', session });

        const app = buildTestApp(session);
        const res = await app.request(`/api/planner/v1/groups`);

        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          groups: Array<Record<string, unknown>>;
        };
        expect(Array.isArray(body.groups)).toBe(true);
        expect(body.groups.length).toBeGreaterThanOrEqual(1);

        for (const g of body.groups) {
          expect('plan_count' in g).toBe(false);
          expect('member_count' in g).toBe(false);
        }
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('GET /groups?withCounts=true excludes soft-deleted plans from plan_count', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'counts-deleted');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Delta Group', session });
        const plan = await createPlan({ group_id: group.id, name: 'Deleted Plan', session });
        await deletePlan({ plan_id: plan.id, expected_version: plan.version, session });

        const app = buildTestApp(session);
        const res = await app.request(`/api/planner/v1/groups?withCounts=true`);

        expect(res.status).toBe(200);
        const body = (await res.json()) as { groups: Array<Record<string, unknown>> };
        const g = body.groups.find((r) => r.id === group.id);
        expect(g).toBeDefined();
        expect(g?.plan_count).toBe(0); // soft-deleted plan must not count
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
