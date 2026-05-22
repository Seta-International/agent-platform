import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createGroup,
  createPlan,
  linkGroupToM365,
  linkPlanToM365,
  unlinkPlanFromM365,
} from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const HARNESS = {
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
};

describe('unlinkPlanFromM365', () => {
  it('clears external_* fields, bumps version, emits updated with changed_fields', async () => {
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

        const unlinked = await unlinkPlanFromM365({ plan_id: plan.id, session });
        expect(unlinked.external_source).toBe('native');
        expect(unlinked.external_id).toBeNull();
        expect(unlinked.external_etag).toBeNull();
        expect(unlinked.external_synced_at).toBeNull();
        expect(unlinked.version).toBe(linked.version + 1);

        const events = await readEvents(pool, seeded.tenant_id, 'planner.plan.updated');
        const unlinkEvent = events
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          .map((e) => e.payload as any)
          .find((p) => p.changed_fields?.includes('external_etag'));
        expect(unlinkEvent).toBeDefined();
        expect(unlinkEvent.before.external_source).toBe('m365');
        expect(unlinkEvent.before.external_id).toBe('P-EXT-1');
        expect(unlinkEvent.after.external_source).toBe('native');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects with PLAN_NOT_LINKED when called on a native plan', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        await expect(unlinkPlanFromM365({ plan_id: plan.id, session })).rejects.toMatchObject({
          code: 'PLAN_NOT_LINKED',
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
