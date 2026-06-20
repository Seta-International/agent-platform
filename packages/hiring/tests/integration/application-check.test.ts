import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { application } from '../../src/backend/db/schema.ts';
import { openRequisition } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('application exactly-one-subject CHECK', () => {
  it('rejects both-subjects and neither-subject, accepts exactly one', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'R',
          kind: 'new',
          session: t.adminSession,
        });

        // both subjects → rejected
        await expect(
          hiringDb().insert(application).values({
            tenant_id: t.tenant_id,
            requisition_id,
            kind: 'external',
            candidate_id: crypto.randomUUID(),
            worker_id: crypto.randomUUID(),
          }),
        ).rejects.toThrow();

        // neither subject → rejected
        await expect(
          hiringDb().insert(application).values({
            tenant_id: t.tenant_id,
            requisition_id,
            kind: 'external',
          }),
        ).rejects.toThrow();

        // exactly one → accepted
        const inserted = await hiringDb()
          .insert(application)
          .values({
            tenant_id: t.tenant_id,
            requisition_id,
            kind: 'external',
            candidate_id: crypto.randomUUID(),
          })
          .returning({ id: application.id });
        expect(inserted).toHaveLength(1);
      } finally {
        resetHiringDb();
        await closePools();
      }
    });
  });
});
