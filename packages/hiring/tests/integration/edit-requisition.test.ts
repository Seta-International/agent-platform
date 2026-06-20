// packages/hiring/tests/integration/edit-requisition.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { requisition } from '../../src/backend/db/schema.ts';
import { editRequisition, openRequisition } from '../../src/index.ts';
import { countEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('editRequisition', () => {
  it('patches fields, bumps version, emits updated', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'Old',
          kind: 'new',
          session: t.adminSession,
        });
        const { version } = await editRequisition({
          requisition_id,
          expected_version: 1,
          patch: { title: 'New', stage: 'screening' },
          session: t.adminSession,
        });
        expect(version).toBe(2);
        const [r] = await hiringDb()
          .select()
          .from(requisition)
          .where(eq(requisition.id, requisition_id));
        expect(r?.title).toBe('New');
        expect(r?.stage).toBe('screening');
        expect(await countEvents(pool, t.tenant_id, 'hiring.requisition.updated')).toBe(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a stale version with CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'A',
          kind: 'new',
          session: t.adminSession,
        });
        await expect(
          editRequisition({
            requisition_id,
            expected_version: 99,
            patch: { title: 'B' },
            session: t.adminSession,
          }),
        ).rejects.toThrow('version mismatch');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
