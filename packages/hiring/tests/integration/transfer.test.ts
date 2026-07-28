import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { application, candidateEvent } from '../../src/backend/db/schema.ts';
import {
  addCandidate,
  createRejectionReason,
  hireApplication,
  openRequisition,
  rejectApplication,
  transferApplication,
} from '../../src/index.ts';
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

  it('allows re-applying a candidate to a requisition they have a transferred application on (I-1)', async () => {
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
        const { application_id } = await addCandidate({
          requisition_id: r1.requisition_id,
          name: 'Re-apply C',
          session: t.adminSession,
        });
        // Transfer r1→r2: r1 application becomes 'transferred'
        const { to_application_id } = await transferApplication({
          application_id,
          expected_version: 1,
          input: { target_requisition_id: r2.requisition_id },
          session: t.adminSession,
        });
        // Transfer r2→r1: candidate had a transferred app on r1, this must NOT 500
        const res2 = await transferApplication({
          application_id: to_application_id,
          expected_version: 1,
          input: { target_requisition_id: r1.requisition_id },
          session: t.adminSession,
        });
        const [newApp] = await hiringDb()
          .select()
          .from(application)
          .where(eq(application.id, res2.to_application_id));
        expect(newApp?.requisition_id).toBe(r1.requisition_id);
        expect(newApp?.status).toBe('active');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows re-applying a candidate to a requisition they have a rejected application on (I-1)', async () => {
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
        const { application_id: app1Id } = await addCandidate({
          requisition_id: r1.requisition_id,
          name: 'Rejected Re-apply',
          session: t.adminSession,
        });
        const reason = await createRejectionReason({
          input: { label: 'Did not proceed', category: 'rejected_by_us' },
          session: t.adminSession,
        });
        // Reject the r1 application
        await rejectApplication({
          application_id: app1Id,
          expected_version: 1,
          input: { reason: 'Not a fit', reason_id: reason.id, tags: [] },
          session: t.adminSession,
        });
        // Now add the same candidate to r2, then transfer back to r1 — must not collide
        const { application_id: app2Id } = await addCandidate({
          requisition_id: r2.requisition_id,
          name: 'Rejected Re-apply',
          session: t.adminSession,
        });
        const res = await transferApplication({
          application_id: app2Id,
          expected_version: 1,
          input: { target_requisition_id: r1.requisition_id },
          session: t.adminSession,
        });
        const [newApp] = await hiringDb()
          .select()
          .from(application)
          .where(eq(application.id, res.to_application_id));
        expect(newApp?.requisition_id).toBe(r1.requisition_id);
        expect(newApp?.status).toBe('active');
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

  // FUT-765: the target's status stays 'open' after its headcount is hired out, so the existing
  // status check passes — yet a transfer there strands the candidate (no opening left to hire
  // into). Reject when the target has no open openings.
  it('rejects transferring to a target whose headcount is already filled', async () => {
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
        const source = await addCandidate({
          requisition_id: r1.requisition_id,
          name: 'C',
          session: t.adminSession,
        });
        // Fill r2's only opening by hiring someone into it — r2 stays status 'open', 0 open openings.
        const filler = await addCandidate({
          requisition_id: r2.requisition_id,
          name: 'Filler',
          session: t.adminSession,
        });
        await hireApplication({ application_id: filler.application_id, session: t.adminSession });

        await expect(
          transferApplication({
            application_id: source.application_id,
            expected_version: 1,
            input: { target_requisition_id: r2.requisition_id },
            session: t.adminSession,
          }),
        ).rejects.toThrow(/filled|no.*opening|not open/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
