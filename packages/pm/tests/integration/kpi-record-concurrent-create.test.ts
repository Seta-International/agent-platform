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
     VALUES ($1,$2,$3,'quality','extended','Metric A','x',1,'x',
             '{"op":"lte","value":100}','{"op":"between","min":101,"max":200}',
             '{"op":"gt","value":200}')`,
    [id, tenantId, normId],
  );
  return id;
}

describe('upsertKpiRecord — concurrent first save', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('rejects a save that expected no record when another reporter created one first', async () => {
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

        const first = await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metricId, component_1_value: 3, component_2_value: null }],
          session: t.adminSession,
        });

        await expect(
          upsertKpiRecord({
            project_id: projectId,
            iso_year: 2026,
            iso_week: 29,
            expected_version: null,
            entries: [{ metric_id: metricId, component_1_value: 9, component_2_value: null }],
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });

        const entries = await pool.query(
          `SELECT component_1_value FROM pm.kpi_record_entry
             WHERE tenant_id = $1 AND record_id = $2`,
          [t.tenant_id, first.record_id],
        );
        expect(Number(entries.rows[0].component_1_value)).toBe(3);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('creates the record when no other reporter got there first', async () => {
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

        const created = await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          expected_version: null,
          entries: [{ metric_id: metricId, component_1_value: 5, component_2_value: null }],
          session: t.adminSession,
        });

        expect(created.version).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
