import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, createPlan, linkGroupToM365, linkPlanToM365 } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const HARNESS = {
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
};

describe('linkPlanToM365', () => {
  it('sets external_source/external_id, bumps version, emits updated with changed_fields', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;

        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        await linkGroupToM365({ group_id: group.id, external_id: 'G-EXT', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });

        const linked = await linkPlanToM365({
          plan_id: plan.id,
          external_id: 'P-EXT-1',
          session,
        });
        expect(linked.external_source).toBe('m365');
        expect(linked.external_id).toBe('P-EXT-1');
        expect(linked.version).toBe(plan.version + 1);

        const events = await readEvents(pool, seeded.tenant_id, 'planner.plan.updated');
        // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
        const payloads = events.map((e) => e.payload as any);
        const linkEvent = payloads.find((p) => p.changed_fields?.includes('external_source'));
        expect(linkEvent).toBeDefined();
        expect(linkEvent.changed_fields).toEqual(
          expect.arrayContaining(['external_source', 'external_id']),
        );
        expect(linkEvent.before.external_source).toBe('native');
        expect(linkEvent.before.external_id).toBeNull();
        expect(linkEvent.after.external_source).toBe('m365');
        expect(linkEvent.after.external_id).toBe('P-EXT-1');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects with GROUP_NOT_LINKED when parent group is native', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        await expect(
          linkPlanToM365({ plan_id: plan.id, external_id: 'P-EXT-1', session }),
        ).rejects.toMatchObject({ code: 'GROUP_NOT_LINKED' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects with LINKED_DUPLICATE_PLAN when another plan already uses the external_id', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        await linkGroupToM365({ group_id: group.id, external_id: 'G-EXT', session });
        const p1 = await createPlan({ group_id: group.id, name: 'P1', session });
        const p2 = await createPlan({ group_id: group.id, name: 'P2', session });
        await linkPlanToM365({ plan_id: p1.id, external_id: 'P-EXT-DUPE', session });
        await expect(
          linkPlanToM365({ plan_id: p2.id, external_id: 'P-EXT-DUPE', session }),
        ).rejects.toMatchObject({ code: 'LINKED_DUPLICATE_PLAN' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects with CONFLICT when plan is already linked', async () => {
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
        await expect(
          linkPlanToM365({ plan_id: plan.id, external_id: 'P-EXT-2', session }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
