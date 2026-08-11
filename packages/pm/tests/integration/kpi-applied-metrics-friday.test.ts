import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  listAppliedMetrics,
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

const WEDNESDAY = new Date('2026-07-15T03:00:00Z');
const SATURDAY = new Date('2026-07-18T03:00:00Z');
const WEEK_29 = { iso_year: 2026, iso_week: 29 };

async function liveProject(
  pool: Pool,
  session: import('@seta/core').SessionScope,
  tenantId: string,
): Promise<string> {
  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'Acme') RETURNING id`,
    [tenantId],
  );
  const { project_id: charterId } = await submitCharter({
    account_id: acc.rows[0].id,
    name: 'A',
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  return (await approveCharterTwoStage(charterId, session.tenant_id)).project_id;
}

async function seedTwoQualityMetrics(pool: Pool, tenantId: string): Promise<[string, string]> {
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

describe('the current week after its Friday 17:00 deadline', () => {
  beforeEach(() => setWeeklyReportClock(() => WEDNESDAY));
  afterAll(() => setWeeklyReportClock());

  it('does not move when a metric is un-applied past the deadline', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const projectId = await liveProject(pool, session, t.tenant_id);
        const [metricOne, metricTwo] = await seedTwoQualityMetrics(pool, t.tenant_id);
        for (const metric_id of [metricOne, metricTwo]) {
          await setAppliedMetric({ metric_id, applied: true, project_ids: [projectId], session });
        }
        await upsertKpiRecord({
          project_id: projectId,
          ...WEEK_29,
          entries: [
            { metric_id: metricOne, component_1_value: 500, component_2_value: null },
            { metric_id: metricTwo, component_1_value: 50, component_2_value: null },
          ],
          session,
        });

        setWeeklyReportClock(() => SATURDAY);
        await setAppliedMetric({
          metric_id: metricOne,
          applied: false,
          project_ids: [projectId],
          session,
        });

        const after = await listKpiExplorer({ ...WEEK_29, session });
        expect(
          after.rows[0]?.category_health.quality,
          'entry closed on Friday, so the week is frozen like any past week',
        ).toBe('red');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reports no figures at stake once the deadline has passed', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const projectId = await liveProject(pool, session, t.tenant_id);
        const [metricOne] = await seedTwoQualityMetrics(pool, t.tenant_id);
        await setAppliedMetric({
          metric_id: metricOne,
          applied: true,
          project_ids: [projectId],
          session,
        });
        await upsertKpiRecord({
          project_id: projectId,
          ...WEEK_29,
          entries: [{ metric_id: metricOne, component_1_value: 500, component_2_value: null }],
          session,
        });

        setWeeklyReportClock(() => SATURDAY);
        const coverage = await listAppliedMetrics(session, [projectId], WEEK_29);
        expect(
          coverage.find((c) => c.metric_id === metricOne)?.entered_count,
          'the dialog warns "that colour can drop" from this count — but the week is frozen, so it cannot',
        ).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
