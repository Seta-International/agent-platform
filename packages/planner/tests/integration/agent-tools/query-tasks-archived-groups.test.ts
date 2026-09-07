import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { queryTasks } from '../../../src/backend/agent-tools/query-tasks.ts';
import { createGroup, createPlan, createTask, deleteGroup } from '../../../src/index.ts';
import { makeMemberSession, seedTenant } from '../../helpers.ts';

function testDbOpts() {
  return {
    templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
    baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
  };
}

describe('queryTasks and archived groups (FUT-832)', () => {
  it('excludes tasks in archived groups from a tenant-wide admin query', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;

        const live = await createGroup({ tenant_id: seeded.tenant_id, name: 'Live', session });
        const livePlan = await createPlan({ group_id: live.id, name: 'Live Board', session });
        await createTask({ plan_id: livePlan.id, title: 'still-visible', session });

        const gone = await createGroup({ tenant_id: seeded.tenant_id, name: 'Gone', session });
        const gonePlan = await createPlan({ group_id: gone.id, name: 'Gone Board', session });
        await createTask({ plan_id: gonePlan.id, title: 'buried', session });
        await deleteGroup({ group_id: gone.id, expected_version: gone.version, session });

        const result = await queryTasks({ status: 'any', session });

        expect(result.tasks.map((t) => t.title)).toEqual(['still-visible']);
      } finally {
        await closePools();
      }
    });
  });

  it('returns archived-group tasks when the caller opts in, and reports that it did', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;

        const live = await createGroup({ tenant_id: seeded.tenant_id, name: 'Live', session });
        const livePlan = await createPlan({ group_id: live.id, name: 'Live Board', session });
        await createTask({ plan_id: livePlan.id, title: 'still-visible', session });

        const gone = await createGroup({ tenant_id: seeded.tenant_id, name: 'Gone', session });
        const gonePlan = await createPlan({ group_id: gone.id, name: 'Gone Board', session });
        await createTask({ plan_id: gonePlan.id, title: 'buried', session });
        await deleteGroup({ group_id: gone.id, expected_version: gone.version, session });

        const result = await queryTasks({ status: 'any', includeArchived: true, session });

        expect(result.tasks.map((t) => t.title).sort()).toEqual(['buried', 'still-visible']);
        expect(result.includedArchivedGroups).toBe(true);
      } finally {
        await closePools();
      }
    });
  });

  it('flags "no active groups" only for the caller whose every group is archived', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const admin = seeded.adminSession;

        const live = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Live',
          session: admin,
        });
        const livePlan = await createPlan({
          group_id: live.id,
          name: 'Live Board',
          session: admin,
        });
        await createTask({ plan_id: livePlan.id, title: 'still-visible', session: admin });

        const gone = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'Gone',
          session: admin,
        });
        const gonePlan = await createPlan({
          group_id: gone.id,
          name: 'Gone Board',
          session: admin,
        });
        await createTask({ plan_id: gonePlan.id, title: 'buried', session: admin });

        const strandedMember = await makeMemberSession(pool, {
          tenant_id: seeded.tenant_id,
          group_id: gone.id,
          role: 'member',
        });
        const activeMember = await makeMemberSession(pool, {
          tenant_id: seeded.tenant_id,
          group_id: live.id,
          role: 'member',
        });
        await deleteGroup({ group_id: gone.id, expected_version: gone.version, session: admin });

        const stranded = await queryTasks({ status: 'any', session: strandedMember });
        expect(stranded.tasks).toEqual([]);
        expect(stranded.noActiveGroups).toBe(true);

        const reachable = await queryTasks({ status: 'any', session: activeMember });
        expect(reachable.tasks.map((t) => t.title)).toEqual(['still-visible']);
        expect(reachable.noActiveGroups).toBe(false);
      } finally {
        await closePools();
      }
    });
  });
});
