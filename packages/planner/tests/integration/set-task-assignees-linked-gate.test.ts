import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';
import {
  createBucket,
  createGroup,
  createPlan,
  createTask,
  linkGroupToM365,
  linkPlanToM365,
  type PlannerSessionScope,
  type SetTaskAssigneesDeps,
  setTaskAssignees,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const HARNESS = {
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
};

describe('setTaskAssignees — m365-linked plan gate', () => {
  async function setup(pool: import('pg').Pool, linkPlan: boolean) {
    const seeded = await seedTenant(pool, {
      users: [
        { name: 'Alice', email: 'alice@example.test' },
        { name: 'Bob', email: 'bob@example.test' },
      ],
    });
    const session = seeded.adminSession;
    const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
    if (linkPlan) await linkGroupToM365({ group_id: group.id, external_id: 'G-EXT', session });
    const plan = await createPlan({ group_id: group.id, name: 'P', session });
    if (linkPlan) await linkPlanToM365({ plan_id: plan.id, external_id: 'P-EXT-1', session });
    const bucket = await createBucket({ plan_id: plan.id, name: 'B', session });
    const task = await createTask({
      plan_id: plan.id,
      bucket_id: bucket.id,
      title: 'T',
      session,
    });
    return { seeded, session, plan, task };
  }

  it('on a native plan, allows users with NULL entra_oid (gate does not fire)', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { seeded, session, task } = await setup(pool, false);
        const lookupEntraOids = vi
          .fn()
          .mockResolvedValue(new Map(seeded.users.map((u) => [u.user_id, null])));
        await setTaskAssignees(
          {
            task_id: task.id,
            assignees: seeded.users.map((u) => ({ user_id: u.user_id })),
            session,
          },
          { lookupEntraOids },
        );
        // Gate skipped → lookup not even invoked for native plans.
        expect(lookupEntraOids).not.toHaveBeenCalled();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('on a linked plan, allows users whose entra_oid is set', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { seeded, session, task } = await setup(pool, true);
        const lookupEntraOids: SetTaskAssigneesDeps['lookupEntraOids'] = async (ids) =>
          new Map(ids.map((id) => [id, `oid-${id}`]));
        await setTaskAssignees(
          {
            task_id: task.id,
            assignees: seeded.users.map((u) => ({ user_id: u.user_id })),
            session,
          },
          { lookupEntraOids },
        );
        const rows = await pool.query(
          'SELECT user_id FROM planner.task_assignments WHERE task_id = $1',
          [task.id],
        );
        expect(rows.rows).toHaveLength(2);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('on a linked plan, rejects ASSIGNEE_NOT_M365_SYNCABLE when a user has no entra_oid', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { seeded, session, task } = await setup(pool, true);
        const lookupEntraOids: SetTaskAssigneesDeps['lookupEntraOids'] = async (ids) =>
          new Map(ids.map((id, i) => [id, i === 0 ? null : `oid-${id}`]));
        await expect(
          setTaskAssignees(
            {
              task_id: task.id,
              assignees: seeded.users.map((u) => ({ user_id: u.user_id })),
              session,
            },
            { lookupEntraOids },
          ),
        ).rejects.toMatchObject({ code: 'ASSIGNEE_NOT_M365_SYNCABLE' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('on a linked plan, system actor bypasses the gate', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { seeded, session, task } = await setup(pool, true);
        const systemSession: PlannerSessionScope = {
          ...session,
          actor: { kind: 'system', system_id: 'integrations.m365' },
        };
        const lookupEntraOids = vi.fn();
        await setTaskAssignees(
          {
            task_id: task.id,
            assignees: seeded.users.map((u) => ({ user_id: u.user_id })),
            session: systemSession,
          },
          { lookupEntraOids },
        );
        expect(lookupEntraOids).not.toHaveBeenCalled();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
