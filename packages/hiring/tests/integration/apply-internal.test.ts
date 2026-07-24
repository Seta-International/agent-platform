import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { application, candidate, candidateEvent } from '../../src/backend/db/schema.ts';
import {
  applyInternalRequisition,
  getRequisition,
  holdRequisition,
  openRequisition,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('applyInternalRequisition (FUT-650)', () => {
  it('creates candidate with source "Internal application" and internal application row', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'Senior Engineer',
          kind: 'new',
          session: t.adminSession,
        });

        const res = await applyInternalRequisition({
          requisition_id,
          session: t.adminSession,
          note: 'Interested in internal transfer',
        });

        expect(res.candidate_id).toBeDefined();
        expect(res.application_id).toBeDefined();

        // Check Candidate
        const [candRow] = await hiringDb()
          .select()
          .from(candidate)
          .where(eq(candidate.id, res.candidate_id));
        expect(candRow).toBeDefined();
        expect(candRow!.source).toBe('Internal application');
        expect((candRow!.contact as { personal_email?: string }).personal_email).toBe(
          t.adminSession.email,
        );

        // Check Application
        const [appRow] = await hiringDb()
          .select()
          .from(application)
          .where(eq(application.id, res.application_id));
        expect(appRow).toBeDefined();
        expect(appRow!.requisition_id).toBe(requisition_id);
        expect(appRow!.kind).toBe('internal');
        expect(appRow!.candidate_id).toBe(res.candidate_id);
        expect(appRow!.status).toBe('active');
        expect(appRow!.stage).toBe('new');
        expect(appRow!.note).toBe('Interested in internal transfer');

        // Check candidate_event log
        const events = await hiringDb()
          .select()
          .from(candidateEvent)
          .where(eq(candidateEvent.candidate_id, res.candidate_id));
        expect(events.length).toBeGreaterThan(0);
        expect(events[0]!.kind).toBe('created');

        // Check getRequisition returns has_applied = true
        const reqDetail = await getRequisition({
          requisition_id,
          session: t.adminSession,
        });
        expect(reqDetail.has_applied).toBe(true);
        expect(reqDetail.user_application_id).toBe(res.application_id);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reuses existing candidate if email matches and rejects duplicate active application', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id: req1 } = await openRequisition({
          title: 'Role 1',
          kind: 'new',
          session: t.adminSession,
        });
        const { requisition_id: req2 } = await openRequisition({
          title: 'Role 2',
          kind: 'new',
          session: t.adminSession,
        });

        // 1st apply -> creates candidate
        const res1 = await applyInternalRequisition({
          requisition_id: req1,
          session: t.adminSession,
        });

        // Duplicate apply on same requisition -> throws CONFLICT
        await expect(
          applyInternalRequisition({
            requisition_id: req1,
            session: t.adminSession,
          }),
        ).rejects.toThrow(/already applied/i);

        // Apply on another requisition -> reuses candidate profile
        const res2 = await applyInternalRequisition({
          requisition_id: req2,
          session: t.adminSession,
        });
        expect(res2.candidate_id).toBe(res1.candidate_id);
        expect(res2.application_id).not.toBe(res1.application_id);

        // Verify total candidates for this email is still 1
        const cands = await hiringDb()
          .select()
          .from(candidate)
          .where(eq(candidate.tenant_id, t.tenant_id));
        expect(cands).toHaveLength(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects applying on on_hold requisition', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'Role Hold',
          kind: 'new',
          session: t.adminSession,
        });

        await holdRequisition({ requisition_id, session: t.adminSession });

        await expect(
          applyInternalRequisition({
            requisition_id,
            session: t.adminSession,
          }),
        ).rejects.toThrow(/on_hold|on hold/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
