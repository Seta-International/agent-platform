import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  getKpiRecord,
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

async function seedFourMetrics(pool: Pool, tenantId: string): Promise<string[]> {
  const normId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'TEST','v1')`,
    [normId, tenantId],
  );
  const spec = [
    ['quality', 'Quality One'],
    ['quality', 'Quality Two'],
    ['delivery', 'Delivery One'],
    ['delivery', 'Delivery Two'],
  ] as const;
  const ids: string[] = [];
  for (const [i, [category, name]] of spec.entries()) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO pm.kpi_norm_metric
         (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
          component_1_label, green_band, yellow_band, red_band, sort_order)
       VALUES ($1,$2,$3,$4,'core',$5,'x',1,'x',
               '{"op":"lte","value":100}','{"op":"between","min":100,"max":200}',
               '{"op":"gt","value":200}',$6)`,
      [id, tenantId, normId, category, name, i],
    );
    ids.push(id);
  }
  return ids;
}

describe('weekly health ignores metrics that were never assessed', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('is Green when the assessed metrics are Green and the rest are left blank', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const metrics = await seedFourMetrics(pool, t.tenant_id);
        for (const metric_id of metrics) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectId],
            session: t.adminSession,
          });
        }

        await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [
            { metric_id: metrics[0] as string, component_1_value: 50, component_2_value: null },
            { metric_id: metrics[2] as string, component_1_value: 50, component_2_value: null },
          ],
          session: t.adminSession,
        });

        const { rows } = await listKpiExplorer({
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });
        const row = rows.find((r) => r.project_id === projectId);
        expect(row?.overall_health).toBe('green');
        expect(row?.category_health).toEqual({
          quality: 'green',
          delivery: 'green',
          cost_capacity: null,
          process: null,
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('still turns Red as soon as an assessed metric is off norm', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const metrics = await seedFourMetrics(pool, t.tenant_id);
        for (const metric_id of metrics) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectId],
            session: t.adminSession,
          });
        }

        const saved = await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [
            { metric_id: metrics[0] as string, component_1_value: 50, component_2_value: null },
            { metric_id: metrics[2] as string, component_1_value: 250, component_2_value: null },
          ],
          session: t.adminSession,
        });
        expect(saved.overall_health).toBe('red');

        const detail = await getKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });
        expect(detail.category_health.quality).toBe('green');
        expect(detail.category_health.delivery).toBe('red');
        expect(detail.category_health.process).toBeNull();
        expect(detail.overall_health).toBe('red');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('has no health at all for a week where nothing was assessed', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const metrics = await seedFourMetrics(pool, t.tenant_id);
        for (const metric_id of metrics) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectId],
            session: t.adminSession,
          });
        }

        const detail = await getKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });
        expect(detail.record_id).toBeNull();
        expect(detail.overall_health).toBeNull();

        const { rows } = await listKpiExplorer({
          iso_year: 2026,
          iso_week: 29,
          session: t.adminSession,
        });
        expect(rows.find((r) => r.project_id === projectId)?.overall_health).toBeNull();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
