import { hashRoleSummary, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createGroup,
  createPlan,
  createTask,
  deleteGroup,
  deletePlan,
  deleteTask,
  purgeGroup,
  purgePlan,
  purgeTask,
  restoreTask,
} from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));

function createCustomSession(tenantId: string, roles: string[]): SessionScope {
  const role_summary = { roles, cross_tenant_read: false, assignments: [] };
  return {
    session_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    tenant_id: tenantId,
    email: 'restricted@example.test',
    display_name: 'Restricted User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: resolvePermissions(_registry, roles, IMPLICIT_PERMISSIONS),
    assignments: [],
    group_ids: [],
    product_access: new Set<string>(),
    person_id: null,
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

describe('purge-trash integration tests', () => {
  it('1. Purges soft-deleted task and emits planner.task.purged', async () => {
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

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G1', session });
          const plan = await createPlan({
            group_id: group.id,
            name: 'P1',
            session,
          });
          const task = await createTask({
            plan_id: plan.id,
            title: 'T1',
            session,
          });

          await deleteTask({ task_id: task.id, expected_version: 1, session });
          await purgeTask({ task_id: task.id, session });

          const { rows } = await pool.query(`SELECT id FROM planner.tasks WHERE id = $1`, [
            task.id,
          ]);
          expect(rows).toHaveLength(0);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.purged');
          expect(events).toHaveLength(1);
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('2. Purges soft-deleted plan and child tasks, emitting planner.plan.purged', async () => {
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

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G1', session });
          const plan = await createPlan({
            group_id: group.id,
            name: 'P1',
            session,
          });
          const task1 = await createTask({
            plan_id: plan.id,
            title: 'T1',
            session,
          });

          await deletePlan({ plan_id: plan.id, expected_version: 1, session });
          await purgePlan({ plan_id: plan.id, session });

          const { rows: planRows } = await pool.query(
            `SELECT id FROM planner.plans WHERE id = $1`,
            [plan.id],
          );
          expect(planRows).toHaveLength(0);

          const { rows: taskRows } = await pool.query(
            `SELECT id FROM planner.tasks WHERE id = $1`,
            [task1.id],
          );
          expect(taskRows).toHaveLength(0);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.plan.purged');
          expect(events).toHaveLength(1);
          const payload = events[0]?.payload as any;
          expect(payload.plan_id).toBe(plan.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('3. Purges soft-deleted group and all child plans & tasks', async () => {
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

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G1', session });
          const plan = await createPlan({
            group_id: group.id,
            name: 'P1',
            session,
          });
          const task = await createTask({
            plan_id: plan.id,
            title: 'T1',
            session,
          });

          await deleteGroup({ group_id: group.id, expected_version: 1, session });
          await purgeGroup({ group_id: group.id, session });

          const { rows: groupRows } = await pool.query(
            `SELECT id FROM planner.groups WHERE id = $1`,
            [group.id],
          );
          expect(groupRows).toHaveLength(0);

          const { rows: planRows } = await pool.query(
            `SELECT id FROM planner.plans WHERE id = $1`,
            [plan.id],
          );
          expect(planRows).toHaveLength(0);

          const { rows: taskRows } = await pool.query(
            `SELECT id FROM planner.tasks WHERE id = $1`,
            [task.id],
          );
          expect(taskRows).toHaveLength(0);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.group.purged');
          expect(events).toHaveLength(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('4. Throws FORBIDDEN when user lacks planner.trash.empty permission', async () => {
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
          const adminSession = seeded.adminSession;

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G1',
            session: adminSession,
          });
          const plan = await createPlan({
            group_id: group.id,
            name: 'P1',
            session: adminSession,
          });
          const task = await createTask({
            plan_id: plan.id,
            title: 'T1',
            session: adminSession,
          });
          await deleteTask({ task_id: task.id, expected_version: 1, session: adminSession });

          const restrictedSession = createCustomSession(seeded.tenant_id, []);
          await expect(
            purgeTask({ task_id: task.id, session: restrictedSession }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('5. Throws NOT_FOUND on cross-tenant purge access', async () => {
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

          const groupA = await createGroup({
            tenant_id: tenantA.tenant_id,
            name: 'GA',
            session: tenantA.adminSession,
          });
          const planA = await createPlan({
            group_id: groupA.id,
            name: 'PA',
            session: tenantA.adminSession,
          });
          const taskA = await createTask({
            plan_id: planA.id,
            title: 'TA',
            session: tenantA.adminSession,
          });
          await deleteTask({
            task_id: taskA.id,
            expected_version: 1,
            session: tenantA.adminSession,
          });

          // Tenant B tries to purge Tenant A's task
          await expect(
            purgeTask({ task_id: taskA.id, session: tenantB.adminSession }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('6. Throws CONFLICT when item is not in trash (deleted_at IS NULL)', async () => {
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

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G1', session });
          const plan = await createPlan({
            group_id: group.id,
            name: 'P1',
            session,
          });
          const task = await createTask({
            plan_id: plan.id,
            title: 'Active Task',
            session,
          });

          await expect(purgeTask({ task_id: task.id, session })).rejects.toMatchObject({
            code: 'CONFLICT',
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('7. Handles double purge idempotently without error', async () => {
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

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G1', session });
          const plan = await createPlan({
            group_id: group.id,
            name: 'P1',
            session,
          });
          const task = await createTask({
            plan_id: plan.id,
            title: 'T1',
            session,
          });
          await deleteTask({ task_id: task.id, expected_version: 1, session });

          // First purge
          await purgeTask({ task_id: task.id, session });
          // Second purge (already missing)
          await expect(purgeTask({ task_id: task.id, session })).resolves.toBeUndefined();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('8. Emits event exactly once per purge operation', async () => {
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

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G1', session });
          const plan = await createPlan({
            group_id: group.id,
            name: 'P1',
            session,
          });
          const task = await createTask({
            plan_id: plan.id,
            title: 'T1',
            session,
          });

          await deleteTask({ task_id: task.id, expected_version: 1, session });
          await purgeTask({ task_id: task.id, session });

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.purged');
          expect(events).toHaveLength(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('9. Purges group with many plans and tasks', async () => {
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'BigGroup',
            session,
          });

          const planIds: string[] = [];
          const taskIds: string[] = [];

          for (let pIdx = 0; pIdx < 3; pIdx++) {
            const plan = await createPlan({
              group_id: group.id,
              name: `Plan ${pIdx}`,
              session,
            });
            planIds.push(plan.id);

            for (let tIdx = 0; tIdx < 4; tIdx++) {
              const task = await createTask({
                plan_id: plan.id,
                title: `Task ${pIdx}-${tIdx}`,
                session,
              });
              taskIds.push(task.id);
            }
          }

          await deleteGroup({ group_id: group.id, expected_version: 1, session });
          await purgeGroup({ group_id: group.id, session });

          const { rows: remainingTasks } = await pool.query(
            `SELECT id FROM planner.tasks WHERE id = ANY($1::uuid[])`,
            [taskIds],
          );
          expect(remainingTasks).toHaveLength(0);

          const { rows: remainingPlans } = await pool.query(
            `SELECT id FROM planner.plans WHERE id = ANY($1::uuid[])`,
            [planIds],
          );
          expect(remainingPlans).toHaveLength(0);

          const { rows: remainingGroup } = await pool.query(
            `SELECT id FROM planner.groups WHERE id = $1`,
            [group.id],
          );
          expect(remainingGroup).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('10. Restore vs Purge race scenario', async () => {
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

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G1', session });
          const plan = await createPlan({
            group_id: group.id,
            name: 'P1',
            session,
          });
          const task = await createTask({
            plan_id: plan.id,
            title: 'T1',
            session,
          });

          await deleteTask({ task_id: task.id, expected_version: 1, session });
          await restoreTask({ task_id: task.id, session });

          // Task is now restored (active). Attempting to purge it must fail with CONFLICT
          await expect(purgeTask({ task_id: task.id, session })).rejects.toMatchObject({
            code: 'CONFLICT',
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
