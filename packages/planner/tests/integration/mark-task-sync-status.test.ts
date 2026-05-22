import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createBucket,
  createGroup,
  createPlan,
  createTask,
  linkGroupToM365,
  linkPlanToM365,
  markTaskSyncStatus,
  type PlannerSessionScope,
} from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const HARNESS = {
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
};

describe('markTaskSyncStatus', () => {
  async function seedLinkedTask(pool: import('pg').Pool) {
    const seeded = await seedTenant(pool);
    const session = seeded.adminSession;
    const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
    await linkGroupToM365({ group_id: group.id, external_id: 'G-EXT', session });
    const plan = await createPlan({ group_id: group.id, name: 'P', session });
    await linkPlanToM365({ plan_id: plan.id, external_id: 'P-EXT-1', session });
    const bucket = await createBucket({ plan_id: plan.id, name: 'B', session });
    const task = await createTask({
      plan_id: plan.id,
      bucket_id: bucket.id,
      title: 'T',
      session,
    });
    const systemSession: PlannerSessionScope = {
      ...session,
      actor: { kind: 'system', system_id: 'integrations.m365' },
    };
    return { seeded, task, systemSession, userSession: session };
  }

  it('transitions task sync_status and emits sync-status-changed', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { seeded, task, systemSession } = await seedLinkedTask(pool);
        await markTaskSyncStatus({ task_id: task.id, status: 'pushing', session: systemSession });
        const events = await readEvents(pool, seeded.tenant_id, 'planner.task.sync-status-changed');
        expect(events).toHaveLength(1);
        // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
        const p = events[0]?.payload as any;
        expect(p.task_id).toBe(task.id);
        expect(p.before_status).toBe('idle');
        expect(p.after_status).toBe('pushing');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects RESERVED_FOR_SYSTEM_ACTOR when called from a human session', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { task, userSession } = await seedLinkedTask(pool);
        await expect(
          markTaskSyncStatus({ task_id: task.id, status: 'pulling', session: userSession }),
        ).rejects.toMatchObject({ code: 'RESERVED_FOR_SYSTEM_ACTOR' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
