import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { application, candidateEvent } from '../../src/backend/db/schema.ts';
import { addCandidate, openRequisition, transferApplication } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('transferApplication', () => {
  it('opens a new application on the target and closes the old one', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const r1 = await openRequisition({
          title: 'R1',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const r2 = await openRequisition({
          title: 'R2',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { candidate_id, application_id } = await addCandidate({
          requisition_id: r1.requisition_id,
          name: 'C',
          session: t.adminSession,
        });

        const res = await transferApplication({
          application_id,
          expected_version: 1,
          input: { target_requisition_id: r2.requisition_id },
          session: t.adminSession,
        });

        const [old] = await hiringDb()
          .select()
          .from(application)
          .where(eq(application.id, application_id));
        expect(old?.status).toBe('transferred');
        expect(old?.superseded_by_application_id).toBe(res.to_application_id);

        const [neu] = await hiringDb()
          .select()
          .from(application)
          .where(eq(application.id, res.to_application_id));
        expect(neu?.requisition_id).toBe(r2.requisition_id);
        expect(neu?.status).toBe('active');
        expect(neu?.stage).toBe('new');
        expect(neu?.candidate_id).toBe(candidate_id);

        const tl = await hiringDb()
          .select()
          .from(candidateEvent)
          .where(eq(candidateEvent.candidate_id, candidate_id));
        expect(tl.map((e) => e.kind)).toContain('transferred');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects with CONFLICT when the same candidate already has an active application on the target', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const r1 = await openRequisition({
          title: 'R1',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const r2 = await openRequisition({
          title: 'R2',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const r3 = await openRequisition({
          title: 'R3',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { application_id, candidate_id } = await addCandidate({
          requisition_id: r1.requisition_id,
          name: 'C',
          session: t.adminSession,
        });
        // transfer C's r1 app to r2 — candidate now has an active app on r2
        await transferApplication({
          application_id,
          expected_version: 1,
          input: { target_requisition_id: r2.requisition_id },
          session: t.adminSession,
        });
        // directly insert a second active app for the same candidate on r3
        const [r3App] = await hiringDb()
          .insert(application)
          .values({
            tenant_id: t.adminSession.tenant_id,
            requisition_id: r3.requisition_id,
            kind: 'external',
            candidate_id,
            stage: 'new',
            status: 'active',
          })
          .returning({ id: application.id, version: application.version });
        if (!r3App) throw new Error('setup: r3 application insert returned no row');
        // attempt to transfer C's r3 app to r2 (C already has active on r2) — must throw CONFLICT
        await expect(
          transferApplication({
            application_id: r3App.id,
            expected_version: r3App.version,
            input: { target_requisition_id: r2.requisition_id },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
