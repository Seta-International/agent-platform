import type { SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  listKpiExplorer,
  overrideFlag,
  setAppliedMetric,
  setWeeklyReportClock,
  submitCharter,
  upsertKpiRecord,
  upsertWeeklyReport,
} from '../../src/index.ts';
import { approveCharterTwoStage, buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const WEEK = { iso_year: 2026, iso_week: 29 };

function sessionFor(
  tenant_id: string,
  person_id: string,
  role: string,
  scope_kind: 'self' | 'tenant' = 'self',
): SessionScope {
  return buildSession({
    tenant_id,
    user_id: crypto.randomUUID(),
    roles: [role],
    assignments: [{ role_slug: role, scope_kind, scope_id: null }],
    worker_id: person_id,
  });
}

interface Fixture {
  project_id: string;
  metric_id: string;
  spareMetricId: string;
  em: SessionScope;
  tenantPmo: SessionScope;
}

async function seedMetric(
  pool: Pool,
  tenantId: string,
  normId: string,
  name: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm_metric
       (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
        component_1_label, green_band, yellow_band, red_band)
     VALUES ($1,$2,$3,'quality','core',$4,'x',1,'x',
             '{"op":"lte","value":100}','{"op":"between","min":100,"max":200}',
             '{"op":"gt","value":200}')`,
    [id, tenantId, normId, name],
  );
  return id;
}

async function seedProject(pool: Pool): Promise<Fixture> {
  const { tenant_id, adminSession } = await seedTenant(pool);
  const emPerson = crypto.randomUUID();

  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name) VALUES ($1,$2) RETURNING id`,
    [tenant_id, 'KPI Authorship Co'],
  );
  const { project_id: charterId } = await submitCharter({
    account_id: acc.rows[0].id,
    name: 'KPI Authorship Project',
    pm_worker_id: emPerson,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session: adminSession,
  });
  const { project_id } = await approveCharterTwoStage(charterId, tenant_id);

  const normId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'TEST','v1')`,
    [normId, tenant_id],
  );
  const metric_id = await seedMetric(pool, tenant_id, normId, 'Defect Leakage');
  const spareMetricId = await seedMetric(pool, tenant_id, normId, 'Rework Ratio');

  await setAppliedMetric({
    metric_id,
    applied: true,
    project_ids: [project_id],
    session: adminSession,
  });

  return {
    project_id,
    metric_id,
    spareMetricId,
    em: sessionFor(tenant_id, emPerson, 'pm.manager'),
    tenantPmo: sessionFor(tenant_id, crypto.randomUUID(), 'pm.pmo', 'tenant'),
  };
}

const entry = (metric_id: string) => ({
  metric_id,
  component_1_value: 50,
  component_2_value: null,
});

describe('who may assert facts about a project’s week (KPI numbers and QCDP flags)', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('refuses a tenant-wide PMO writing the week’s KPI numbers for a project that is not theirs', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const f = await seedProject(pool);

        await expect(
          upsertKpiRecord({
            project_id: f.project_id,
            ...WEEK,
            entries: [entry(f.metric_id)],
            session: f.tenantPmo,
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        await closePools();
      }
    });
  });

  it('lets the project’s EM write them', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const f = await seedProject(pool);

        const saved = await upsertKpiRecord({
          project_id: f.project_id,
          ...WEEK,
          entries: [entry(f.metric_id)],
          session: f.em,
        });
        expect(saved.record_id).toBeTruthy();
      } finally {
        await closePools();
      }
    });
  });

  it('refuses a tenant-wide PMO overriding a QCDP flag on a project that is not theirs', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const f = await seedProject(pool);
        await upsertWeeklyReport({
          project_id: f.project_id,
          ...WEEK,
          executive_summary: 'Steady week.',
          road_to_green: 'Keep measuring',
          road_to_green_due: '2026-12-31',
          session: f.em,
        });

        await expect(
          overrideFlag({
            project_id: f.project_id,
            ...WEEK,
            category: 'quality',
            final_colour: 'red',
            reason: 'portfolio review',
            session: f.tenantPmo,
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        await closePools();
      }
    });
  });

  it('still lets a tenant-wide PMO configure which metrics apply — that is portfolio governance, not a claim about the week', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const f = await seedProject(pool);

        const applied = await setAppliedMetric({
          metric_id: f.spareMetricId,
          applied: true,
          project_ids: [f.project_id],
          session: f.tenantPmo,
        });
        expect(applied).toMatchObject({ applied: true, project_ids: [f.project_id] });
      } finally {
        await closePools();
      }
    });
  });

  it('tells the KPI Explorer who may enter numbers, so no dead-end Enter button renders', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const f = await seedProject(pool);
        const rowFor = async (session: SessionScope) => {
          const { rows } = await listKpiExplorer({ ...WEEK, session });
          return rows.find((r) => r.project_id === f.project_id);
        };

        expect((await rowFor(f.em))?.can_report).toBe(true);
        expect((await rowFor(f.tenantPmo))?.can_report).toBe(false);
        expect((await rowFor(f.tenantPmo))?.can_manage).toBe(true);
      } finally {
        await closePools();
      }
    });
  });
});
