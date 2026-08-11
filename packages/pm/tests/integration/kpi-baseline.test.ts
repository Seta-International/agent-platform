import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  getKpiRecord,
  getWeeklyReportDetail,
  listWeeklyReports,
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

/** green ≤100 · yellow 100–200 · red >200 — value 150 sits in yellow under v1. */
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
     VALUES ($1,$2,$3,'quality','core','Baseline Metric','x',1,'x',
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

describe('NORM week baseline & submit snapshot (FUT-593)', () => {
  // Wednesday 10:00 VNT of 2026-W-29 — the open week for the first half of each test.
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('freezes definitions at first touch; a mid-week catalog change only reaches the next week (AC1+AC2)', async () => {
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

        // First touch of W-29 copies the live definition by value into the baseline.
        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metricId, component_1_value: 150, component_2_value: null }],
          session: t.adminSession,
        });
        const baseline = await pool.query(
          `SELECT green_band FROM pm.kpi_norm_baseline
             WHERE tenant_id = $1 AND project_id = $2 AND iso_year = 2026 AND iso_week = 29`,
          [t.tenant_id, projectId],
        );
        expect(baseline.rowCount).toBe(1);
        expect(baseline.rows[0].green_band).toEqual({ op: 'lte', value: 100 });

        // Mid-week catalog publish: green widens to ≤180 (version bump, per the FUT-610
        // immutability rule). 150 would be GREEN under v2 — but not this week.
        await pool.query(
          `UPDATE pm.kpi_norm_metric
             SET green_band = '{"op":"lte","value":180}', version = version + 1 WHERE id = $1`,
          [metricId],
        );

        const w29 = await getKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });
        expect(w29.metrics[0]?.green_band).toEqual({ op: 'lte', value: 100 });
        expect(w29.metrics[0]?.status).toBe('yellow'); // 150 against the frozen v1 bands

        // Next week starts fresh from the changed catalog: 150 is green under v2.
        setWeeklyReportClock(() => new Date('2026-07-22T03:00:00Z')); // W-30 Wednesday
        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 30,
          entries: [{ metric_id: metricId, component_1_value: 150, component_2_value: null }],
          session: t.adminSession,
        });
        const w30 = await getKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 30,
          session: t.adminSession,
        });
        expect(w30.metrics[0]?.green_band).toEqual({ op: 'lte', value: 180 });
        expect(w30.metrics[0]?.status).toBe('green');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('submit stamps the snapshot from the baseline; a reopened closed week reproduces its colours (AC3+AC4)', async () => {
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
          entries: [{ metric_id: metricId, component_1_value: 150, component_2_value: null }],
          session: t.adminSession,
        });

        const session = reporterSession(t.tenant_id, t.admin_user_id);
        const saved = await upsertWeeklyReport({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          executive_summary: 'Quality slipped to yellow',
          road_to_green: 'Tighten the quality gate',
          road_to_green_due: '2026-12-31',
          session,
        });

        // AC3: the per-metric snapshot carries the BASELINE bands (v1), not the live catalog.
        const snap = await pool.query(
          `SELECT green_band, metric_version FROM pm.norm_snapshot WHERE report_id = $1`,
          [saved.report_id],
        );
        expect(snap.rowCount).toBe(1);
        expect(snap.rows[0].green_band).toEqual({ op: 'lte', value: 100 });

        // Catalog moves on (green ≤300 — 150 would be green live)…
        await pool.query(
          `UPDATE pm.kpi_norm_metric
             SET green_band = '{"op":"lte","value":300}', version = version + 1 WHERE id = $1`,
          [metricId],
        );
        // …and the week closes.
        setWeeklyReportClock(() => new Date('2026-07-22T03:00:00Z')); // W-30

        // AC4: reopening W-29 reproduces the stamped colours — quality is still yellow.
        const detail = await getWeeklyReportDetail({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session,
        });
        const quality = detail.flags.find((f) => f.category === 'quality');
        expect(quality?.computed_colour).toBe('yellow');
        expect(quality?.final_colour).toBe('yellow');

        const { rows } = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 29,
          project_id: projectId,
          session,
        });
        expect(rows[0]?.category_colours.quality).toBe('yellow');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
