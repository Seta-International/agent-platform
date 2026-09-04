import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  setAppliedMetric,
  setWeeklyReportClock,
  submitCharter,
  upsertKpiRecord,
} from '../../src/index.ts';
import { approveCharterTwoStage, seedTenant } from '../helpers.ts';

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

// seedTenant doesn't seed the KPI Norm catalog (that's the core.tenant.created subscriber, not
// run in domain-level tests) — insert 2 extended-tier metrics directly.
async function seedTwoMetrics(pool: Pool, tenantId: string): Promise<[string, string]> {
  const normId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'TEST','v1')`,
    [normId, tenantId],
  );
  const insertMetric = async (name: string): Promise<string> => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO pm.kpi_norm_metric
         (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
          component_1_label, green_band, yellow_band, red_band)
       VALUES ($1,$2,$3,'quality','extended',$4,'x',1,'x',
               '{"op":"lte","value":100}','{"op":"between","min":100,"max":200}',
               '{"op":"gt","value":200}')`,
      [id, tenantId, normId, name],
    );
    return id;
  };
  return [await insertMetric('Metric A'), await insertMetric('Metric B')];
}

describe('upsertKpiRecord and unapplied metrics', () => {
  // KPI records share the Epic 3 week gate (current week only, Friday 17:00 VNT) — pin the
  // clock to Wednesday of 2026-W-29 so the tests write into an open week deterministically.
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('clears the open week entry when its metric is unapplied, so re-applying starts blank', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const [metricA, metricB] = await seedTwoMetrics(pool, t.tenant_id);

        await setAppliedMetric({
          metric_id: metricA,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });
        await setAppliedMetric({
          metric_id: metricB,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });

        // Both metrics measured in the same weekly record.
        const first = await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [
            { metric_id: metricA, component_1_value: 3, component_2_value: null },
            { metric_id: metricB, component_1_value: 9, component_2_value: null },
          ],
          session: t.adminSession,
        });

        // Metric B is later unapplied from the project (Configure Metrics). Turning it off
        // drops the figure it was carrying this week — turning it back on is a fresh start,
        // not a resurrection of the old number.
        await setAppliedMetric({
          metric_id: metricB,
          applied: false,
          project_ids: [projectId],
          session: t.adminSession,
        });

        const afterUnapply = await pool.query(
          `SELECT metric_id FROM pm.kpi_record_entry WHERE tenant_id = $1 AND record_id = $2`,
          [t.tenant_id, first.record_id],
        );
        expect(afterUnapply.rows.map((r) => r.metric_id)).toEqual([metricA]);

        // User edits only metric A (metric B no longer appears in the form) and saves again.
        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          expected_version: first.version,
          entries: [{ metric_id: metricA, component_1_value: 4, component_2_value: null }],
          session: t.adminSession,
        });

        await setAppliedMetric({
          metric_id: metricB,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });

        const entries = await pool.query(
          `SELECT metric_id, component_1_value FROM pm.kpi_record_entry
             WHERE tenant_id = $1 AND record_id = $2 ORDER BY metric_id`,
          [t.tenant_id, first.record_id],
        );
        const byMetric = new Map(
          entries.rows.map((r) => [r.metric_id, Number(r.component_1_value)]),
        );
        expect(byMetric.get(metricA)).toBe(4); // updated
        expect(byMetric.has(metricB)).toBe(false); // cleared by the unapply, stays blank
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('leaves a closed week untouched when a metric is unapplied', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const [metricA, metricB] = await seedTwoMetrics(pool, t.tenant_id);

        for (const metric_id of [metricA, metricB]) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectId],
            session: t.adminSession,
          });
        }

        const closedRecordId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.kpi_record (id, tenant_id, project_id, iso_year, iso_week, created_by)
           VALUES ($1,$2,$3,2026,28,$4)`,
          [closedRecordId, t.tenant_id, projectId, t.adminSession.user_id],
        );
        await pool.query(
          `INSERT INTO pm.kpi_record_entry
             (tenant_id, record_id, metric_id, component_1_value, computed_value, status, source)
           VALUES ($1,$2,$3,7,7,'green','manual')`,
          [t.tenant_id, closedRecordId, metricB],
        );

        const open = await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [
            { metric_id: metricA, component_1_value: 3, component_2_value: null },
            { metric_id: metricB, component_1_value: 9, component_2_value: null },
          ],
          session: t.adminSession,
        });

        await setAppliedMetric({
          metric_id: metricB,
          applied: false,
          project_ids: [projectId],
          session: t.adminSession,
        });

        const closed = await pool.query(
          `SELECT component_1_value FROM pm.kpi_record_entry
             WHERE tenant_id = $1 AND record_id = $2 AND metric_id = $3`,
          [t.tenant_id, closedRecordId, metricB],
        );
        expect(Number(closed.rows[0]?.component_1_value)).toBe(7);

        const openRows = await pool.query(
          `SELECT metric_id FROM pm.kpi_record_entry WHERE tenant_id = $1 AND record_id = $2`,
          [t.tenant_id, open.record_id],
        );
        expect(openRows.rows.map((r) => r.metric_id)).toEqual([metricA]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('keeps an entry row id stable when its metric is resubmitted unchanged', async () => {
    // A metric_value snapshot's source_entry_id must not be gratuitously nulled out just
    // because a *different* metric in the same record was edited and saved.
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const [metricA, metricC] = await seedTwoMetrics(pool, t.tenant_id);

        for (const metricId of [metricA, metricC]) {
          await setAppliedMetric({
            metric_id: metricId,
            applied: true,
            project_ids: [projectId],
            session: t.adminSession,
          });
        }

        const first = await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [
            { metric_id: metricA, component_1_value: 3, component_2_value: null },
            { metric_id: metricC, component_1_value: 50, component_2_value: null },
          ],
          session: t.adminSession,
        });
        const before = await pool.query(
          `SELECT id FROM pm.kpi_record_entry WHERE tenant_id = $1 AND record_id = $2 AND metric_id = $3`,
          [t.tenant_id, first.record_id, metricC],
        );

        // The form resubmits every applied metric on every save — metric C's value is unchanged.
        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          expected_version: first.version,
          entries: [
            { metric_id: metricA, component_1_value: 4, component_2_value: null },
            { metric_id: metricC, component_1_value: 50, component_2_value: null },
          ],
          session: t.adminSession,
        });
        const after = await pool.query(
          `SELECT id FROM pm.kpi_record_entry WHERE tenant_id = $1 AND record_id = $2 AND metric_id = $3`,
          [t.tenant_id, first.record_id, metricC],
        );

        expect(after.rows[0].id).toBe(before.rows[0].id);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('drops the stored figure of a still-applied metric the reporter blanked out', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const [metricA, metricB] = await seedTwoMetrics(pool, t.tenant_id);

        for (const metricId of [metricA, metricB]) {
          await setAppliedMetric({
            metric_id: metricId,
            applied: true,
            project_ids: [projectId],
            session: t.adminSession,
          });
        }

        const first = await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [
            { metric_id: metricA, component_1_value: 3, component_2_value: null },
            { metric_id: metricB, component_1_value: 9, component_2_value: null },
          ],
          session: t.adminSession,
        });

        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          expected_version: first.version,
          entries: [
            { metric_id: metricA, component_1_value: 3, component_2_value: null },
            { metric_id: metricB, component_1_value: null, component_2_value: null },
          ],
          session: t.adminSession,
        });

        const remaining = await pool.query(
          `SELECT metric_id FROM pm.kpi_record_entry WHERE tenant_id = $1 AND record_id = $2`,
          [t.tenant_id, first.record_id],
        );
        expect(remaining.rows.map((r) => r.metric_id)).toEqual([metricA]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects KPI input outside the open week (Epic 3 week gate)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const [metricA] = await seedTwoMetrics(pool, t.tenant_id);
        await setAppliedMetric({
          metric_id: metricA,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });
        const base = {
          project_id: projectId,
          iso_year: 2026,
          entries: [{ metric_id: metricA, component_1_value: 1, component_2_value: null }],
          session: t.adminSession,
        };
        // Past and future weeks are refused; after Friday 17:00 VNT the current week is too.
        await expect(upsertKpiRecord({ ...base, iso_week: 28 })).rejects.toMatchObject({
          code: 'VALIDATION',
        });
        await expect(upsertKpiRecord({ ...base, iso_week: 30 })).rejects.toMatchObject({
          code: 'VALIDATION',
        });
        setWeeklyReportClock(() => new Date('2026-07-17T10:01:00Z')); // Fri 17:01 VNT
        await expect(upsertKpiRecord({ ...base, iso_week: 29 })).rejects.toMatchObject({
          code: 'VALIDATION',
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
