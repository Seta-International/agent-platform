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

describe('task references HTTP routes', () => {
  it('POST /tasks/:id/references creates a reference; duplicate URL returns 409', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'refadd');
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

          const res = await app.request(`/api/planner/v1/tasks/${task.id}/references`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: 'https://example.com/doc', alias: 'Doc', type: 'web' }),
          });
          expect(res.status).toBe(201);
          const body = (await res.json()) as { url: string; alias: string; type: string };
          expect(body.url).toBe('https://example.com/doc');
          expect(body.alias).toBe('Doc');
          expect(body.type).toBe('web');

          const dup = await app.request(`/api/planner/v1/tasks/${task.id}/references`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: 'https://example.com/doc', type: 'web' }),
          });
          expect(dup.status).toBe(409);
          const dupBody = (await dup.json()) as { error: string };
          expect(dupBody.error).toBe('DUPLICATE_REFERENCE');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('DELETE /tasks/:id/references removes a reference by url; 404 when missing', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'refrm');
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

          await app.request(`/api/planner/v1/tasks/${task.id}/references`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: 'https://example.com/a', type: 'web' }),
          });

          const del = await app.request(`/api/planner/v1/tasks/${task.id}/references`, {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: 'https://example.com/a' }),
          });
          expect(del.status).toBe(204);

          const missing = await app.request(`/api/planner/v1/tasks/${task.id}/references`, {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: 'https://example.com/never' }),
          });
          expect(missing.status).toBe(404);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

describe('task assignees HTTP routes', () => {
  it('PUT /tasks/:id/assignees replaces the assignee set', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'assn');
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

          const memberId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO planner.assignee_projection
               (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
               VALUES ($1, $2, 'M', 'm@example.test', ARRAY[]::text[], 'available', 'UTC')`,
            [memberId, tenantId],
          );

          const app = buildTestApp(session);

          const res = await app.request(`/api/planner/v1/tasks/${task.id}/assignees`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              assignees: [
                { user_id: adminUserId, order_hint: 'a' },
                { user_id: memberId, order_hint: 'b' },
              ],
            }),
          });
          expect(res.status).toBe(204);

          const rows = await pool.query(
            `SELECT user_id, order_hint FROM planner.task_assignments WHERE task_id = $1 ORDER BY order_hint`,
            [task.id],
          );
          expect(rows.rows.map((r: { user_id: string }) => r.user_id)).toEqual([
            adminUserId,
            memberId,
          ]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('PUT /tasks/:id/assignee-priority writes assignee_priority on the task', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'assprio');
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

          const res = await app.request(`/api/planner/v1/tasks/${task.id}/assignee-priority`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ value: 'top' }),
          });
          expect(res.status).toBe(200);
          const body = (await res.json()) as { assignee_priority: string | null };
          expect(body.assignee_priority).toBe('top');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
