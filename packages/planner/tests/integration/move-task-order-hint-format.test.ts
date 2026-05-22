import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createBucket, createGroup, createPlan, createTask, moveTask } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const HARNESS = {
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
};

describe('moveTask order_hint format per plan external_source', () => {
  it('writes a fractional-indexing order_hint on native plans', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const bucket = await createBucket({ plan_id: plan.id, name: 'B', session });
        const t1 = await createTask({
          plan_id: plan.id,
          bucket_id: bucket.id,
          title: 't1',
          session,
        });
        const t2 = await createTask({
          plan_id: plan.id,
          bucket_id: bucket.id,
          title: 't2',
          session,
        });
        const moved = await moveTask({
          task_id: t2.id,
          expected_version: 1,
          bucket_id: bucket.id,
          before_id: t1.id,
          session,
        });
        // Fractional-indexing keys are short alphanumerics, no spaces, no trailing '!'.
        expect(moved.order_hint).toMatch(/^[A-Za-z0-9]+$/);
        expect(moved.order_hint).not.toContain('!');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('writes Planner directive form order_hint on m365-linked plans', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const bucket = await createBucket({ plan_id: plan.id, name: 'B', session });
        const t1 = await createTask({
          plan_id: plan.id,
          bucket_id: bucket.id,
          title: 't1',
          session,
        });
        const t2 = await createTask({
          plan_id: plan.id,
          bucket_id: bucket.id,
          title: 't2',
          session,
        });

        // Promote the plan to m365 + force canonical hints on the existing tasks
        // so directive form has known endpoints to splice between.
        await pool.query(
          `UPDATE planner.plans SET external_source = 'm365', external_id = 'P-EXT' WHERE id = $1`,
          [plan.id],
        );
        await pool.query(`UPDATE planner.tasks SET order_hint = '5637' WHERE id = $1`, [t1.id]);
        await pool.query(`UPDATE planner.tasks SET order_hint = 'adhg' WHERE id = $1`, [t2.id]);

        const moved = await moveTask({
          task_id: t2.id,
          expected_version: 1,
          bucket_id: bucket.id,
          before_id: t1.id,
          session,
        });
        // Before t1 with no prev: prev=null, next='5637' → directive ` 5637!`.
        expect(moved.order_hint).toBe(' 5637!');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
