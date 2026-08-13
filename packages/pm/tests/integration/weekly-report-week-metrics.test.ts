import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  getWeeklyReportDetail,
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

const WEEK = { iso_year: 2026, iso_week: 29 };

async function liveProject(
  pool: Pool,
  session: import('@seta/core').SessionScope,
  tenantId: string,
): Promise<string> {
  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'Acme Corporation') RETURNING id`,
    [tenantId],
  );
  const { project_id: charterId } = await submitCharter({
    account_id: acc.rows[0].id,
    name: 'Acme Platform Rebuild',
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  return (await approveCharterTwoStage(charterId, session.tenant_id)).project_id;
}

async function seedNorm(pool: Pool, tenantId: string): Promise<string> {
  const normId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'TEST','v1')`,
    [normId, tenantId],
  );
  return normId;
}

interface MetricSpec {
  name: string;
  category: 'quality' | 'cost_capacity' | 'delivery' | 'process';
  sort_order: number;
  green: string;
  yellow: string;
  red: string;
}

async function seedMetric(
  pool: Pool,
  tenantId: string,
  normId: string,
  spec: MetricSpec,
): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm_metric
       (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
        component_1_label, component_2_label, sort_order, green_band, yellow_band, red_band)
     VALUES ($1,$2,$3,$4,'core',$5,'a / b',2,'a','b',$6,$7,$8,$9)`,
    [
      id,
      tenantId,
      normId,
      spec.category,
      spec.name,
      spec.sort_order,
      spec.green,
      spec.yellow,
      spec.red,
    ],
  );
  return id;
}

describe('weekly report detail — week metrics', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('lists every applied metric of the week, keeping unmeasured ones with no value', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const normId = await seedNorm(pool, t.tenant_id);

        const leakage = await seedMetric(pool, t.tenant_id, normId, {
          name: 'Defect Leakage',
          category: 'quality',
          sort_order: 1,
          green: '{"op":"lte","value":0.1}',
          yellow: '{"op":"between","min":0.1,"max":0.2}',
          red: '{"op":"gt","value":0.2}',
        });
        const predictability = await seedMetric(pool, t.tenant_id, normId, {
          name: 'Release Predictability',
          category: 'delivery',
          sort_order: 26,
          green: '{"op":"gte","value":0.85}',
          yellow: '{"op":"between","min":0.7,"max":0.84}',
          red: '{"op":"lt","value":0.7}',
        });
        const satisfaction = await seedMetric(pool, t.tenant_id, normId, {
          name: 'Customer Satisfaction',
          category: 'process',
          sort_order: 40,
          green: '{"op":"gte","value":0.8}',
          yellow: '{"op":"between","min":0.6,"max":0.79}',
          red: '{"op":"lt","value":0.6}',
        });
        for (const metric_id of [leakage, predictability]) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectId],
            session: t.adminSession,
          });
        }

        await upsertKpiRecord({
          project_id: projectId,
          ...WEEK,
          entries: [
            { metric_id: leakage, component_1_value: 30, component_2_value: 100 },
            { metric_id: predictability, component_1_value: 90, component_2_value: 100 },
          ],
          session: t.adminSession,
        });

        await setAppliedMetric({
          metric_id: satisfaction,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });

        const detail = await getWeeklyReportDetail({
          project_id: projectId,
          ...WEEK,
          session: t.adminSession,
        });

        expect(detail.metrics).toHaveLength(3);
        expect(detail.metrics.map((m) => m.name)).toEqual([
          'Defect Leakage',
          'Release Predictability',
          'Customer Satisfaction',
        ]);

        const off = detail.metrics[0];
        expect(off).toMatchObject({
          metric_id: leakage,
          category: 'quality',
          status: 'red',
          component_count: 2,
          green_band: { op: 'lte', value: 0.1 },
        });
        expect(off?.computed_value).toBeCloseTo(0.3, 4);

        expect(detail.metrics[1]).toMatchObject({
          name: 'Release Predictability',
          status: 'green',
        });

        const blank = detail.metrics[2];
        expect(blank).toMatchObject({
          name: 'Customer Satisfaction',
          category: 'process',
          computed_value: null,
          status: null,
        });
        expect(detail.stats.applied_count).toBe(3);
        expect(detail.stats.measured_count).toBe(2);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
