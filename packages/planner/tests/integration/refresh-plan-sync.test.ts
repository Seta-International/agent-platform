import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';
import {
  createGroup,
  createPlan,
  linkGroupToM365,
  linkPlanToM365,
  refreshPlanSync,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const HARNESS = {
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
};

describe('refreshPlanSync', () => {
  it('enqueues an m365 plan pull for linked plans', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        await linkGroupToM365({ group_id: group.id, external_id: 'G-EXT', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        await linkPlanToM365({ plan_id: plan.id, external_id: 'P-EXT-1', session });

        const enqueuePlanPull = vi.fn().mockResolvedValue(undefined);
        await refreshPlanSync({ plan_id: plan.id, session }, { enqueuePlanPull });
        expect(enqueuePlanPull).toHaveBeenCalledWith({
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          full: false,
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects with PLAN_NOT_LINKED when the plan is native', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const enqueuePlanPull = vi.fn();
        await expect(
          refreshPlanSync({ plan_id: plan.id, session }, { enqueuePlanPull }),
        ).rejects.toMatchObject({ code: 'PLAN_NOT_LINKED' });
        expect(enqueuePlanPull).not.toHaveBeenCalled();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
