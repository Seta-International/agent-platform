import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  listWeeklyReports,
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

describe('weekly report card — worst metric', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('names the metric furthest outside its band, not the first red in catalogue order', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const normId = await seedNorm(pool, t.tenant_id);

        // Quality sorts first in the catalogue; Delivery sorts far later. The Delivery metric is
        // the one badly off band, so catalogue order and severity disagree.
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
        for (const metric_id of [leakage, predictability]) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectId],
            session: t.adminSession,
          });
        }

        // Leakage 15% misses a ≤10% band by half a band-width (yellow).
        // Predictability 20% misses a ≥85% band by 76% of the band (red).
        await upsertKpiRecord({
          project_id: projectId,
          ...WEEK,
          entries: [
            { metric_id: leakage, component_1_value: 15, component_2_value: 100 },
            { metric_id: predictability, component_1_value: 20, component_2_value: 100 },
          ],
          session: t.adminSession,
        });

        const { rows } = await listWeeklyReports({ ...WEEK, session: t.adminSession });
        const card = rows.find((r) => r.project_id === projectId);
        expect(card?.stats.worst?.name).toBe('Release Predictability');
        expect(card?.stats.worst?.status).toBe('red');
        expect(card?.stats.worst?.computed_value).toBeCloseTo(0.2, 4);
        expect(card?.stats.worst?.green_band).toEqual({ op: 'gte', value: 0.85 });
        expect(card?.stats.red_count).toBe(1);
        expect(card?.stats.yellow_count).toBe(1);
        expect(card?.stats.measured_count).toBe(2);
        expect(card?.stats.applied_count).toBe(2);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('leaves worst null when every measured metric is on norm', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const normId = await seedNorm(pool, t.tenant_id);
        const metricId = await seedMetric(pool, t.tenant_id, normId, {
          name: 'Release Predictability',
          category: 'delivery',
          sort_order: 26,
          green: '{"op":"gte","value":0.85}',
          yellow: '{"op":"between","min":0.7,"max":0.84}',
          red: '{"op":"lt","value":0.7}',
        });
        await setAppliedMetric({
          metric_id: metricId,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });
        await upsertKpiRecord({
          project_id: projectId,
          ...WEEK,
          entries: [{ metric_id: metricId, component_1_value: 98, component_2_value: 100 }],
          session: t.adminSession,
        });

        const { rows } = await listWeeklyReports({ ...WEEK, session: t.adminSession });
        const card = rows.find((r) => r.project_id === projectId);
        expect(card?.stats.worst).toBeNull();
        expect(card?.stats.measured_count).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('falls back to the worst yellow when no metric is red', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id);
        const normId = await seedNorm(pool, t.tenant_id);
        const near = await seedMetric(pool, t.tenant_id, normId, {
          name: 'Defect Leakage',
          category: 'quality',
          sort_order: 1,
          green: '{"op":"lte","value":0.15}',
          yellow: '{"op":"between","min":0.15,"max":0.35}',
          red: '{"op":"gt","value":0.35}',
        });
        const far = await seedMetric(pool, t.tenant_id, normId, {
          name: 'Release Predictability',
          category: 'delivery',
          sort_order: 26,
          green: '{"op":"gte","value":0.85}',
          yellow: '{"op":"between","min":0.4,"max":0.84}',
          red: '{"op":"lt","value":0.4}',
        });
        for (const metric_id of [near, far]) {
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
            { metric_id: near, component_1_value: 18, component_2_value: 100 },
            { metric_id: far, component_1_value: 50, component_2_value: 100 },
          ],
          session: t.adminSession,
        });

        const { rows } = await listWeeklyReports({ ...WEEK, session: t.adminSession });
        const card = rows.find((r) => r.project_id === projectId);
        expect(card?.stats.red_count).toBe(0);
        expect(card?.stats.yellow_count).toBe(2);
        expect(card?.stats.worst?.name).toBe('Release Predictability');
        expect(card?.stats.worst?.status).toBe('yellow');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
