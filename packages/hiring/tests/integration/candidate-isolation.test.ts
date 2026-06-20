import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import { addCandidate, getCandidate, listCandidates, openRequisition } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('candidate org isolation', () => {
  it("never returns another tenant's candidates", async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const a = await seedTenant(pool);
        const b = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'R',
          kind: 'new',
          headcount: 1,
          session: a.adminSession,
        });
        const { candidate_id } = await addCandidate({
          requisition_id,
          name: 'Secret',
          session: a.adminSession,
        });

        expect(await listCandidates(b.adminSession)).toHaveLength(0);
        await expect(getCandidate({ candidate_id, session: b.adminSession })).rejects.toThrow(
          /not found/i,
        );
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
