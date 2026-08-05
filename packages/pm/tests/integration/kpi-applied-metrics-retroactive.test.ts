import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  getKpiRecord,
  listKpiExplorer,
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

const OPEN_WEEK = new Date('2026-07-15T03:00:00Z');
const THREE_WEEKS_LATER = new Date('2026-08-05T03:00:00Z');
const WEEK_29 = { iso_year: 2026, iso_week: 29 };

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

interface Fixture {
  session: import('@seta/core').SessionScope;
  projectId: string;
  metricOne: string;
  metricTwo: string;
}

async function measuredWeek29(
  pool: Pool,
  applied: 'both' | 'metric-two-only' = 'both',
): Promise<Fixture> {
  const t = await seedTenant(pool);
  const projectId = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
  const [metricOne, metricTwo] = await seedTwoQualityMetrics(pool, t.tenant_id);
  const appliedIds = applied === 'both' ? [metricOne, metricTwo] : [metricTwo];

  for (const metric_id of appliedIds) {
    await setAppliedMetric({
      metric_id,
      applied: true,
      project_ids: [projectId],
      session: t.adminSession,
    });
  }
  await upsertKpiRecord({
    project_id: projectId,
    ...WEEK_29,
    entries: [
      ...(applied === 'both'
        ? [{ metric_id: metricOne, component_1_value: 500, component_2_value: null }]
        : []),
      { metric_id: metricTwo, component_1_value: 50, component_2_value: null },
    ],
    session: t.adminSession,
  });
  setWeeklyReportClock(() => THREE_WEEKS_LATER);
  return { session: t.adminSession, projectId, metricOne, metricTwo };
}

