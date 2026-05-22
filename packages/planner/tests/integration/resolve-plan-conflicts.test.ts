import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';
import {
  createGroup,
  createPlan,
  linkGroupToM365,
  linkPlanToM365,
  resolvePlanConflicts,
} from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const HARNESS = {
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
};

describe('resolvePlanConflicts', () => {
  it('enqueues a push for local decisions and emits conflict-resolved with all decisions', async () => {
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

        const enqueuePlanPush = vi.fn().mockResolvedValue(undefined);
        const decisions = [
          { kind: 'plan' as const, field: 'name', choice: 'local' as const },
          {
            kind: 'task' as const,
            task_id: '00000000-0000-0000-0000-000000000123',
            field: 'due_at',
            choice: 'remote' as const,
          },
        ];
        const result = await resolvePlanConflicts(
          { plan_id: plan.id, decisions, session },
          { enqueuePlanPush },
        );
        expect(result.applied).toBe(2);

        // Only the 'local' decision is pushed.
        expect(enqueuePlanPush).toHaveBeenCalledWith({
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          decisions: [decisions[0]],
        });

        const events = await readEvents(pool, seeded.tenant_id, 'planner.plan.conflict-resolved');
        expect(events).toHaveLength(1);
        // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
        const p = events[0]?.payload as any;
        expect(p.decisions).toHaveLength(2);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects empty decisions with VALIDATION', async () => {
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
        const enqueuePlanPush = vi.fn();
        await expect(
          resolvePlanConflicts({ plan_id: plan.id, decisions: [], session }, { enqueuePlanPush }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects PLAN_NOT_LINKED when plan is native', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const enqueuePlanPush = vi.fn();
        await expect(
          resolvePlanConflicts(
            {
              plan_id: plan.id,
              decisions: [{ kind: 'plan', field: 'name', choice: 'local' }],
              session,
            },
            { enqueuePlanPush },
          ),
        ).rejects.toMatchObject({ code: 'PLAN_NOT_LINKED' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
