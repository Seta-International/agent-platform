import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  listKpiExplorer,
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
  name: string,
): Promise<string> {
  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name) VALUES ($1,$2) RETURNING id`,
    [tenantId, name],
  );
  const { project_id: charterId } = await submitCharter({
    account_id: acc.rows[0].id,
    name,
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  return (await approveCharterTwoStage(charterId, session.tenant_id)).project_id;
}

async function accountOf(pool: Pool, projectId: string): Promise<string> {
  const r = await pool.query(`SELECT account_id FROM pm.project WHERE id = $1`, [projectId]);
  return r.rows[0].account_id as string;
}

async function seedTwoMetrics(pool: Pool, tenantId: string): Promise<[string, string]> {
  const normId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'TEST','v1')`,
    [normId, tenantId],
  );
  const ids: string[] = [];
  for (const [i, mName] of ['Metric One', 'Metric Two'].entries()) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO pm.kpi_norm_metric
         (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
          component_1_label, green_band, yellow_band, red_band, sort_order)
       VALUES ($1,$2,$3,'quality','core',$4,'x',1,'x',
               '{"op":"lte","value":100}','{"op":"between","min":100,"max":200}',
               '{"op":"gt","value":200}',$5)`,
      [id, tenantId, normId, mName, i],
    );
    ids.push(id);
  }
  return [ids[0] as string, ids[1] as string];
}

describe('KPI Explorer per-project applied metrics', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('gives each row only its own applied metrics; a metric another project applied is absent', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'Alpha');
        const projectB = await liveProject(pool, t.adminSession, t.tenant_id, 'Bravo');
        const [metric1, metric2] = await seedTwoMetrics(pool, t.tenant_id);

        await setAppliedMetric({
          metric_id: metric1,
          applied: true,
          project_ids: [projectA, projectB],
          session: t.adminSession,
        });
        await upsertKpiRecord({
          project_id: projectA,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metric1, component_1_value: 150, component_2_value: null }],
          session: t.adminSession,
        });

        await setAppliedMetric({
          metric_id: metric2,
          applied: true,
          project_ids: [projectA],
          session: t.adminSession,
        });

        const result = await listKpiExplorer({
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });

        expect(new Set(result.applied_metric_ids)).toEqual(new Set([metric1, metric2]));

        const rowA = result.rows.find((r) => r.project_id === projectA);
        const rowB = result.rows.find((r) => r.project_id === projectB);
        expect(rowA).toBeDefined();
        expect(rowB).toBeDefined();

        expect(rowA?.metrics[metric1]).toEqual({
          value: 150,
          status: 'yellow',
          band: { op: 'between', min: 100, max: 200 },
        });
        expect(rowA?.metrics[metric2]).toEqual({ value: null, status: null, band: null });

        expect(rowB?.metrics[metric1]).toEqual({ value: null, status: null, band: null });
        expect(rowB?.metrics).not.toHaveProperty(metric2 as string);
      } finally {
        await closePools();
      }
    });
  });

  it('keeps every project of every account named in account_ids', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'Alpha');
        const projectB = await liveProject(pool, t.adminSession, t.tenant_id, 'Bravo');
        const projectC = await liveProject(pool, t.adminSession, t.tenant_id, 'Charlie');
        const accountA = await accountOf(pool, projectA);
        const accountB = await accountOf(pool, projectB);

        const both = await listKpiExplorer({
          iso_year: 2026,
          iso_week: 29,
          account_ids: [accountA, accountB],
          session: t.adminSession,
        });
        expect(both.rows.map((r) => r.project_id).sort()).toEqual([projectA, projectB].sort());

        const one = await listKpiExplorer({
          iso_year: 2026,
          iso_week: 29,
          account_ids: [accountA],
          session: t.adminSession,
        });
        expect(one.rows.map((r) => r.project_id)).toEqual([projectA]);

        const none = await listKpiExplorer({
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });
        expect(none.rows.map((r) => r.project_id).sort()).toEqual(
          [projectA, projectB, projectC].sort(),
        );
      } finally {
        await closePools();
      }
    });
  });

  it('carries on each cell the band its colour was decided by, not the green target', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'Alpha');
        const [metric1, metric2] = await seedTwoMetrics(pool, t.tenant_id);
        for (const metric_id of [metric1, metric2]) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectA],
            session: t.adminSession,
          });
        }

        await upsertKpiRecord({
          project_id: projectA,
          iso_year: 2026,
          iso_week: 29,
          entries: [
            { metric_id: metric1, component_1_value: 150, component_2_value: null },
            { metric_id: metric2, component_1_value: 300, component_2_value: null },
          ],
          session: t.adminSession,
        });

        const row = (
          await listKpiExplorer({ iso_year: 2026, iso_week: 29, session: t.adminSession })
        ).rows.find((r) => r.project_id === projectA);

        expect(row?.metrics[metric1]).toEqual({
          value: 150,
          status: 'yellow',
          band: { op: 'between', min: 100, max: 200 },
        });
        expect(row?.metrics[metric2]).toEqual({
          value: 300,
          status: 'red',
          band: { op: 'gt', value: 200 },
        });
      } finally {
        await closePools();
      }
    });
  });

  it("returns the week's frozen bands, so a later catalog edit cannot contradict a stored colour", async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'Alpha');
        const [metric1] = await seedTwoMetrics(pool, t.tenant_id);
        await setAppliedMetric({
          metric_id: metric1,
          applied: true,
          project_ids: [projectA],
          session: t.adminSession,
        });

        await upsertKpiRecord({
          project_id: projectA,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metric1, component_1_value: 80, component_2_value: null }],
          session: t.adminSession,
        });

        await pool.query(
          `UPDATE pm.kpi_norm_metric
              SET green_band = '{"op":"lte","value":50}',
                  yellow_band = '{"op":"between","min":50,"max":200}',
                  version = version + 1
            WHERE id = $1`,
          [metric1],
        );

        const result = await listKpiExplorer({
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });
        const row = result.rows.find((r) => r.project_id === projectA);

        expect(row?.metrics[metric1]).toEqual({
          value: 80,
          status: 'green',
          band: { op: 'lte', value: 100 },
        });
        expect(result.metrics.find((m) => m.metric_id === metric1)?.green_band).toEqual({
          op: 'lte',
          value: 100,
        });
      } finally {
        await closePools();
      }
    });
  });
});