describe('un-applying a metric and CLOSED weeks', () => {
  beforeEach(() => setWeeklyReportClock(() => OPEN_WEEK));
  afterAll(() => setWeeklyReportClock());

  it('leaves a locked week’s health untouched when a metric is un-applied today', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const { session, projectId, metricOne } = await measuredWeek29(pool);

        await expect(
          upsertKpiRecord({
            project_id: projectId,
            ...WEEK_29,
            entries: [{ metric_id: metricOne, component_1_value: 51, component_2_value: null }],
            session,
          }),
          'precondition: the week must be closed to writes',
        ).rejects.toThrow();

        const before = await listKpiExplorer({ ...WEEK_29, session });
        expect(before.rows[0]?.category_health.quality).toBe('red');
        expect(before.rows[0]?.overall_health).toBe('red');

        await setAppliedMetric({
          metric_id: metricOne,
          applied: false,
          project_ids: [projectId],
          session,
        });

        const after = await listKpiExplorer({ ...WEEK_29, session });
        expect(
          after.rows[0]?.category_health.quality,
          'the locked week’s Quality flag must not move',
        ).toBe('red');
        expect(after.rows[0]?.overall_health, 'the locked week’s OHS must not move').toBe('red');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('keeps a locked week’s recorded figures visible after the metric is un-applied', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const { session, projectId, metricOne } = await measuredWeek29(pool);
        await setAppliedMetric({
          metric_id: metricOne,
          applied: false,
          project_ids: [projectId],
          session,
        });

        const explorer = await listKpiExplorer({ ...WEEK_29, session });
        expect(
          explorer.metrics.map((m) => m.metric_id),
          'the column must survive — otherwise the week reads as "not applied"',
        ).toContain(metricOne);
        expect(explorer.rows[0]?.metrics[metricOne]?.value).toBe(500);
        expect(explorer.rows[0]?.metrics[metricOne]?.status).toBe('red');

        const detail = await getKpiRecord({ project_id: projectId, ...WEEK_29, session });
        expect(
          detail.metrics.find((m) => m.metric_id === metricOne)?.component_1_value,
          'the entry dialog must still show what was entered that week',
        ).toBe(500);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('keeps a locked week’s counts untouched when a metric is un-applied today', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const { session, projectId, metricOne } = await measuredWeek29(pool);
        await setAppliedMetric({
          metric_id: metricOne,
          applied: false,
          project_ids: [projectId],
          session,
        });

        const { rows } = await listWeeklyReports({ ...WEEK_29, session });
        expect(rows[0]?.stats.applied_count).toBe(2);
        expect(rows[0]?.stats.measured_count).toBe(2);
        expect(rows[0]?.stats.red_count).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('keeps a metric applied today off a locked week that never had it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const { session, projectId, metricOne } = await measuredWeek29(pool, 'metric-two-only');
        await setAppliedMetric({
          metric_id: metricOne,
          applied: true,
          project_ids: [projectId],
          session,
        });

        const explorer = await listKpiExplorer({ ...WEEK_29, session });
        expect(
          explorer.metrics.map((m) => m.metric_id),
          'a metric applied after the week closed must not appear as a column on it',
        ).not.toContain(metricOne);
        expect(explorer.applied_metric_ids).not.toContain(metricOne);

        const { rows } = await listWeeklyReports({ ...WEEK_29, session });
        expect(rows[0]?.stats.applied_count).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('still follows the live applied set for the OPEN week', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const { session, projectId, metricOne } = await measuredWeek29(pool);
        setWeeklyReportClock(() => OPEN_WEEK);

        const before = await listKpiExplorer({ ...WEEK_29, session });
        expect(before.rows[0]?.category_health.quality).toBe('red');

        await setAppliedMetric({
          metric_id: metricOne,
          applied: false,
          project_ids: [projectId],
          session,
        });

        const after = await listKpiExplorer({ ...WEEK_29, session });
        expect(
          after.rows[0]?.category_health.quality,
          'the open week is still being measured, so un-applying takes effect at once',
        ).toBe('green');
        expect(after.metrics.map((m) => m.metric_id)).not.toContain(metricOne);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

interface TwoProjectFixture {
  session: import('@seta/core').SessionScope;
  projectA: string;
  projectB: string;
  metricOne: string;
}

async function metricOffOnBOnly(pool: Pool): Promise<TwoProjectFixture> {
  const t = await seedTenant(pool);
  const session = t.adminSession;
  const projectA = await liveProject(pool, session, t.tenant_id, 'A');
  const projectB = await liveProject(pool, session, t.tenant_id, 'B');
  const [metricOne, metricTwo] = await seedTwoQualityMetrics(pool, t.tenant_id);

  for (const metric_id of [metricOne, metricTwo]) {
    await setAppliedMetric({
      metric_id,
      applied: true,
      project_ids: [projectA, projectB],
      session,
    });
  }
  for (const project_id of [projectA, projectB]) {
    await upsertKpiRecord({
      project_id,
      ...WEEK_29,
      entries: [
        { metric_id: metricOne, component_1_value: 500, component_2_value: null },
        { metric_id: metricTwo, component_1_value: 50, component_2_value: null },
      ],
      session,
    });
  }
  await setAppliedMetric({
    metric_id: metricOne,
    applied: false,
    project_ids: [projectB],
    session,
  });
  return { session, projectA, projectB, metricOne };
}

describe('un-applying a metric on one project while others still apply it', () => {
  beforeEach(() => setWeeklyReportClock(() => OPEN_WEEK));
  afterAll(() => setWeeklyReportClock());

  it('drops that project’s flag even though another project in view still applies it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const { session, projectA, projectB } = await metricOffOnBOnly(pool);

        const all = await listKpiExplorer({ ...WEEK_29, session });
        expect(
          all.rows.find((r) => r.project_id === projectB)?.category_health.quality,
          'B stopped applying the red metric, so A keeping it must not hold B’s flag red',
        ).toBe('green');
        expect(
          all.rows.find((r) => r.project_id === projectA)?.category_health.quality,
          'A still applies it, so A stays red',
        ).toBe('red');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reads the same flag for that project whether or not the view is filtered to it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const { session, projectB } = await metricOffOnBOnly(pool);

        const all = await listKpiExplorer({ ...WEEK_29, session });
        const filtered = await listKpiExplorer({ ...WEEK_29, project_id: projectB, session });
        expect(
          all.rows.find((r) => r.project_id === projectB)?.category_health,
          'one project, one week — the flag cannot depend on who else is on screen',
        ).toEqual(filtered.rows[0]?.category_health);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
