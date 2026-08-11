import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  addReportComment,
  discardWeeklyReport,
  ensureWeeklyReport,
  getWeeklyReportDetail,
  listWeeklyReports,
  setWeeklyReportClock,
  submitCharter,
  upsertWeeklyReport,
} from '../../src/index.ts';
import { approveCharterTwoStage, buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function liveProject(
  pool: Pool,
  session: import('@seta/core').SessionScope,
  tenantId: string,
  pmoPersonId?: string,
): Promise<string> {
  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
    [tenantId],
  );
  const { project_id: charterId } = await submitCharter({
    account_id: acc.rows[0].id,
    name: 'P',
    pm_worker_id: session.user_id,
    pmo_worker_id: pmoPersonId,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  return (await approveCharterTwoStage(charterId, session.tenant_id)).project_id;
}

function reporterSession(tenantId: string, userId: string, personId: string = userId) {
  return buildSession({
    tenant_id: tenantId,
    user_id: userId,
    roles: ['pm.manager'],
    worker_id: personId,
  });
}

describe('weekly report draft lifecycle (FUT-591 + FUT-601)', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z'))); // W-29 Wed
  afterAll(() => setWeeklyReportClock());

  it('ensure-draft on entry: idempotent, private to its reporter, invisible to the roll-up (FUT-591 AC1/AC2)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const session = reporterSession(t.tenant_id, t.admin_user_id);

        const first = await ensureWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session,
        });
        const second = await ensureWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session,
        });
        expect(first.status).toBe('draft');
        expect(second.report_id).toBe(first.report_id); // idempotent — no duplicate

        // The draft is the reporter's own: they see it in detail, others don't, and the
        // list counts only submitted reports.
        const mine = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session,
        });
        expect(mine.reports.map((r) => r.status)).toEqual(['draft']);

        const other = reporterSession(t.tenant_id, t.admin_user_id, crypto.randomUUID());
        const theirs = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session: other,
        });
        expect(theirs.reports).toHaveLength(0);

        const { rows } = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 29,
          project_id: projectId,
          session,
        });
        expect(rows[0]?.report_count).toBe(0);

        // Closed week: nothing can be ensured (FUT-591 AC3 / FUT-601 AC2).
        await expect(
          ensureWeeklyReport({ project_id: projectId, iso_year: 2026, iso_week: 28, session }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });

        // A never-published draft has nothing shared to discuss — comments are refused.
        await expect(
          addReportComment({ report_id: first.report_id, body: 'too early', session: other }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('drafting keeps the last submitted version visible; the first comment freezes the report and discards WIP', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmoPerson = crypto.randomUUID();
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id, pmoPerson);
        const pm = reporterSession(t.tenant_id, t.admin_user_id);
        const pmo = reporterSession(t.tenant_id, t.admin_user_id, pmoPerson);

        // v1 published.
        const v1 = await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'PM view v1',
          road_to_green: 'Fix quality',
          road_to_green_due: '2026-12-31',
          category_colours: { quality: 'yellow' },
          session: pm,
        });

        // PM drafts on top (gate skipped: empty summary, no RtG) — nothing withdrawn.
        await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          save_mode: 'draft',
          executive_summary: 'WIP not for others',
          session: pm,
        });

        // Owner sees the WIP; everyone else keeps reading v1, colours untouched.
        const mine = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session: pm,
        });
        const myEntry = mine.reports.find((r) => r.reporter_id === pm.person_id);
        expect(myEntry?.status).toBe('draft');
        expect(myEntry?.published).toBe(true);
        expect(myEntry?.executive_summary).toBe('WIP not for others');

        const theirs = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session: pmo,
        });
        const theirEntry = theirs.reports.find((r) => r.reporter_id === pm.person_id);
        expect(theirEntry?.status).toBe('submitted');
        expect(theirEntry?.executive_summary).toBe('PM view v1');
        expect(theirs.flags.find((f) => f.category === 'quality')?.final_colour).toBe('yellow');

        const { rows } = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 29,
          project_id: projectId,
          session: pmo,
        });
        expect(rows[0]?.report_count).toBe(1); // published revision still counts
        expect(rows[0]?.latest_summary).toBe('PM view v1');

        // First comment freezes the report: the WIP draft is discarded (row restored to
        // the published revision) and every further edit is refused.
        await addReportComment({
          report_id: v1.report_id,
          body: 'Discussed in steering',
          session: pmo,
        });
        const afterComment = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session: pm,
        });
        const restored = afterComment.reports.find((r) => r.reporter_id === pm.person_id);
        expect(restored?.status).toBe('submitted');
        expect(restored?.executive_summary).toBe('PM view v1'); // WIP gone

        await expect(
          upsertWeeklyReport({
            project_id: projectId,
            iso_year: 2026,
            iso_week: 29,
            executive_summary: 'try to change the discussed version',
            road_to_green: 'x',
            road_to_green_due: '2026-12-31',
            session: pm,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(
          upsertWeeklyReport({
            project_id: projectId,
            iso_year: 2026,
            iso_week: 29,
            save_mode: 'draft',
            executive_summary: 'draft around the lock',
            session: pm,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('discard removes the reporter’s abandoned empty draft, but never content or a submitted report (FUT-740)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const session = reporterSession(t.tenant_id, t.admin_user_id);
        const week = { iso_year: 2026, iso_week: 29 } as const;

        // Draft-on-entry reports whether it actually created the empty draft (vs. reopened one).
        const first = await ensureWeeklyReport({ project_id: projectId, ...week, session });
        expect(first.created).toBe(true);
        const again = await ensureWeeklyReport({ project_id: projectId, ...week, session });
        expect(again.created).toBe(false);

        // Abandon: the pristine draft is discarded and the week returns to "no report yet".
        const gone = await discardWeeklyReport({ project_id: projectId, ...week, session });
        expect(gone.discarded).toBe(true);
        const afterDiscard = await getWeeklyReportDetail({
          project_id: projectId,
          ...week,
          session,
        });
        expect(afterDiscard.reports).toHaveLength(0);

        // Discard is idempotent and a no-op once there's nothing to remove.
        const noop = await discardWeeklyReport({ project_id: projectId, ...week, session });
        expect(noop.discarded).toBe(false);

        // A draft the reporter actually wrote is protected by its content — never discarded.
        await upsertWeeklyReport({
          project_id: projectId,
          ...week,
          save_mode: 'draft',
          executive_summary: 'real WIP',
          session,
        });
        const keptDraft = await discardWeeklyReport({ project_id: projectId, ...week, session });
        expect(keptDraft.discarded).toBe(false);
        const stillDraft = await getWeeklyReportDetail({ project_id: projectId, ...week, session });
        expect(stillDraft.reports.map((r) => r.status)).toEqual(['draft']);

        // A submitted report is never discardable.
        await upsertWeeklyReport({
          project_id: projectId,
          ...week,
          executive_summary: 'final',
          category_colours: {
            quality: 'green',
            cost_capacity: 'green',
            delivery: 'green',
            process: 'green',
          },
          session,
        });
        const keptSubmitted = await discardWeeklyReport({
          project_id: projectId,
          ...week,
          session,
        });
        expect(keptSubmitted.discarded).toBe(false);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
