import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { createOrgUnit } from '../../src/index.ts';
import { inScope, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('createOrgUnit', () => {
  it('emits people.org_unit.created into core.events', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { org_unit_id } = await inScope(t.adminSession, () =>
          createOrgUnit({
            name: 'Delivery A',
            kind: 'delivery',
            session: t.adminSession,
          } as never),
        );

        const events = await readEvents(pool, t.tenant_id, 'people.org_unit.created');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(org_unit_id);
        expect(events[0]?.payload).toMatchObject({
          org_unit_id,
          tenant_id: t.tenant_id,
          parent_id: null,
          name: 'Delivery A',
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
