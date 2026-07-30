import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import {
  addCandidate,
  closeRequisition,
  createCloseReason,
  getCandidateStageCounts,
  hireApplication,
  listCandidates,
  listTalentPool,
  moveApplicationStage,
  openRequisition,
} from '../../src/index.ts';
import { countEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('cancelling a requisition closes its pipeline', () => {
  it('cancels active applications, keeps hired ones, and drops candidates into the talent pool', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Doomed role',
          kind: 'new',
          headcount: 2,
          session,
        });
        const a = await addCandidate({ requisition_id, name: 'Ann Active', session });
        const b = await addCandidate({ requisition_id, name: 'Bob Interviewing', session });
        const h = await addCandidate({ requisition_id, name: 'Hera Hired', session });
        await moveApplicationStage({
          application_id: b.application_id,
          expected_version: 1,
          to: 'interview',
          session,
        });
        await hireApplication({ application_id: h.application_id, expected_version: 1, session });

        const { id: reason_id } = await createCloseReason({
          input: { label: 'Budget cut' },
          session,
        });
        await closeRequisition({
          requisition_id,
          status: 'cancelled',
          close_reason_id: reason_id,
          session,
        });

        // Active applications are terminally closed; the hired one is history and stays hired.
        const { rows } = await pool.query(
          `SELECT id, status, closed_at FROM hiring.application WHERE requisition_id = $1`,
          [requisition_id],
        );
        const byId = new Map(rows.map((r) => [r.id, r]));
        expect(byId.get(a.application_id)?.status).toBe('cancelled');
        expect(byId.get(b.application_id)?.status).toBe('cancelled');
        expect(byId.get(a.application_id)?.closed_at).not.toBeNull();
        expect(byId.get(h.application_id)?.status).toBe('hired');
        expect(await countEvents(pool, t.tenant_id, 'hiring.application.cancelled')).toBe(2);

        // The candidate timeline explains why the application ended.
        const ev = await pool.query(
          `SELECT candidate_id FROM hiring.candidate_event WHERE kind = 'cancelled'`,
        );
        expect(new Set(ev.rows.map((r) => r.candidate_id))).toEqual(
          new Set([a.candidate_id, b.candidate_id]),
        );

        // Board list no longer shows them; the stat bar counts them as cancelled.
        const list = await listCandidates(session);
        const names = list.map((r) => r.name);
        expect(names).not.toContain('Ann Active');
        expect(names).not.toContain('Bob Interviewing');
        expect(names).toContain('Hera Hired');
        const counts = await getCandidateStageCounts(session);
        expect(counts.cancelled).toBe(2);

        // No further pipeline actions on a cancelled application.
        await expect(
          moveApplicationStage({
            application_id: a.application_id,
            expected_version: 2,
            to: 'screening',
            session,
          }),
        ).rejects.toThrow(/active/i);

        // They become re-matchable past candidates.
        const poolRows = await listTalentPool(session);
        const poolNames = poolRows.map((r) => r.name);
        expect(poolNames).toContain('Ann Active');
        expect(poolNames).toContain('Bob Interviewing');
        // FUT-772: the hired candidate is now an employee and must never surface in the
        // talent pool, even though cancelling the requisition freed the others into it.
        expect(poolNames).not.toContain('Hera Hired');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('filling a requisition also closes its remaining active applications', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Filled role',
          kind: 'new',
          headcount: 2,
          session,
        });
        const a = await addCandidate({ requisition_id, name: 'Ann Active', session });
        const h = await addCandidate({ requisition_id, name: 'Hera Hired', session });
        await hireApplication({ application_id: h.application_id, expected_version: 1, session });

        // Mark the whole requisition filled — a fill needs no close reason.
        await closeRequisition({ requisition_id, status: 'filled', session });

        const { rows } = await pool.query(
          `SELECT id, status FROM hiring.application WHERE requisition_id = $1`,
          [requisition_id],
        );
        const byId = new Map(rows.map((r) => [r.id, r]));
        // The still-active applicant is closed — no orphaned "active" candidate on a filled,
        // board-hidden role; the hired one stays hired.
        expect(byId.get(a.application_id)?.status).toBe('cancelled');
        expect(byId.get(h.application_id)?.status).toBe('hired');

        // Remaining open openings are closed (demand met), not cancelled.
        const openings = await pool.query(
          `SELECT status FROM hiring.opening WHERE requisition_id = $1`,
          [requisition_id],
        );
        expect(openings.rows.some((o) => o.status === 'open')).toBe(false);

        // The freed candidate drops off the active board, and the timeline says why (filled,
        // not cancelled).
        const names = (await listCandidates(session)).map((r) => r.name);
        expect(names).not.toContain('Ann Active');
        expect(names).toContain('Hera Hired');
        const ev = await pool.query(
          `SELECT summary FROM hiring.candidate_event WHERE kind = 'cancelled' AND candidate_id = $1`,
          [a.candidate_id],
        );
        expect(ev.rows[0]?.summary).toMatch(/position filled/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
