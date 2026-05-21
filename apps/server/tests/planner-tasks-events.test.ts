import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { createUser } from '@seta/identity';
import { createBucket, createGroup, createPlan, createTask } from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { handleServerError } from '../src/build.ts';
import { registerPlannerTasksRoutes } from '../src/routes/planner-tasks.ts';

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
  registerPlannerTasksRoutes(app);
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

describe('GET /api/planner/v1/tasks/:id/events', () => {
  it('returns the activity feed reverse-chron', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'happy');
          const session = buildSession({
            tenant_id: tenantId,
            user_id: adminUserId,
            email: adminEmail,
            display_name: 'Admin',
          });

          const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });
          const bucket = await createBucket({ plan_id: plan.id, name: 'B', session });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T',
            session,
          });

          const app = buildTestApp(session);
          const res = await app.request(`/api/planner/v1/tasks/${task.id}/events?limit=10`);

          expect(res.status).toBe(200);
          const body = (await res.json()) as {
            events: Array<{
              event_type: string;
              event_version: number;
              aggregate_type: string;
              aggregate_id: string;
              tenant_id: string;
              occurred_at: string;
            }>;
          };
          expect(Array.isArray(body.events)).toBe(true);
          expect(body.events.length).toBeGreaterThan(0);
          const first = body.events[0];
          expect(first).toMatchObject({
            event_type: expect.any(String),
            event_version: 1,
            aggregate_type: expect.any(String),
            aggregate_id: expect.any(String),
            tenant_id: expect.any(String),
            occurred_at: expect.any(String),
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it("403 when caller lacks access to the task's group", async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'outsider');
          const adminSession = buildSession({
            tenant_id: tenantId,
            user_id: adminUserId,
            email: adminEmail,
            display_name: 'Admin',
          });
          const group = await createGroup({
            tenant_id: tenantId,
            name: 'Eng',
            session: adminSession,
          });
          const plan = await createPlan({ group_id: group.id, name: 'P', session: adminSession });
          const bucket = await createBucket({ plan_id: plan.id, name: 'B', session: adminSession });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T',
            session: adminSession,
          });

          const outsider = buildSession({
            tenant_id: tenantId,
            user_id: crypto.randomUUID(),
            email: 'outsider@example.test',
            display_name: 'Outsider',
            roles: [],
          });

          const app = buildTestApp(outsider);
          const res = await app.request(`/api/planner/v1/tasks/${task.id}/events`);
          expect(res.status).toBe(403);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
