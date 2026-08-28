import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import {
  addCandidate,
  cancelInterview,
  completeInterview,
  holdRequisition,
  listInterviews,
  markInterviewNoShow,
  moveApplicationStage,
  openRequisition,
  rejectApplication,
  rescheduleInterview,
  scheduleInterview,
} from '../../src/index.ts';
import { countEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const PANEL = [{ user_id: crypto.randomUUID(), display_name: 'Panelist One' }];
const SOON = new Date(Date.now() + 86_400_000).toISOString();

describe('interview lifecycle (FUT-487)', () => {
  it('AC1: schedules with status Scheduled and result Pending, and appears in the control table', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Engineer',
          kind: 'new',
          headcount: 1,
          session,
        });
        const { application_id, candidate_id } = await addCandidate({
          requisition_id,
          name: 'Cara Candidate',
          session,
        });

        const r = await scheduleInterview({
          application_id,
          scheduled_at: SOON,
          duration_minutes: 60,
          mode: 'online',
          meeting_link: 'https://meet.seta.io/abc',
          note: 'Focus on system design',
          panel: PANEL,
          session,
        });
        expect(r.interview_id).toBeTruthy();
        expect(r.version).toBe(1);

        const { rows } = await pool.query(
          `SELECT status, result, candidate_id, application_id FROM hiring.interview WHERE id = $1`,
          [r.interview_id],
        );
        expect(rows[0].status).toBe('scheduled');
        expect(rows[0].result).toBeNull();
        expect(rows[0].candidate_id).toBe(candidate_id);
        expect(rows[0].application_id).toBe(application_id);

        const panel = await pool.query(
          `SELECT user_id, display_name FROM hiring.interview_panelist WHERE interview_id = $1`,
          [r.interview_id],
        );
        expect(panel.rows).toHaveLength(1);
        expect(panel.rows[0].display_name).toBe('Panelist One');

        const list = await listInterviews(session);
        expect(list).toHaveLength(1);
        expect(list[0]?.id).toBe(r.interview_id);
        expect(list[0]?.candidate_name).toBe('Cara Candidate');
        expect(list[0]?.requisition_title).toBe('Engineer');
        expect(list[0]?.panel).toEqual([
          { user_id: PANEL[0]?.user_id, display_name: 'Panelist One' },
        ]);

        expect(await countEvents(pool, t.tenant_id, 'hiring.interview.scheduled')).toBe(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('AC3: every state change writes a timestamped, actor-named audit entry', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Engineer',
          kind: 'new',
          headcount: 1,
          session,
        });
        const { application_id, candidate_id } = await addCandidate({
          requisition_id,
          name: 'Cara Candidate',
          session,
        });
        const { interview_id } = await scheduleInterview({
          application_id,
          scheduled_at: SOON,
          duration_minutes: 30,
          mode: 'onsite',
          panel: [],
          session,
        });

        await completeInterview({
          interview_id,
          expected_version: 1,
          input: { result: 'pass', feedback_note: 'Strong' },
          session,
        });

        const events = await pool.query(
          `SELECT kind, actor_user_id, created_at FROM hiring.candidate_event
           WHERE candidate_id = $1 AND kind IN ('interview_scheduled', 'interview_completed')
           ORDER BY created_at ASC`,
          [candidate_id],
        );
        expect(events.rows.map((r) => r.kind)).toEqual([
          'interview_scheduled',
          'interview_completed',
        ]);
        for (const row of events.rows) {
          expect(row.actor_user_id).toBe(t.admin_user_id);
          expect(row.created_at).not.toBeNull();
        }
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('AC2: completed retains result/feedback, and is editable afterward', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Engineer',
          kind: 'new',
          headcount: 1,
          session,
        });
        const { application_id } = await addCandidate({ requisition_id, name: 'Cara', session });
        const { interview_id } = await scheduleInterview({
          application_id,
          scheduled_at: SOON,
          duration_minutes: 45,
          mode: 'online',
          panel: [],
          session,
        });

        const first = await completeInterview({
          interview_id,
          expected_version: 1,
          input: { result: 'hold' },
          session,
        });
        expect(first.version).toBe(2);

        const { rows: after1 } = await pool.query(
          `SELECT status, result FROM hiring.interview WHERE id = $1`,
          [interview_id],
        );
        expect(after1[0]).toMatchObject({ status: 'completed', result: 'hold' });

        // Editing an already-completed outcome is allowed (the panel corrected their feedback).
        const second = await completeInterview({
          interview_id,
          expected_version: 2,
          input: { result: 'pass', feedback_note: 'Great' },
          session,
        });
        expect(second.version).toBe(3);
        const { rows: after2 } = await pool.query(
          `SELECT status, result, feedback_note FROM hiring.interview WHERE id = $1`,
          [interview_id],
        );
        expect(after2[0]).toMatchObject({
          status: 'completed',
          result: 'pass',
          feedback_note: 'Great',
        });
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('an interview carries no round, rating, or recommendation', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const { rows } = await pool.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'hiring' AND table_name = 'interview'
             AND column_name IN ('round', 'rating', 'recommendation')`,
        );
        expect(rows).toEqual([]);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('AC2: cancel and no-show retain the outcome reason and block further mutation', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Engineer',
          kind: 'new',
          headcount: 2,
          session,
        });
        const cancelled = await addCandidate({ requisition_id, name: 'Cara Cancel', session });
        const noShow = await addCandidate({ requisition_id, name: 'Nora NoShow', session });

        const int1 = await scheduleInterview({
          application_id: cancelled.application_id,
          scheduled_at: SOON,
          duration_minutes: 30,
          mode: 'online',
          panel: [],
          session,
        });
        const cancelRes = await cancelInterview({
          interview_id: int1.interview_id,
          expected_version: 1,
          input: { outcome_reason: 'Candidate withdrew' },
          session,
        });
        expect(cancelRes.version).toBe(2);
        const { rows: cRows } = await pool.query(
          `SELECT status, outcome_reason FROM hiring.interview WHERE id = $1`,
          [int1.interview_id],
        );
        expect(cRows[0]).toMatchObject({
          status: 'cancelled',
          outcome_reason: 'Candidate withdrew',
        });
        await expect(
          completeInterview({
            interview_id: int1.interview_id,
            expected_version: 2,
            input: { result: 'pass' },
            session,
          }),
        ).rejects.toThrow(/cancelled/i);

        const int2 = await scheduleInterview({
          application_id: noShow.application_id,
          scheduled_at: SOON,
          duration_minutes: 30,
          mode: 'online',
          panel: [],
          session,
        });
        const noShowRes = await markInterviewNoShow({
          interview_id: int2.interview_id,
          expected_version: 1,
          input: { outcome_reason: 'No response on the call' },
          session,
        });
        expect(noShowRes.version).toBe(2);
        const { rows: nRows } = await pool.query(
          `SELECT status, outcome_reason FROM hiring.interview WHERE id = $1`,
          [int2.interview_id],
        );
        expect(nRows[0]).toMatchObject({
          status: 'no_show',
          outcome_reason: 'No response on the call',
        });
        await expect(
          cancelInterview({
            interview_id: int2.interview_id,
            expected_version: 2,
            input: {},
            session,
          }),
        ).rejects.toThrow(/no_show/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reschedules a still-scheduled interview and replaces its panel wholesale', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Engineer',
          kind: 'new',
          headcount: 1,
          session,
        });
        const { application_id } = await addCandidate({ requisition_id, name: 'Cara', session });
        const { interview_id } = await scheduleInterview({
          application_id,
          scheduled_at: SOON,
          duration_minutes: 30,
          mode: 'online',
          panel: PANEL,
          session,
        });

        const laterIso = new Date(Date.now() + 2 * 86_400_000).toISOString();
        const newPanelist = { user_id: crypto.randomUUID(), display_name: 'Panelist Two' };
        const r = await rescheduleInterview({
          interview_id,
          expected_version: 1,
          input: {
            scheduled_at: laterIso,
            duration_minutes: 90,
            mode: 'onsite',
            panel: [newPanelist],
          },
          session,
        });
        expect(r.version).toBe(2);

        const { rows } = await pool.query(
          `SELECT duration_minutes, mode FROM hiring.interview WHERE id = $1`,
          [interview_id],
        );
        expect(rows[0]).toMatchObject({ duration_minutes: 90, mode: 'onsite' });

        const panel = await pool.query(
          `SELECT display_name FROM hiring.interview_panelist WHERE interview_id = $1`,
          [interview_id],
        );
        expect(panel.rows.map((p) => p.display_name)).toEqual(['Panelist Two']);

        expect(await countEvents(pool, t.tenant_id, 'hiring.interview.rescheduled')).toBe(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('blocks scheduling/rescheduling against an on-hold requisition, but not outcome recording', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Held role',
          kind: 'new',
          headcount: 1,
          session,
        });
        const { application_id } = await addCandidate({ requisition_id, name: 'Paula', session });
        const { interview_id } = await scheduleInterview({
          application_id,
          scheduled_at: SOON,
          duration_minutes: 30,
          mode: 'online',
          panel: [],
          session,
        });

        await holdRequisition({ requisition_id, session });

        await expect(
          scheduleInterview({
            application_id,
            scheduled_at: SOON,
            duration_minutes: 30,
            mode: 'online',
            panel: [],
            session,
          }),
        ).rejects.toThrow(/on hold/i);

        await expect(
          rescheduleInterview({
            interview_id,
            expected_version: 1,
            input: {
              scheduled_at: SOON,
              duration_minutes: 30,
              mode: 'online',
              panel: [],
            },
            session,
          }),
        ).rejects.toThrow(/on hold/i);

        // Closing out an already-scheduled interview is not blocked by the hold (FUT-773 parity).
        const r = await completeInterview({
          interview_id,
          expected_version: 1,
          input: { result: 'pass' },
          session,
        });
        expect(r.version).toBe(2);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('refuses to schedule against a non-active application', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Engineer',
          kind: 'new',
          headcount: 1,
          session,
        });
        const { application_id } = await addCandidate({ requisition_id, name: 'Cara', session });
        await rejectApplication({
          application_id,
          expected_version: 1,
          input: { reason: 'Not a fit', tags: [] },
          session,
        });

        await expect(
          scheduleInterview({
            application_id,
            scheduled_at: SOON,
            duration_minutes: 30,
            mode: 'online',
            panel: [],
            session,
          }),
        ).rejects.toThrow(/active/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('version-gates outcome mutations and reports a conflict on a stale write', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Engineer',
          kind: 'new',
          headcount: 1,
          session,
        });
        const { application_id } = await addCandidate({ requisition_id, name: 'Cara', session });
        const { interview_id } = await scheduleInterview({
          application_id,
          scheduled_at: SOON,
          duration_minutes: 30,
          mode: 'online',
          panel: [],
          session,
        });

        await expect(
          completeInterview({
            interview_id,
            expected_version: 99,
            input: { result: 'pass' },
            session,
          }),
        ).rejects.toThrow(/version/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('scoping: an unrelated pipeline move does not affect the interview scope query', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Engineer',
          kind: 'new',
          headcount: 1,
          session,
        });
        const { application_id } = await addCandidate({ requisition_id, name: 'Cara', session });
        await moveApplicationStage({
          application_id,
          expected_version: 1,
          to: 'interview',
          session,
        });
        const r = await scheduleInterview({
          application_id,
          scheduled_at: SOON,
          duration_minutes: 30,
          mode: 'online',
          panel: [],
          session,
        });
        const list = await listInterviews(session);
        expect(list.map((i) => i.id)).toContain(r.interview_id);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
