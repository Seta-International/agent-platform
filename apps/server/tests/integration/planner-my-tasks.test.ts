import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { assignTask, createGroup, createPlan, createTask, updateTask } from '@seta/planner';
import { registerPlannerTasksRoutes } from '@seta/planner/http';
import { plannerErrorMapper } from '@seta/planner/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { makeErrorHandler } from '../../src/build.ts';

function buildSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
  display_name: string;
  roles?: string[];
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
    accessible_group_ids: [],
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
  registerPlannerTasksRoutes(app);
  app.onError(makeErrorHandler(plannerErrorMapper));
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

interface MyTasksBody {
  late: Array<{ id: string; priority_number: number | null }>;
  dueThisWeek: Array<{ id: string }>;
  inProgress: Array<{ id: string }>;
  notStarted: Array<{ id: string; priority_number: number | null }>;
  recentlyCompleted: Array<{ id: string }>;
}

const dbCfg = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('GET /api/planner/v1/my-tasks', () => {
  it('returns the full 5-section payload as arrays on an empty tenant', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'empty');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });
        const app = buildTestApp(session);
        const res = await app.request('/api/planner/v1/my-tasks');
        expect(res.status).toBe(200);
        const body = (await res.json()) as MyTasksBody;
        expect(Array.isArray(body.late)).toBe(true);
        expect(Array.isArray(body.dueThisWeek)).toBe(true);
        expect(Array.isArray(body.inProgress)).toBe(true);
        expect(Array.isArray(body.notStarted)).toBe(true);
        expect(Array.isArray(body.recentlyCompleted)).toBe(true);
        expect(body.late).toHaveLength(0);
        expect(body.dueThisWeek).toHaveLength(0);
        expect(body.inProgress).toHaveLength(0);
        expect(body.notStarted).toHaveLength(0);
        expect(body.recentlyCompleted).toHaveLength(0);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('maps numeric priority query (1=urgent) to the enum domain filter', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'priomap');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });
        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });

        const urgent = await createTask({ plan_id: plan.id, title: 'Urgent', session });
        await updateTask({
          task_id: urgent.id,
          expected_version: urgent.version,
          patch: { priority_number: 1 },
          session,
        });
        await assignTask({ task_id: urgent.id, user_id: session.user_id, session });

        const low = await createTask({ plan_id: plan.id, title: 'Low', session });
        await updateTask({
          task_id: low.id,
          expected_version: low.version,
          patch: { priority_number: 9 },
          session,
        });
        await assignTask({ task_id: low.id, user_id: session.user_id, session });

        const app = buildTestApp(session);
        const res = await app.request('/api/planner/v1/my-tasks?priority=1');
        expect(res.status).toBe(200);
        const body = (await res.json()) as MyTasksBody;
        expect(body.notStarted.map((t) => t.id)).toEqual([urgent.id]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('translates camelCase planId query into snake_case domain filter', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'planfilt');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });
        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
        const planA = await createPlan({ group_id: group.id, name: 'A', session });
        const planB = await createPlan({ group_id: group.id, name: 'B', session });

        const a = await createTask({ plan_id: planA.id, title: 'A1', session });
        await assignTask({ task_id: a.id, user_id: session.user_id, session });
        const b = await createTask({ plan_id: planB.id, title: 'B1', session });
        await assignTask({ task_id: b.id, user_id: session.user_id, session });

        const app = buildTestApp(session);
        const res = await app.request(`/api/planner/v1/my-tasks?planId=${planA.id}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as MyTasksBody;
        expect(body.notStarted.map((t) => t.id)).toEqual([a.id]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('ignores unknown priority and due values without erroring', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'badparams');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });
        const app = buildTestApp(session);
        const res = await app.request('/api/planner/v1/my-tasks?priority=42&due=bogus&sort=nope');
        expect(res.status).toBe(200);
        const body = (await res.json()) as MyTasksBody;
        expect(body.notStarted).toHaveLength(0);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
