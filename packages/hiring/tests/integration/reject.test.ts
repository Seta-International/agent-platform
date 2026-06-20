import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { application } from '../../src/backend/db/schema.ts';
import {
  addCandidate,
  archiveRejectionReason,
  createRejectionReason,
  listRejectionReasons,
  openRequisition,
  rejectApplication,
} from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('rejectApplication', () => {
  it('records reason, tags, and a categorized event', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'R',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { application_id } = await addCandidate({
          requisition_id,
          name: 'C',
          session: t.adminSession,
        });
        const reason = await createRejectionReason({
          input: { label: 'Lacking skills', category: 'rejected_by_us' },
          session: t.adminSession,
        });

        await rejectApplication({
          application_id,
          expected_version: 1,
          input: { reason_id: reason.id, tags: ['junior', 'no-react'] },
          session: t.adminSession,
        });

        const [app] = await hiringDb()
          .select()
          .from(application)
          .where(eq(application.id, application_id));
        expect(app?.status).toBe('rejected');
        expect(app?.rejection_reason_id).toBe(reason.id);
        expect(app?.tags).toEqual(['junior', 'no-react']);
        expect(app?.closed_at).not.toBeNull();

        const evts = await readEvents(pool, t.tenant_id, 'hiring.application.rejected');
        expect(evts[0]?.payload.category).toBe('rejected_by_us');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('stale version throws CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'R',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { application_id } = await addCandidate({
          requisition_id,
          name: 'C',
          session: t.adminSession,
        });
        const reason = await createRejectionReason({
          input: { label: 'Overqualified', category: 'other' },
          session: t.adminSession,
        });

        await expect(
          rejectApplication({
            application_id,
            expected_version: 99,
            input: { reason_id: reason.id, tags: [] },
            session: t.adminSession,
          }),
        ).rejects.toThrow(/version/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reject-from-terminal status throws CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'R',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { application_id } = await addCandidate({
          requisition_id,
          name: 'C',
          session: t.adminSession,
        });
        const reason = await createRejectionReason({
          input: { label: 'Already closed', category: 'withdrew' },
          session: t.adminSession,
        });

        // Force terminal status
        await pool.query(
          `UPDATE hiring.application SET status = 'rejected', version = 2 WHERE id = $1`,
          [application_id],
        );

        await expect(
          rejectApplication({
            application_id,
            expected_version: 2,
            input: { reason_id: reason.id, tags: [] },
            session: t.adminSession,
          }),
        ).rejects.toThrow(/active/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('unknown reason_id throws VALIDATION', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'R',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { application_id } = await addCandidate({
          requisition_id,
          name: 'C',
          session: t.adminSession,
        });

        await expect(
          rejectApplication({
            application_id,
            input: { reason_id: crypto.randomUUID(), tags: [] },
            session: t.adminSession,
          }),
        ).rejects.toThrow();
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('rejection-reason admin', () => {
  it('create + list + archive + archive stale-version throws CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { id } = await createRejectionReason({
          input: { label: 'Not a culture fit', category: 'rejected_by_us' },
          session: t.adminSession,
        });

        const list = await listRejectionReasons(t.adminSession);
        expect(list.find((r) => r.id === id)?.active).toBe(true);

        // Stale version archive throws CONFLICT
        await expect(
          archiveRejectionReason({ id, expected_version: 99, session: t.adminSession }),
        ).rejects.toThrow(/version/i);

        // Archive succeeds
        const { version } = await archiveRejectionReason({ id, session: t.adminSession });
        expect(version).toBe(2);

        const list2 = await listRejectionReasons(t.adminSession);
        expect(list2.find((r) => r.id === id)?.active).toBe(false);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
