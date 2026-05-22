import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import type { WorkerHandle } from '@seta/core/workers';
import { createUser } from '@seta/identity';
import { createGroup, createPlan } from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { handleServerError } from '../src/build.ts';
import { registerPlannerPlansRoutes } from '../src/routes/planner-plans.ts';

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

function buildTestApp(session: SessionScope, workers?: WorkerHandle): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session);
    await next();
  });
  registerPlannerPlansRoutes(app, workers ? { workers } : undefined);
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

function makeWorkers() {
  const addJob = vi.fn().mockResolvedValue(undefined);
  const workers = { addJob } as unknown as WorkerHandle;
  return { addJob, workers };
}

describe('POST /api/planner/v1/plans/:id/refresh-sync', () => {
  it('returns { ok: true } and calls addJob m365.plan.pull for a linked plan', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'refresh-ok');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });

        // Link the plan to M365 directly in the DB so refreshPlanSync sees external_source = 'm365'
        await pool.query(
          `UPDATE planner.plans SET external_source = 'm365', external_id = 'ext-plan-1' WHERE id = $1`,
          [plan.id],
        );

        const { addJob, workers } = makeWorkers();
        const app = buildTestApp(session, workers);

        const res = await app.request(`/api/planner/v1/plans/${plan.id}/refresh-sync`, {
          method: 'POST',
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean };
        expect(body.ok).toBe(true);

        expect(addJob).toHaveBeenCalledWith('m365.plan.pull', {
          tenant_id: tenantId,
          plan_id: plan.id,
          full: false,
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns 409 PLAN_NOT_LINKED for an unlinked plan', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'refresh-notlinked');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Native Plan', session });

        const { workers } = makeWorkers();
        const app = buildTestApp(session, workers);

        const res = await app.request(`/api/planner/v1/plans/${plan.id}/refresh-sync`, {
          method: 'POST',
        });

        expect(res.status).toBe(409);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('PLAN_NOT_LINKED');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not register the route when workers are absent', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'refresh-noworkers');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });

        // No workers passed
        const app = buildTestApp(session);

        const res = await app.request(`/api/planner/v1/plans/${plan.id}/refresh-sync`, {
          method: 'POST',
        });

        expect(res.status).toBe(404);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('POST /api/planner/v1/plans/:id/resolve-conflicts', () => {
  it('returns { applied } and calls addJob m365.plan.push for a linked plan', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'resolve-ok');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 2', session });

        await pool.query(
          `UPDATE planner.plans SET external_source = 'm365', external_id = 'ext-plan-2' WHERE id = $1`,
          [plan.id],
        );

        const { addJob, workers } = makeWorkers();
        const app = buildTestApp(session, workers);

        const decisions = [
          { kind: 'plan' as const, field: 'name', choice: 'local' as const },
          { kind: 'plan' as const, field: 'description', choice: 'remote' as const },
        ];

        const res = await app.request(`/api/planner/v1/plans/${plan.id}/resolve-conflicts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decisions }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as { applied: number };
        expect(body.applied).toBe(2);

        // only 'local' decisions are forwarded to plan.push
        expect(addJob).toHaveBeenCalledWith('m365.plan.push', {
          tenant_id: tenantId,
          plan_id: plan.id,
          decisions: [{ kind: 'plan', field: 'name', choice: 'local' }],
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns 400 VALIDATION on missing decisions array', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'resolve-badval');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Plan', session });

        const { workers } = makeWorkers();
        const app = buildTestApp(session, workers);

        const res = await app.request(`/api/planner/v1/plans/${plan.id}/resolve-conflicts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decisions: 'not-an-array' }),
        });

        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('VALIDATION');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns 400 VALIDATION on invalid decision item shape', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'resolve-baditem');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Plan', session });

        const { workers } = makeWorkers();
        const app = buildTestApp(session, workers);

        const res = await app.request(`/api/planner/v1/plans/${plan.id}/resolve-conflicts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // missing 'choice' field
          body: JSON.stringify({ decisions: [{ kind: 'plan', field: 'name' }] }),
        });

        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('VALIDATION');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns 409 PLAN_NOT_LINKED for an unlinked plan', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'resolve-notlinked');
        const session = buildSession({
          tenant_id: tenantId,
          user_id: adminUserId,
          email: adminEmail,
          display_name: 'Admin',
        });

        const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Native', session });

        const { workers } = makeWorkers();
        const app = buildTestApp(session, workers);

        const res = await app.request(`/api/planner/v1/plans/${plan.id}/resolve-conflicts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            decisions: [{ kind: 'plan', field: 'name', choice: 'local' }],
          }),
        });

        expect(res.status).toBe(409);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe('PLAN_NOT_LINKED');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
