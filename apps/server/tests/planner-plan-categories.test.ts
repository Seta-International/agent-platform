import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { createUser } from '@seta/identity';
import { applyLabel, createGroup, createLabel, createPlan, createTask } from '@seta/planner';
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

  it('PUT /plans/:id/categories accepts a label-only patch and preserves the description', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, adminUserId, adminEmail } = await seedTenant(pool, 'catslabelonly');
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
            name: 'Bug',
            color: 'red',
            session,
          });

          const app = buildTestApp(session);

          // Seed slot 4 with a description, then send a label-only patch.
          const seedRes = await app.request(`/api/planner/v1/plans/${plan.id}/categories`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slots: { '4': { name: 'QA' } } }),
          });
          expect(seedRes.status).toBe(200);

          const res = await app.request(`/api/planner/v1/plans/${plan.id}/categories`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slots: { '4': { label_id: label.id } } }),
          });
          expect(res.status).toBe(200);
          const body = (await res.json()) as { category_descriptions: Record<string, string> };
          expect(body.category_descriptions.category4).toBe('QA');

          const labelRows = await pool.query(
            `SELECT category_slot FROM planner.labels WHERE id = $1`,
            [label.id],
          );
          expect(labelRows.rows[0]?.category_slot).toBe(4);
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

  it('GET /plans/:id/categories aggregates descriptions, attached labels, task_counts, and counts', async () => {
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

          const attachedNames = ['Backend', 'Frontend', 'QA', 'Docs'] as const;
          const unattachedNames = ['Bug', 'Spike', 'Chore'] as const;
          const attachedLabels = await Promise.all(
            attachedNames.map((name) =>
              createLabel({ plan_id: plan.id, name, color: 'blue', session }),
            ),
          );
          await Promise.all(
            unattachedNames.map((name) =>
              createLabel({ plan_id: plan.id, name, color: 'gray', session }),
            ),
          );

          const app = buildTestApp(session);

          // Seed 8 descriptions and bind the 4 attached labels to slots 1..4.
          const slots: Record<string, { name: string; label_id?: string }> = {};
          const descriptionSeed = [
            'Backend',
            'Frontend',
            'QA',
            'Docs',
            'Research',
            'Ops',
            'Security',
            'Design',
          ];
          for (let i = 0; i < 8; i++) {
            const slotKey = String(i + 1);
            slots[slotKey] = {
              name: descriptionSeed[i] as string,
              ...(i < 4 ? { label_id: attachedLabels[i]?.id } : {}),
            };
          }
          const seedRes = await app.request(`/api/planner/v1/plans/${plan.id}/categories`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slots }),
          });
          expect(seedRes.status).toBe(200);

          // Create tasks and apply attached labels:
          //   slot 1 (Backend): 2 distinct tasks
          //   slot 2 (Frontend): 1 task
          //   slot 3 (QA): 0 tasks
          //   slot 4 (Docs): 1 task, also labeled Backend (counts once per slot)
          const t1 = await createTask({ plan_id: plan.id, title: 'T1', session });
          const t2 = await createTask({ plan_id: plan.id, title: 'T2', session });
          const t3 = await createTask({ plan_id: plan.id, title: 'T3', session });
          const t4 = await createTask({ plan_id: plan.id, title: 'T4', session });
          const slot1Label = attachedLabels[0] as { id: string };
          const slot2Label = attachedLabels[1] as { id: string };
          const slot4Label = attachedLabels[3] as { id: string };
          await applyLabel({ task_id: t1.id, label_id: slot1Label.id, session });
          await applyLabel({ task_id: t2.id, label_id: slot1Label.id, session });
          await applyLabel({ task_id: t3.id, label_id: slot2Label.id, session });
          await applyLabel({ task_id: t4.id, label_id: slot4Label.id, session });
          await applyLabel({ task_id: t4.id, label_id: slot1Label.id, session });

          const res = await app.request(`/api/planner/v1/plans/${plan.id}/categories`);
          expect(res.status).toBe(200);
          const body = (await res.json()) as {
            descriptions: Record<string, string>;
            labels: Array<{ name: string; category_slot: number | null }>;
            task_counts: Record<string, number>;
            counts: { categories: number };
          };

          expect(body.descriptions.category1).toBe('Backend');
          expect(body.descriptions.category8).toBe('Design');
          expect(body.counts.categories).toBe(8);

          // Only labels bound to a slot show up in the editor's labels list.
          expect(body.labels).toHaveLength(4);
          expect(body.labels.every((l) => l.category_slot !== null)).toBe(true);
          expect(new Set(body.labels.map((l) => l.name))).toEqual(
            new Set(['Backend', 'Frontend', 'QA', 'Docs']),
          );

          // task_counts uses string slot keys; slots without tasks are absent.
          expect(body.task_counts['1']).toBe(3);
          expect(body.task_counts['2']).toBe(1);
          expect(body.task_counts['3']).toBeUndefined();
          expect(body.task_counts['4']).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
