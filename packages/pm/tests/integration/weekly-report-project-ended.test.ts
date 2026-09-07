import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
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
): Promise<string> {
  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
    [tenantId],
  );
  const { project_id: charterId } = await submitCharter({
    account_id: acc.rows[0].id,
    name: 'P',
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  return (await approveCharterTwoStage(charterId, session.tenant_id)).project_id;
}

function reporterSession(tenantId: string, userId: string) {
  return buildSession({
    tenant_id: tenantId,
    user_id: userId,
    roles: ['pm.manager'],
    worker_id: userId,
  });
}

describe('weekly report creation vs. project End Date (FUT-984 AC2)', () => {
  // Week 29 of 2026 runs Mon 2026-07-13 .. Sun 2026-07-19; pin the clock to Wednesday.
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('rejects ensureWeeklyReport when the project ended before this reporting week started', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        await pool.query('UPDATE pm.project SET date_to = $1 WHERE id = $2', [
          '2026-07-06',
          projectId,
        ]);
        const session = reporterSession(t.tenant_id, t.admin_user_id);

        await expect(
          ensureWeeklyReport({ project_id: projectId, iso_year: 2026, iso_week: 29, session }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows ensureWeeklyReport for the week the project ends in, even mid-week', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        await pool.query('UPDATE pm.project SET date_to = $1 WHERE id = $2', [
          '2026-07-15',
          projectId,
        ]);
        const session = reporterSession(t.tenant_id, t.admin_user_id);

        const result = await ensureWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session,
        });
        expect(result.created).toBe(true);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects upsertWeeklyReport (draft save) when the project ended before this reporting week started', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        await pool.query('UPDATE pm.project SET date_to = $1 WHERE id = $2', [
          '2026-07-06',
          projectId,
        ]);
        const session = reporterSession(t.tenant_id, t.admin_user_id);

        await expect(
          upsertWeeklyReport({
            project_id: projectId,
            iso_year: 2026,
            iso_week: 29,
            executive_summary: 'On time',
            save_mode: 'draft',
            session,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('flags the card as ended, with its End Date, once the project ended before the week', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        await pool.query('UPDATE pm.project SET date_to = $1 WHERE id = $2', [
          '2026-07-06',
          projectId,
        ]);

        const { rows } = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });
        const card = rows.find((r) => r.project_id === projectId);
        expect(card?.project_date_to).toBe('2026-07-06');
        expect(card?.project_ended).toBe(true);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not flag the card as ended for the week the project ends in', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        await pool.query('UPDATE pm.project SET date_to = $1 WHERE id = $2', [
          '2026-07-15',
          projectId,
        ]);

        const { rows } = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });
        const card = rows.find((r) => r.project_id === projectId);
        expect(card?.project_ended).toBe(false);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('flags getWeeklyReportDetail as ended, with the End Date, once the project ended before the week', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        await pool.query('UPDATE pm.project SET date_to = $1 WHERE id = $2', [
          '2026-07-06',
          projectId,
        ]);

        const detail = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });
        expect(detail.project_date_to).toBe('2026-07-06');
        expect(detail.project_ended).toBe(true);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
