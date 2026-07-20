import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

// Inserts an account + project and returns the project id, so report/flag FKs resolve.
async function seedProject(pool: Pool, tenantId: string): Promise<string> {
  const accountId = crypto.randomUUID();
  await pool.query(`INSERT INTO pm.account (id, tenant_id, name) VALUES ($1,$2,'Acct')`, [
    accountId,
    tenantId,
  ]);
  const projectId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.project (id, tenant_id, account_id, name) VALUES ($1,$2,$3,'Proj')`,
    [projectId, tenantId, accountId],
  );
  return projectId;
}

// metric_value/norm_snapshot both FK to kpi_norm_metric — seed a real catalog metric.
async function seedMetric(pool: Pool, tenantId: string): Promise<string> {
  const normId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'TEST','v1')`,
    [normId, tenantId],
  );
  const metricId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm_metric
       (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
        component_1_label, green_band, yellow_band, red_band)
     VALUES ($1,$2,$3,'quality','core','Test Metric','x',1,'x','{}','{}','{}')`,
    [metricId, tenantId, normId],
  );
  return metricId;
}

async function seedReport(pool: Pool, tenantId: string, projectId: string): Promise<string> {
  const reportId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.report (id, tenant_id, project_id, iso_year, iso_week, reporter_id)
     VALUES ($1,$2,$3,2026,28,$4)`,
    [reportId, tenantId, projectId, crypto.randomUUID()],
  );
  return reportId;
}

describe('pm weekly-report schema', () => {
  it('rejects a duplicate report identity (project, week, reporter)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reporterId = crypto.randomUUID();
        const ins = `INSERT INTO pm.report (tenant_id, project_id, iso_year, iso_week, reporter_id)
                     VALUES ($1,$2,2026,28,$3)`;
        await pool.query(ins, [t.tenant_id, projectId, reporterId]);
        await expect(pool.query(ins, [t.tenant_id, projectId, reporterId])).rejects.toThrow();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a duplicate metric value (report, metric)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = await seedReport(pool, t.tenant_id, projectId);
        const metricId = await seedMetric(pool, t.tenant_id);
        const ins = `INSERT INTO pm.metric_value (tenant_id, report_id, metric_id, computed_value)
                     VALUES ($1,$2,$3, 1.5)`;
        await pool.query(ins, [t.tenant_id, reportId, metricId]);
        await expect(pool.query(ins, [t.tenant_id, reportId, metricId])).rejects.toThrow();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a stale version-token write (optimistic concurrency)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = await seedReport(pool, t.tenant_id, projectId);
        // Bump version to 2.
        await pool.query(
          `UPDATE pm.report SET version = version + 1 WHERE id = $1 AND version = 1`,
          [reportId],
        );
        // A writer holding the stale version 1 updates 0 rows.
        const stale = await pool.query(
          `UPDATE pm.report SET status = 'submitted', version = version + 1
           WHERE id = $1 AND version = 1`,
          [reportId],
        );
        expect(stale.rowCount).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('caps flags at one per category per (project, week) — four total', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = await seedReport(pool, t.tenant_id, projectId);
        const ins = `INSERT INTO pm.flag
                       (tenant_id, project_id, iso_year, iso_week, report_id, category, computed_colour, final_colour)
                     VALUES ($1,$2,2026,28,$3,$4,'green','green')`;
        for (const cat of ['quality', 'cost_capacity', 'delivery', 'process']) {
          await pool.query(ins, [t.tenant_id, projectId, reportId, cat]);
        }
        // A second 'quality' flag on the same (project, week) is rejected, even from a
        // different report — the flag is shared across reporters, not per-report.
        const secondReportId = await seedReport(pool, t.tenant_id, projectId);
        await expect(
          pool.query(ins, [t.tenant_id, projectId, secondReportId, 'quality']),
        ).rejects.toThrow();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('nulls out flag.report_id (not cascade) when its report is deleted', async () => {
    // flag is keyed by (project, week, category), shared across every reporter's report for
    // that week — deleting one report must not delete the shared flag or its audit trail.
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = await seedReport(pool, t.tenant_id, projectId);
        const flagId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.flag
             (id, tenant_id, project_id, iso_year, iso_week, report_id, category, computed_colour, final_colour)
           VALUES ($1,$2,$3,2026,28,$4,'quality','red','red')`,
          [flagId, t.tenant_id, projectId, reportId],
        );
        await pool.query(
          `INSERT INTO pm.flag_audit_entry (tenant_id, flag_id, to_colour) VALUES ($1,$2,'red')`,
          [t.tenant_id, flagId],
        );
        await pool.query(`DELETE FROM pm.report WHERE id = $1`, [reportId]);
        const flagRow = await pool.query(`SELECT report_id FROM pm.flag WHERE id = $1`, [flagId]);
        expect(flagRow.rowCount).toBe(1);
        expect(flagRow.rows[0].report_id).toBeNull();
        const remaining = await pool.query(`SELECT 1 FROM pm.flag_audit_entry WHERE flag_id = $1`, [
          flagId,
        ]);
        expect(remaining.rowCount).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('nulls out metric_value.source_entry_id when the kpi_record_entry it snapshotted is deleted', async () => {
    // upsertKpiRecord (FUT-581) deletes+recreates every kpi_record_entry row on each save; a
    // metric_value that references one must not block that delete.
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = await seedReport(pool, t.tenant_id, projectId);
        const metricId = await seedMetric(pool, t.tenant_id);
        const recordId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.kpi_record (id, tenant_id, project_id, iso_year, iso_week, created_by)
           VALUES ($1,$2,$3,2026,28,$4)`,
          [recordId, t.tenant_id, projectId, crypto.randomUUID()],
        );
        const entryId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.kpi_record_entry (id, tenant_id, record_id, metric_id, computed_value)
           VALUES ($1,$2,$3,$4, 4.2)`,
          [entryId, t.tenant_id, recordId, metricId],
        );
        await pool.query(
          `INSERT INTO pm.metric_value (tenant_id, report_id, metric_id, source_entry_id, computed_value)
           VALUES ($1,$2,$3,$4, 4.2)`,
          [t.tenant_id, reportId, metricId, entryId],
        );

        // Same delete+recreate upsertKpiRecord does on every Manual KPI Input save.
        await pool.query(`DELETE FROM pm.kpi_record_entry WHERE record_id = $1`, [recordId]);

        const mv = await pool.query(
          `SELECT source_entry_id FROM pm.metric_value WHERE tenant_id = $1 AND report_id = $2 AND metric_id = $3`,
          [t.tenant_id, reportId, metricId],
        );
        expect(mv.rowCount).toBe(1);
        expect(mv.rows[0].source_entry_id).toBeNull();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
