import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  listAppliedMetrics,
  setAppliedMetric,
  setWeeklyReportClock,
  submitCharter,
  upsertKpiRecord,
} from '../../src/index.ts';
import { approveCharterTwoStage, buildSession, seedTenant } from '../helpers.ts';

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

describe('listAppliedMetrics — would_empty_count agrees with what setAppliedMetric refuses', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('counts only the projects an un-apply would actually empty', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const projectB = await liveProject(pool, t.adminSession, t.tenant_id, 'B');
        const [metricOne, metricTwo] = await seedTwoMetrics(pool, t.tenant_id);
        const projects = [projectA, projectB];

        await setAppliedMetric({
          metric_id: metricOne,
          applied: true,
          project_ids: projects,
          session: t.adminSession,
        });
        await setAppliedMetric({
          metric_id: metricTwo,
          applied: true,
          project_ids: [projectA],
          session: t.adminSession,
        });

        const coverage = await listAppliedMetrics(t.adminSession, projects);
        const byMetric = new Map(coverage.map((c) => [c.metric_id, c]));

        expect(byMetric.get(metricOne)).toMatchObject({
          applied_count: 2,
          would_empty_count: 1,
        });
        expect(byMetric.get(metricTwo)).toMatchObject({
          applied_count: 1,
          would_empty_count: 0,
        });

        await expect(
          setAppliedMetric({
            metric_id: metricOne,
            applied: false,
            project_ids: projects,
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ details: { empty_project_ids: [projectB] } });

        await expect(
          setAppliedMetric({
            metric_id: metricTwo,
            applied: false,
            project_ids: projects,
            session: t.adminSession,
          }),
        ).resolves.toMatchObject({ applied: false });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('ignores projects whose category was already empty before the change', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const projectB = await liveProject(pool, t.adminSession, t.tenant_id, 'B');
        const [metricOne, metricTwo] = await seedTwoMetrics(pool, t.tenant_id);
        const projects = [projectA, projectB];

        for (const metric_id of [metricOne, metricTwo]) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectA],
            session: t.adminSession,
          });
        }

        const coverage = await listAppliedMetrics(t.adminSession, projects);
        expect(coverage.find((c) => c.metric_id === metricTwo)).toMatchObject({
          applied_count: 1,
          would_empty_count: 0,
        });

        await expect(
          setAppliedMetric({
            metric_id: metricTwo,
            applied: false,
            project_ids: projects,
            session: t.adminSession,
          }),
        ).resolves.toMatchObject({ applied: false });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reports 0 while another metric in the category still covers every project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const projectB = await liveProject(pool, t.adminSession, t.tenant_id, 'B');
        const [metricOne, metricTwo] = await seedTwoMetrics(pool, t.tenant_id);
        const projects = [projectA, projectB];

        for (const metric_id of [metricOne, metricTwo]) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: projects,
            session: t.adminSession,
          });
        }

        const coverage = await listAppliedMetrics(t.adminSession, projects);
        for (const c of coverage) expect(c.would_empty_count).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('setAppliedMetric — applied_by', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('names the actor who applied it last, not the one who applied it first', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const [metricOne] = await seedTwoMetrics(pool, t.tenant_id);

        await setAppliedMetric({
          metric_id: metricOne,
          applied: true,
          project_ids: [projectA],
          session: t.adminSession,
        });

        const second = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.manager'],
        });
        await setAppliedMetric({
          metric_id: metricOne,
          applied: true,
          project_ids: [projectA],
          session: second,
        });

        const { rows } = await pool.query(
          `SELECT applied_by FROM pm.kpi_applied_metric WHERE project_id = $1 AND metric_id = $2`,
          [projectA, metricOne],
        );
        expect(rows[0]?.applied_by).toBe(second.user_id);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('setAppliedMetric — the category rule holds under concurrency', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('refuses the second un-apply once a concurrent one has taken the other metric', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const [metricOne, metricTwo] = await seedTwoMetrics(pool, t.tenant_id);

        for (const metric_id of [metricOne, metricTwo]) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectA],
            session: t.adminSession,
          });
        }

        const rival = await pool.connect();
        let settled: PromiseSettledResult<unknown>;
        try {
          await rival.query('BEGIN');
          await rival.query(
            `DELETE FROM pm.kpi_applied_metric WHERE project_id = $1 AND metric_id = $2`,
            [projectA, metricOne],
          );

          const pending = Promise.allSettled([
            setAppliedMetric({
              metric_id: metricTwo,
              applied: false,
              project_ids: [projectA],
              session: t.adminSession,
            }),
          ]);
          await new Promise((resolve) => setTimeout(resolve, 300));
          await rival.query('COMMIT');
          settled = (await pending)[0] as PromiseSettledResult<unknown>;
        } finally {
          rival.release();
        }

        expect(settled.status, 'the last metric in a category must not come off').toBe('rejected');

        const left = await listAppliedMetrics(t.adminSession, [projectA]);
        expect(
          left.filter((c) => c.applied_count > 0),
          'Quality must not be left with zero applied metrics',
        ).toHaveLength(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('listAppliedMetrics — entered_count for the queried week (FUT-802 AC5)', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('reports which metrics already hold a figure for that week, per project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const projectB = await liveProject(pool, t.adminSession, t.tenant_id, 'B');
        const [metricOne, metricTwo] = await seedTwoMetrics(pool, t.tenant_id);
        const projects = [projectA, projectB];

        await setAppliedMetric({
          metric_id: metricOne,
          applied: true,
          project_ids: projects,
          session: t.adminSession,
        });

        await upsertKpiRecord({
          project_id: projectA,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metricOne, component_1_value: 42, component_2_value: null }],
          session: t.adminSession,
        });

        await setAppliedMetric({
          metric_id: metricTwo,
          applied: true,
          project_ids: projects,
          session: t.adminSession,
        });

        const coverage = await listAppliedMetrics(t.adminSession, projects, {
          iso_year: 2026,
          iso_week: 29,
        });
        const byMetric = new Map(coverage.map((c) => [c.metric_id, c]));

        expect(byMetric.get(metricOne)).toMatchObject({ applied_count: 2, entered_count: 1 });
        expect(byMetric.get(metricTwo)).toMatchObject({ applied_count: 2, entered_count: 0 });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('counts nothing for a different week, and nothing when no week is queried', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const [metricOne] = await seedTwoMetrics(pool, t.tenant_id);

        await setAppliedMetric({
          metric_id: metricOne,
          applied: true,
          project_ids: [projectA],
          session: t.adminSession,
        });
        await upsertKpiRecord({
          project_id: projectA,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metricOne, component_1_value: 42, component_2_value: null }],
          session: t.adminSession,
        });

        const otherWeek = await listAppliedMetrics(t.adminSession, [projectA], {
          iso_year: 2026,
          iso_week: 28,
        });
        expect(otherWeek.find((c) => c.metric_id === metricOne)?.entered_count).toBe(0);

        const noWeek = await listAppliedMetrics(t.adminSession, [projectA]);
        expect(noWeek.find((c) => c.metric_id === metricOne)?.entered_count).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('still reports a figure whose metric has since been un-applied', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectA = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const [metricOne, metricTwo] = await seedTwoMetrics(pool, t.tenant_id);

        await setAppliedMetric({
          metric_id: metricOne,
          applied: true,
          project_ids: [projectA],
          session: t.adminSession,
        });
        await upsertKpiRecord({
          project_id: projectA,
          iso_year: 2026,
          iso_week: 29,
          entries: [{ metric_id: metricOne, component_1_value: 42, component_2_value: null }],
          session: t.adminSession,
        });
        await setAppliedMetric({
          metric_id: metricTwo,
          applied: true,
          project_ids: [projectA],
          session: t.adminSession,
        });
        await setAppliedMetric({
          metric_id: metricOne,
          applied: false,
          project_ids: [projectA],
          session: t.adminSession,
        });

        const coverage = await listAppliedMetrics(t.adminSession, [projectA], {
          iso_year: 2026,
          iso_week: 29,
        });

        expect(coverage.find((c) => c.metric_id === metricOne)).toMatchObject({
          applied_count: 0,
          entered_count: 1,
        });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
