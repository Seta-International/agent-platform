import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { listTaskAssigneeUserIds } from '../../src/backend/read-helpers.ts';
import { createGroup, createPlan, createTask } from '../../src/index.ts';
import { assignTaskInGroup, seedTenant } from '../helpers.ts';

const testDbEnv = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('listTaskAssigneeUserIds', () => {
  it('returns the user_ids currently assigned to the task', async () => {
    await withTestDb(testDbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [
            { name: 'Alice', email: 'alice@example.test' },
            { name: 'Bob', email: 'bob@example.test' },
          ],
        });
        const session = seeded.adminSession;
        const [alice, bob] = seeded.users;
        if (!alice || !bob) throw new Error('Seed did not create both users');

        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
        const task = await createTask({ plan_id: plan.id, title: 'My Task', session });
        for (const u of [alice, bob]) {
          await assignTaskInGroup({
            group_id: group.id,
            task_id: task.id,
            user_id: u.user_id,
            session,
          });
        }

        const ids = await listTaskAssigneeUserIds(seeded.tenant_id, task.id);
        expect([...ids].sort()).toEqual([alice.user_id, bob.user_id].sort());
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns [] for a task with no assignees', async () => {
    await withTestDb(testDbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
        const task = await createTask({ plan_id: plan.id, title: 'Unassigned', session });

        expect(await listTaskAssigneeUserIds(seeded.tenant_id, task.id)).toEqual([]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is tenant-bound: another tenant sees no assignees for the task', async () => {
    await withTestDb(testDbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [{ name: 'Alice', email: 'alice@example.test' }],
        });
        const session = seeded.adminSession;
        const [alice] = seeded.users;
        if (!alice) throw new Error('Seed did not create Alice');

        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
        const task = await createTask({ plan_id: plan.id, title: 'My Task', session });
        await assignTaskInGroup({
          group_id: group.id,
          task_id: task.id,
          user_id: alice.user_id,
          session,
        });

        // Same task id, wrong tenant → nothing (tenant-bound predicate).
        expect(await listTaskAssigneeUserIds(crypto.randomUUID(), task.id)).toEqual([]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
