import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  addReportComment,
  getWeeklyReportDetail,
  listWeeklyReports,
  overrideFlag,
  setAppliedMetric,
  setWeeklyReportClock,
  submitCharter,
  upsertKpiRecord,
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

async function seedMetric(pool: Pool, tenantId: string): Promise<string> {
  const normId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'TEST','v1')`,
    [normId, tenantId],
  );
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm_metric
       (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
        component_1_label, green_band, yellow_band, red_band)
     VALUES ($1,$2,$3,'quality','core','Test Metric','x',1,'x',
             '{"op":"lte","value":100}','{"op":"between","min":100,"max":200}',
             '{"op":"gt","value":200}')`,
    [id, tenantId, normId],
  );
  return id;
}

function reporterSession(tenantId: string, userId: string, personId: string = userId) {
  return buildSession({
    tenant_id: tenantId,
    user_id: userId,
    roles: ['pm.manager'],
    worker_id: personId,
  });
}

describe('weekly reports domain', () => {
  // Reports lock to the current VNT week until Friday 17:00 — pin the clock to Wednesday
  // 10:00 VNT of 2026-W-29 so every test writes into an open week deterministically.
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('locks reports outside the current week and after Friday 5PM VNT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const session = reporterSession(t.tenant_id, t.admin_user_id);
        const base = {
          project_id: projectId,
          executive_summary: 'On time',
          road_to_green: 'n/a',
          road_to_green_due: '2026-12-31',
          session,
        };

        // Past and future weeks are never editable.
        await expect(
          upsertWeeklyReport({ ...base, iso_year: 2026, iso_week: 28 }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(
          upsertWeeklyReport({ ...base, iso_year: 2026, iso_week: 30 }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });

        // The current week closes at Friday 17:00 VNT (10:00 UTC): 16:59 works, 17:01 doesn't.
        setWeeklyReportClock(() => new Date('2026-07-17T09:59:00Z'));
        await upsertWeeklyReport({ ...base, iso_year: 2026, iso_week: 29 });
        setWeeklyReportClock(() => new Date('2026-07-17T10:01:00Z'));
        await expect(
          upsertWeeklyReport({ ...base, iso_year: 2026, iso_week: 29 }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(
          overrideFlag({
            project_id: projectId,
            iso_year: 2026,
            iso_week: 29,
            category: 'quality',
            final_colour: 'gray',
            reason: 'too late',
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

  it('requires Road-to-Green only for a declared risk, then saves with snapshots, flags and rollup', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const metricId = await seedMetric(pool, t.tenant_id);
        await setAppliedMetric({
          metric_id: metricId,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });
        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metricId, component_1_value: 50, component_2_value: null }],
          session: t.adminSession,
        });

        const session = reporterSession(t.tenant_id, t.admin_user_id);
        await expect(
          upsertWeeklyReport({
            project_id: projectId,
            iso_year: 2026,
            iso_week: 29,
            executive_summary: 'Shipped the thing',
            risk_issue: 'Vendor sandbox is down',
            session,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });

        const saved = await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'Shipped the thing',
          session,
        });
        expect(saved.overall_colour).toBe('green');

        const mv = await pool.query(
          `SELECT source_entry_id, colour FROM pm.metric_value WHERE report_id = $1`,
          [saved.report_id],
        );
        expect(mv.rowCount).toBe(1);
        expect(mv.rows[0].colour).toBe('green'); // 50 ≤ 100
        expect(mv.rows[0].source_entry_id).not.toBeNull();
        const ns = await pool.query(
          `SELECT metric_version, category FROM pm.norm_snapshot WHERE report_id = $1`,
          [saved.report_id],
        );
        expect(ns.rowCount).toBe(1);
        expect(ns.rows[0].category).toBe('quality');

        const flags = await pool.query(
          `SELECT category, computed_colour, final_colour FROM pm.flag
             WHERE tenant_id = $1 AND project_id = $2 AND iso_year = 2026 AND iso_week = 29
             ORDER BY category`,
          [t.tenant_id, projectId],
        );
        expect(flags.rowCount).toBe(4);
        const quality = flags.rows.find((r) => r.category === 'quality');
        expect(quality?.computed_colour).toBe('green');
        for (const other of flags.rows.filter((r) => r.category !== 'quality')) {
          expect(other.computed_colour).toBeNull();
          expect(other.final_colour).toBeNull();
        }
        const audits = await pool.query(
          `SELECT count(*)::int AS n FROM pm.flag_audit_entry WHERE tenant_id = $1`,
          [t.tenant_id],
        );
        expect(audits.rows[0].n).toBe(1);

        const rollup = await pool.query(
          `SELECT rag, quality_colour, delivery_colour FROM pm.project_week_rollup
             WHERE tenant_id = $1 AND project_id = $2 AND iso_year = 2026 AND iso_week = 29`,
          [t.tenant_id, projectId],
        );
        expect(rollup.rowCount).toBe(1);
        expect(rollup.rows[0].rag).toBe('green');
        expect(rollup.rows[0].quality_colour).toBe('green');
        expect(rollup.rows[0].delivery_colour).toBeNull();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a Green submit discards a Road-to-Green carried over from a non-Green revision', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const session = reporterSession(t.tenant_id, t.admin_user_id);
        // All four pillars declared Green (no measured KPI blocks the declaration) while the
        // input still carries a Road-to-Green — the composer prefills it from the previous
        // non-Green revision. A Green report has nothing to recover from, so it must not keep
        // the stale plan.
        const saved = await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'Back to green',
          road_to_green: 'Stale plan from last week',
          road_to_green_due: '2026-12-31',
          category_colours: {
            quality: 'green',
            cost_capacity: 'green',
            delivery: 'green',
            process: 'green',
          },
          session,
        });
        expect(saved.overall_colour).toBe('green');

        const row = await pool.query(
          `SELECT road_to_green, road_to_green_due FROM pm.report WHERE id = $1`,
          [saved.report_id],
        );
        expect(row.rows[0].road_to_green).toBeNull();
        expect(row.rows[0].road_to_green_due).toBeNull();
        const rev = await pool.query(
          `SELECT road_to_green, road_to_green_due FROM pm.report_revision WHERE report_id = $1`,
          [saved.report_id],
        );
        expect(rev.rows[0].road_to_green).toBeNull();
        expect(rev.rows[0].road_to_green_due).toBeNull();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('override writes an audit entry, sticks over computed, and shows up in detail/list', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const session = reporterSession(t.tenant_id, t.admin_user_id);
        await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'Nothing measured yet',
          road_to_green: 'Start measuring',
          road_to_green_due: '2026-12-31',
          session,
        });

        await overrideFlag({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          category: 'quality',
          final_colour: 'gray',
          reason: 'metrics not applicable during discovery',
          session,
        });

        const detail = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session,
        });
        const quality = detail.flags.find((f) => f.category === 'quality');
        expect(quality?.final_colour).toBe('gray');
        expect(quality?.overridden).toBe(true);
        for (const f of detail.flags.filter((f) => f.category !== 'quality')) {
          expect(f.final_colour).toBeNull();
        }
        expect(detail.overall_colour).toBe('gray');

        const { rows } = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 29,
          project_id: projectId,
          session,
        });
        expect(rows[0]?.category_colours.quality).toBe('gray');

        const audit = await pool.query(
          `SELECT from_colour, to_colour, reason, actor_user_id FROM pm.flag_audit_entry
             WHERE tenant_id = $1 AND to_colour = 'gray'`,
          [t.tenant_id],
        );
        expect(audit.rowCount).toBe(1);
        expect(audit.rows[0].from_colour).toBeNull();
        expect(audit.rows[0].reason).toBe('metrics not applicable during discovery');
        expect(audit.rows[0].actor_user_id).toBe(session.user_id);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects an all-Green declaration when any KPI is over norm', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const metricId = await seedMetric(pool, t.tenant_id);
        await setAppliedMetric({
          metric_id: metricId,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });
        // 250 lands in the red band (gt 200) — the week is over norm.
        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metricId, component_1_value: 250, component_2_value: null }],
          session: t.adminSession,
        });

        const session = reporterSession(t.tenant_id, t.admin_user_id);
        const allGreen = {
          quality: 'green',
          cost_capacity: 'green',
          delivery: 'green',
          process: 'green',
        } as const;
        await expect(
          upsertWeeklyReport({
            project_id: projectId,
            iso_year: 2026,
            iso_week: 29,
            executive_summary: 'Everything is fine',
            category_colours: allGreen,
            session,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });

        // Conceding one pillar (with the mandatory Road-to-Green) is accepted.
        const saved = await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'Quality slipped',
          road_to_green: 'Fix the failing metric',
          road_to_green_due: '2026-12-31',
          category_colours: { ...allGreen, quality: 'yellow' },
          session,
        });
        expect(saved.overall_colour).toBe('yellow');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reporter-declared QCDP colours override computed, drive overall and are audited', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const metricId = await seedMetric(pool, t.tenant_id);
        await setAppliedMetric({
          metric_id: metricId,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });
        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metricId, component_1_value: 50, component_2_value: null }],
          session: t.adminSession,
        });
        const session = reporterSession(t.tenant_id, t.admin_user_id);

        const saved = await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'Declared cautious',
          category_colours: {
            quality: 'yellow',
            cost_capacity: 'yellow',
            delivery: 'yellow',
            process: 'yellow',
          },
          session,
        });
        expect(saved.overall_colour).toBe('yellow');

        const detail = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session,
        });
        expect(detail.overall_colour).toBe('yellow');
        expect(detail.flags).toHaveLength(4);
        for (const f of detail.flags) {
          expect(f.final_colour).toBe('yellow');
          expect(f.computed_colour).toBe(f.category === 'quality' ? 'green' : null);
          expect(f.overridden).toBe(true);
        }

        const audit = await pool.query(
          `SELECT count(*)::int AS n FROM pm.flag_audit_entry
             WHERE tenant_id = $1 AND actor_user_id = $2 AND reason = 'Set in weekly report'`,
          [t.tenant_id, session.user_id],
        );
        expect(audit.rows[0].n).toBe(4);

        // Declaring back to the computed colour clears the override.
        await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'Back to computed',
          category_colours: { quality: 'green' },
          session,
        });
        const after = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session,
        });
        const quality = after.flags.find((f) => f.category === 'quality');
        expect(quality?.final_colour).toBe('green');
        expect(quality?.overridden).toBe(false);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('keeps the reported colour when the KPI moves after submit', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const metricId = await seedMetric(pool, t.tenant_id);
        await setAppliedMetric({
          metric_id: metricId,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });
        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metricId, component_1_value: 250, component_2_value: null }],
          session: t.adminSession,
        });
        const session = reporterSession(t.tenant_id, t.admin_user_id);
        const saved = await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'Quality is over norm',
          category_colours: { quality: 'red' },
          session,
        });
        expect(saved.overall_colour).toBe('red');

        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metricId, component_1_value: 50, component_2_value: null }],
          session: t.adminSession,
        });

        const detail = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session,
        });
        const quality = detail.flags.find((f) => f.category === 'quality');
        expect(quality?.final_colour).toBe('red');
        expect(quality?.overridden).toBe(false);
        expect(detail.overall_colour).toBe('red');
        expect(detail.trend[0]?.colour).toBe('red');

        const { rows } = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 29,
          project_id: projectId,
          session,
        });
        expect(rows[0]?.category_colours.quality).toBe('red');
        expect(rows[0]?.overall_colour).toBe('red');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('keeps reports per reporter and attaches comments', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmoPerson = crypto.randomUUID();
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id, pmoPerson);
        const pmSession = reporterSession(t.tenant_id, t.admin_user_id);
        // A commenter whose login name (display_name) differs from their person record —
        // the thread must show the person's full name, same as PM/PMO names everywhere else.
        const pmoSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          display_name: 'hung.vu',
          roles: ['pm.manager'],
          worker_id: pmoPerson,
        });
        await pool.query(
          `INSERT INTO pm.person_projection (person_id, tenant_id, full_name)
           VALUES ($1, $2, 'Vũ Thanh Hùng')`,
          [pmoSession.person_id, t.tenant_id],
        );

        const first = await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'PM view',
          road_to_green: 'Fix it',
          road_to_green_due: '2026-12-31',
          session: pmSession,
        });
        await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'PMO view',
          road_to_green: 'Escalate',
          road_to_green_due: '2026-12-31',
          session: pmoSession,
        });

        await addReportComment({
          report_id: first.report_id,
          body: 'Please add the OTA numbers',
          session: pmoSession,
        });
        // No person_projection row for this person → display_name is the only name we have.
        await addReportComment({
          report_id: first.report_id,
          body: 'Unlinked commenter',
          session: pmSession,
        });

        const detail = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session: pmSession,
        });
        expect(detail.reports).toHaveLength(2);
        expect(detail.my_reporter_id).toBe(pmSession.person_id);
        const mine = detail.reports.find((r) => r.reporter_id === pmSession.person_id);
        expect(mine?.executive_summary).toBe('PM view');
        expect(mine?.comments).toHaveLength(2);
        expect(mine?.comments[0]?.body).toBe('Please add the OTA numbers');
        expect(mine?.comments[0]?.author_name).toBe('Vũ Thanh Hùng');
        expect(mine?.comments[1]?.author_name).toBe('Test User');

        const { rows } = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 29,
          project_id: projectId,
          session: pmSession,
        });
        expect(rows[0]?.report_count).toBe(2);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('keeps the worst declaration across reporters, not the last one submitted', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmoPerson = crypto.randomUUID();
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id, pmoPerson);
        const pmSession = reporterSession(t.tenant_id, t.admin_user_id);
        const pmoSession = reporterSession(t.tenant_id, t.admin_user_id, pmoPerson);

        await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'PM sees a red quality week',
          category_colours: {
            quality: 'red',
            cost_capacity: 'green',
            delivery: 'green',
            process: 'green',
          },
          session: pmSession,
        });
        const pmoSaved = await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'PMO is more relaxed',
          category_colours: {
            quality: 'yellow',
            cost_capacity: 'green',
            delivery: 'green',
            process: 'green',
          },
          session: pmoSession,
        });
        expect(pmoSaved.overall_colour).toBe('yellow');

        const detail = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session: pmSession,
        });
        expect(detail.flags.find((f) => f.category === 'quality')?.final_colour).toBe('red');
        expect(detail.overall_colour).toBe('red');
        expect(
          detail.reports.find((r) => r.reporter_id === pmoSession.person_id)?.overall_colour,
        ).toBe('yellow');

        const { rows } = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 29,
          project_id: projectId,
          session: pmSession,
        });
        expect(rows[0]?.overall_colour).toBe('red');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('lifts the shared flag when the reporter who declared the worst colour revises it down', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmoPerson = crypto.randomUUID();
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id, pmoPerson);
        const pmSession = reporterSession(t.tenant_id, t.admin_user_id);
        const pmoSession = reporterSession(t.tenant_id, t.admin_user_id, pmoPerson);
        const base = {
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
        };

        await upsertWeeklyReport({
          ...base,
          executive_summary: 'PM red',
          category_colours: { quality: 'red' },
          session: pmSession,
        });
        await upsertWeeklyReport({
          ...base,
          executive_summary: 'PMO yellow',
          category_colours: { quality: 'yellow' },
          session: pmoSession,
        });
        await upsertWeeklyReport({
          ...base,
          executive_summary: 'PM recovered',
          category_colours: { quality: 'green' },
          session: pmSession,
        });

        const detail = await getWeeklyReportDetail({ ...base, session: pmSession });
        expect(detail.flags.find((f) => f.category === 'quality')?.final_colour).toBe('yellow');
        expect(detail.overall_colour).toBe('yellow');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
