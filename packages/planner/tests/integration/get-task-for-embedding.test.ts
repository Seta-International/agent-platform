import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, createPlan, createTask, getTaskForEmbedding } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

describe('getTaskForEmbedding', () => {
  it('returns title, description, skill_tags for a live task', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({
            plan_id: plan.id,
            title: 'Embed Me',
            description: 'Some description',
            skill_tags: ['typescript', 'react'],
            session,
          });

          const result = await getTaskForEmbedding({
            tenant_id: seeded.tenant_id,
            task_id: task.id,
          });

          expect(result).not.toBeNull();
          expect(result!.title).toBe('Embed Me');
          expect(result!.description).toBe('Some description');
          expect(result!.skill_tags).toEqual(expect.arrayContaining(['typescript', 'react']));
          expect(result!.skill_tags).toHaveLength(2);
          expect(result!.plan_id).toBe(plan.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null for a soft-deleted task', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'To Delete', session });

          // Soft-delete the task directly in the DB
          await pool.query(`UPDATE planner.tasks SET deleted_at = NOW() WHERE id = $1`, [task.id]);

          const result = await getTaskForEmbedding({
            tenant_id: seeded.tenant_id,
            task_id: task.id,
          });

          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null for a non-existent task id', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);

          const result = await getTaskForEmbedding({
            tenant_id: seeded.tenant_id,
            task_id: crypto.randomUUID(),
          });

          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null when task belongs to a different tenant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantA = await seedTenant(pool);
          const tenantB = await seedTenant(pool);

          const sessionA = tenantA.adminSession;
          const group = await createGroup({
            tenant_id: tenantA.tenant_id,
            name: 'Eng',
            session: sessionA,
          });
          const plan = await createPlan({
            group_id: group.id,
            name: 'Sprint 1',
            session: sessionA,
          });
          const task = await createTask({
            plan_id: plan.id,
            title: 'Tenant A Task',
            session: sessionA,
          });

          // Query from tenant B's perspective — must return null
          const result = await getTaskForEmbedding({
            tenant_id: tenantB.tenant_id,
            task_id: task.id,
          });

          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
