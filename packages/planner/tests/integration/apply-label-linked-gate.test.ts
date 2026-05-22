import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  applyLabel,
  attachLabelToCategorySlot,
  createBucket,
  createGroup,
  createLabel,
  createPlan,
  createTask,
  linkGroupToM365,
  linkPlanToM365,
  type PlannerSessionScope,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const HARNESS = {
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
};

describe('applyLabel — m365-linked plan gate', () => {
  async function setup(pool: import('pg').Pool, linkPlan: boolean) {
    const seeded = await seedTenant(pool);
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
    const slotless = await createLabel({
      plan_id: plan.id,
      name: 'SlotLess',
      color: 'red',
      session,
    });
    const slotted = await createLabel({
      plan_id: plan.id,
      name: 'Slotted',
      color: 'blue',
      session,
    });
    await attachLabelToCategorySlot({
      plan_id: plan.id,
      label_id: slotted.id,
      slot: 1,
      session,
    });
    return { seeded, session, plan, task, slotless, slotted };
  }

  it('on a native plan, allows slot-less label', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task, slotless } = await setup(pool, false);
        await applyLabel({ task_id: task.id, label_id: slotless.id, session });
        const rows = await pool.query(
          'SELECT label_id FROM planner.task_labels WHERE task_id = $1',
          [task.id],
        );
        expect(rows.rows).toHaveLength(1);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('on a linked plan, allows slot-mapped label', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task, slotted } = await setup(pool, true);
        await applyLabel({ task_id: task.id, label_id: slotted.id, session });
        const rows = await pool.query(
          'SELECT label_id FROM planner.task_labels WHERE task_id = $1',
          [task.id],
        );
        expect(rows.rows).toHaveLength(1);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('on a linked plan, rejects LABEL_NOT_SYNCABLE for slot-less label', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task, slotless } = await setup(pool, true);
        await expect(
          applyLabel({ task_id: task.id, label_id: slotless.id, session }),
        ).rejects.toMatchObject({ code: 'LABEL_NOT_SYNCABLE' });
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
        const { session, task, slotless } = await setup(pool, true);
        const systemSession: PlannerSessionScope = {
          ...session,
          actor: { kind: 'system', system_id: 'integrations.m365' },
        };
        await applyLabel({ task_id: task.id, label_id: slotless.id, session: systemSession });
        const rows = await pool.query(
          'SELECT label_id FROM planner.task_labels WHERE task_id = $1',
          [task.id],
        );
        expect(rows.rows).toHaveLength(1);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
