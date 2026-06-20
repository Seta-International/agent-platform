// packages/hiring/tests/integration/read-requisitions.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import { getRequisition, listRequisitions, openRequisition } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('read requisitions', () => {
  it('lists with opening counts and fetches a detail bundle', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'SRE',
          kind: 'new',
          headcount: 2,
          skills: [{ skill_name: 'Go' }],
          session: t.adminSession,
        });
        const list = await listRequisitions(t.adminSession);
        const row = list.find((r) => r.id === requisition_id);
        expect(row?.openings_total).toBe(2);
        expect(row?.openings_open).toBe(2);
        expect(row?.applicants_count).toBe(0);

        const detail = await getRequisition({ requisition_id, session: t.adminSession });
        expect(detail.openings).toHaveLength(2);
        expect(detail.skills[0]?.skill_name).toBe('Go');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('getRequisition throws NOT_FOUND for another tenant', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const a = await seedTenant(pool);
        const b = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'X',
          kind: 'new',
          session: a.adminSession,
        });
        await expect(getRequisition({ requisition_id, session: b.adminSession })).rejects.toThrow(
          'not found',
        );
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
