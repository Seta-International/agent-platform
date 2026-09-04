import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  getKpiRecord,
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

async function seedNorm(pool: Pool, tenantId: string): Promise<string> {
  const normId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'TEST','v1')`,
    [normId, tenantId],
  );
  return normId;
}

async function seedMetric(
  pool: Pool,
  tenantId: string,
  normId: string,
  spec: { category: string; name: string; sort_order: number },
): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm_metric
       (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
        component_1_label, component_2_label, component_1_integer, component_2_integer,
        component_1_min, component_1_max, is_share,
        green_band, yellow_band, red_band, sort_order)
     VALUES ($1,$2,$3,$4,'core',$5,'x',1,'Count',NULL,false,false,0,NULL,false,
             '{"op":"lte","value":100}','{"op":"between","min":100,"max":200}',
             '{"op":"gt","value":200}',$6)`,
    [id, tenantId, normId, spec.category, spec.name, spec.sort_order],
  );
  return id;
}

interface Fixture {
  session: import('@seta/core').SessionScope;
  project_id: string;
  quality_a: string;
  quality_b: string;
  delivery: string;
}

async function withProject(body: (f: Fixture) => Promise<void>): Promise<void> {
  await withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPmDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      const project_id = await liveProject(pool, t.adminSession, t.tenant_id, 'Alpha');
      const normId = await seedNorm(pool, t.tenant_id);
      const quality_a = await seedMetric(pool, t.tenant_id, normId, {
        category: 'quality',
        name: 'Defect Leakage',
        sort_order: 0,
      });
      const quality_b = await seedMetric(pool, t.tenant_id, normId, {
        category: 'quality',
        name: 'Reopened Defect Rate',
        sort_order: 1,
      });
      const delivery = await seedMetric(pool, t.tenant_id, normId, {
        category: 'delivery',
        name: 'On-time Delivery',
        sort_order: 2,
      });
      await body({ session: t.adminSession, project_id, quality_a, quality_b, delivery });
    } finally {
      await closePools();
    }
  });
}

async function apply(f: Fixture, metric_ids: string[]): Promise<void> {
  for (const metric_id of metric_ids) {
    await setAppliedMetric({
      metric_id,
      applied: true,
      project_ids: [f.project_id],
      session: f.session,
    });
  }
}

describe('a metric left blank is saved as unassessed, not refused', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('saves the figures that were filled and leaves the blank metric unassessed', async () => {
    await withProject(async (f) => {
      await apply(f, [f.quality_a, f.quality_b]);
      const saved = await upsertKpiRecord({
        project_id: f.project_id,
        ...WEEK,
        entries: [
          { metric_id: f.quality_a, component_1_value: 50, component_2_value: null },
          { metric_id: f.quality_b, component_1_value: null, component_2_value: null },
        ],
        session: f.session,
      });
      expect(saved.overall_health).toBe('green');

      const detail = await getKpiRecord({ project_id: f.project_id, ...WEEK, session: f.session });
      const blank = detail.metrics.find((m) => m.metric_id === f.quality_b);
      expect(blank?.component_1_value).toBeNull();
      expect(blank?.status).toBeNull();
      expect(detail.category_health.quality).toBe('gray');
    });
  });

  it('saves a record with a whole pillar left blank', async () => {
    await withProject(async (f) => {
      await apply(f, [f.quality_a, f.delivery]);
      await upsertKpiRecord({
        project_id: f.project_id,
        ...WEEK,
        entries: [{ metric_id: f.quality_a, component_1_value: 50, component_2_value: null }],
        session: f.session,
      });

      const detail = await getKpiRecord({ project_id: f.project_id, ...WEEK, session: f.session });
      expect(detail.category_health.quality).toBe('green');
      expect(detail.category_health.delivery).toBe('gray');
    });
  });

  it('saves a record on which nothing at all was filled in', async () => {
    await withProject(async (f) => {
      await apply(f, [f.quality_a, f.quality_b, f.delivery]);
      const saved = await upsertKpiRecord({
        project_id: f.project_id,
        ...WEEK,
        entries: [
          { metric_id: f.quality_a, component_1_value: null, component_2_value: null },
          { metric_id: f.quality_b, component_1_value: null, component_2_value: null },
          { metric_id: f.delivery, component_1_value: null, component_2_value: null },
        ],
        session: f.session,
      });
      expect(saved.overall_health).toBeNull();

      const detail = await getKpiRecord({ project_id: f.project_id, ...WEEK, session: f.session });
      expect(detail.record_id).toBe(saved.record_id);
      expect(detail.metrics.every((m) => m.status === null)).toBe(true);
      expect(detail.overall_health).toBe('gray');
    });
  });

  it('lets the save through once every applied metric carries a figure', async () => {
    await withProject(async (f) => {
      await apply(f, [f.quality_a, f.quality_b, f.delivery]);
      const saved = await upsertKpiRecord({
        project_id: f.project_id,
        ...WEEK,
        entries: [
          { metric_id: f.quality_a, component_1_value: 50, component_2_value: null },
          { metric_id: f.quality_b, component_1_value: 150, component_2_value: null },
          { metric_id: f.delivery, component_1_value: 250, component_2_value: null },
        ],
        session: f.session,
      });
      expect(saved.overall_health).toBe('red');
    });
  });

  it('does not hold a pillar with no applied metric against the reporter', async () => {
    await withProject(async (f) => {
      await apply(f, [f.quality_a]);
      const saved = await upsertKpiRecord({
        project_id: f.project_id,
        ...WEEK,
        entries: [{ metric_id: f.quality_a, component_1_value: 50, component_2_value: null }],
        session: f.session,
      });
      expect(saved.overall_health).toBe('green');
    });
  });

  it('refuses a record for a project with nothing applied at all', async () => {
    await withProject(async (f) => {
      await expect(
        upsertKpiRecord({
          project_id: f.project_id,
          ...WEEK,
          entries: [],
          session: f.session,
        }),
      ).rejects.toThrow(/No KPI metric is applied/);
    });
  });

  it('reads a pillar back as Grey while one of its metrics has no figures', async () => {
    await withProject(async (f) => {
      await apply(f, [f.quality_a, f.quality_b, f.delivery]);
      const detail = await getKpiRecord({
        project_id: f.project_id,
        ...WEEK,
        session: f.session,
      });
      expect(detail.category_health.quality).toBe('gray');
      expect(detail.category_health.delivery).toBe('gray');
      expect(detail.category_health.cost_capacity).toBeNull();
      expect(detail.overall_health).toBe('gray');
    });
  });

  it('reads every pillar back on its own colour once the record is complete', async () => {
    await withProject(async (f) => {
      await apply(f, [f.quality_a, f.quality_b, f.delivery]);
      await upsertKpiRecord({
        project_id: f.project_id,
        ...WEEK,
        entries: [
          { metric_id: f.quality_a, component_1_value: 50, component_2_value: null },
          { metric_id: f.quality_b, component_1_value: 150, component_2_value: null },
          { metric_id: f.delivery, component_1_value: 50, component_2_value: null },
        ],
        session: f.session,
      });
      const detail = await getKpiRecord({
        project_id: f.project_id,
        ...WEEK,
        session: f.session,
      });
      expect(detail.category_health.quality).toBe('yellow');
      expect(detail.category_health.delivery).toBe('green');
      expect(detail.category_health.cost_capacity).toBeNull();
      expect(detail.overall_health).toBe('yellow');
    });
  });
});
