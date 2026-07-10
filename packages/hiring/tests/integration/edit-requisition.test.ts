// packages/hiring/tests/integration/edit-requisition.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { requisition } from '../../src/backend/db/schema.ts';
import { editRequisition, openRequisition } from '../../src/index.ts';
import { countEvents, inScope, seedTenant } from '../helpers.ts';

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
        const { requisition_id } = await inScope(t.adminSession, () =>
          openRequisition({
            title: 'Old',
            kind: 'new',
            session: t.adminSession,
          }),
        );
        const { version } = await inScope(t.adminSession, () =>
          editRequisition({
            requisition_id,
            expected_version: 1,
            patch: { title: 'New', stage: 'screening' },
            session: t.adminSession,
          }),
        );
        expect(version).toBe(2);
        const [r] = await inScope(t.adminSession, () =>
          hiringDb().select().from(requisition).where(eq(requisition.id, requisition_id)),
        );
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

  it('rejects a patch that pushes start_date past the stored due_date', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await inScope(t.adminSession, () =>
          openRequisition({
            title: 'Web Developer',
            kind: 'new',
            due_date: '2026-07-02',
            session: t.adminSession,
          }),
        );
        // Only start_date is in the patch — the check must compare it against the *stored*
        // due_date, not just fields present in this same patch.
        await expect(
          inScope(t.adminSession, () =>
            editRequisition({
              requisition_id,
              patch: { start_date: '2026-07-10' },
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow('start_date must be before due_date');
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
        const { requisition_id } = await inScope(t.adminSession, () =>
          openRequisition({
            title: 'A',
            kind: 'new',
            session: t.adminSession,
          }),
        );
        await expect(
          inScope(t.adminSession, () =>
            editRequisition({
              requisition_id,
              expected_version: 99,
              patch: { title: 'B' },
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow('version mismatch');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
