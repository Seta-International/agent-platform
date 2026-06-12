import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createBucket,
  createGroup,
  createPlan,
  createTask,
  getGroupActivity,
  moveTask,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const dbCfg = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('getGroupActivity move label data', () => {
  it('carries from/to bucket names on an in-plan column move', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const todo = await createBucket({ plan_id: plan.id, name: 'To Do', session });
        const doing = await createBucket({ plan_id: plan.id, name: 'In Progress', session });
        const t = await createTask({ plan_id: plan.id, bucket_id: todo.id, title: 'T', session });
        await moveTask({
          task_id: t.id,
          bucket_id: doing.id,
          expected_version: t.version,
          session,
        });

        const result = await getGroupActivity({ group_id: group.id, limit: 50, session });
        const move = result.items.find((i) => i.event_type === 'planner.task.moved');
        expect(move?.before_state?.bucket_name).toBe('To Do');
        expect(move?.after_state?.bucket_name).toBe('In Progress');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
