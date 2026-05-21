import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { createUser } from '@seta/identity';
import { createGroup, createLabel, createPlan } from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
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

function buildTestApp(session: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session);
    await next();
  });
  registerPlannerPlansRoutes(app);
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

describe('plan categories HTTP routes', () => {
  it('PUT /plans/:id/categories sets slot descriptions and (optional) label binding', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'cats');
          const session = buildSession({
            tenant_id: tenantId,
            user_id: adminUserId,
            email: adminEmail,
            display_name: 'Admin',
          });
          const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Backend',
            color: 'blue',
            session,
          });

          const app = buildTestApp(session);

          const res = await app.request(`/api/planner/v1/plans/${plan.id}/categories`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              slots: {
                '1': { name: 'Backend', label_id: label.id },
                '2': { name: 'Frontend' },
              },
            }),
          });
          expect(res.status).toBe(200);
          const body = (await res.json()) as { category_descriptions: Record<string, string> };
          expect(body.category_descriptions.category1).toBe('Backend');
          expect(body.category_descriptions.category2).toBe('Frontend');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('PUT /plans/:id/categories rejects non-numeric slot keys with 400', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'catsbad');
          const session = buildSession({
            tenant_id: tenantId,
            user_id: adminUserId,
            email: adminEmail,
            display_name: 'Admin',
          });
          const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });

          const app = buildTestApp(session);

          const res = await app.request(`/api/planner/v1/plans/${plan.id}/categories`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slots: { foo: { name: 'x' } } }),
          });
          expect(res.status).toBe(400);

          const resOut = await app.request(`/api/planner/v1/plans/${plan.id}/categories`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slots: { '26': { name: 'x' } } }),
          });
          expect(resOut.status).toBe(400);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('GET /plans/:id/categories returns descriptions, labels, task_counts, counts', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'catsread');
          const session = buildSession({
            tenant_id: tenantId,
            user_id: adminUserId,
            email: adminEmail,
            display_name: 'Admin',
          });
          const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });
          await createLabel({ plan_id: plan.id, name: 'Backend', color: 'blue', session });

          const app = buildTestApp(session);

          await app.request(`/api/planner/v1/plans/${plan.id}/categories`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slots: { '3': { name: 'QA' } } }),
          });

          const res = await app.request(`/api/planner/v1/plans/${plan.id}/categories`);
          expect(res.status).toBe(200);
          const body = (await res.json()) as {
            descriptions: Record<string, string>;
            labels: Array<{ name: string }>;
            task_counts: Record<string, number>;
            counts: { categories: number };
          };
          expect(body.descriptions.category3).toBe('QA');
          expect(body.labels.map((l) => l.name)).toContain('Backend');
          expect(body.task_counts).toEqual({});
          expect(body.counts.categories).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
