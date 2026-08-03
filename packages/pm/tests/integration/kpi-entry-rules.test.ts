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

interface MetricRules {
  component_count: 1 | 2;
  component_1_integer?: boolean;
  component_2_integer?: boolean;
  component_1_min?: number | null;
  component_1_max?: number | null;
  is_share?: boolean;
}

async function seedMetric(pool: Pool, tenantId: string, rules: MetricRules): Promise<string> {
  const normId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'TEST','v1')`,
    [normId, tenantId],
  );
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm_metric
       (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
        component_1_label, component_2_label, component_1_integer, component_2_integer,
        component_1_min, component_1_max, is_share,
        green_band, yellow_band, red_band, sort_order)
     VALUES ($1,$2,$3,'quality','core','Metric One','x',$4,'Numerator',$5,$6,$7,$8,$9,$10,
             '{"op":"lte","value":100}','{"op":"between","min":100,"max":200}',
             '{"op":"gt","value":200}',0)`,
    [
      id,
      tenantId,
      normId,
      rules.component_count,
      rules.component_count === 2 ? 'Denominator' : null,
      rules.component_1_integer ?? false,
      rules.component_2_integer ?? false,
      rules.component_1_min ?? null,
      rules.component_1_max ?? null,
      rules.is_share ?? false,
    ],
  );
  return id;
}

const WEEK = { iso_year: 2026, iso_week: 29 };

interface Fixture {
  session: import('@seta/core').SessionScope;
  project_id: string;
  metric_id: string;
}

async function withMetric(rules: MetricRules, body: (f: Fixture) => Promise<void>): Promise<void> {
  await withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPmDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      const project_id = await liveProject(pool, t.adminSession, t.tenant_id, 'Alpha');
      const metric_id = await seedMetric(pool, t.tenant_id, rules);
      await setAppliedMetric({
        metric_id,
        applied: true,
        project_ids: [project_id],
        session: t.adminSession,
      });
      await body({ session: t.adminSession, project_id, metric_id });
    } finally {
      await closePools();
    }
  });
}

describe('KPI entry rules enforced on save', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('refuses a figure wider than the numeric column instead of erroring on insert', async () => {
    await withMetric({ component_count: 1 }, async ({ session, project_id, metric_id }) => {
      await expect(
        upsertKpiRecord({
          project_id,
          ...WEEK,
          entries: [{ metric_id, component_1_value: 1e30, component_2_value: null }],
          session,
        }),
      ).rejects.toThrow(/Max 11 digits/);
    });
  });

  it('refuses a decimal on a metric that counts things', async () => {
    await withMetric(
      { component_count: 1, component_1_integer: true },
      async ({ session, project_id, metric_id }) => {
        await expect(
          upsertKpiRecord({
            project_id,
            ...WEEK,
            entries: [{ metric_id, component_1_value: 2.6, component_2_value: null }],
            session,
          }),
        ).rejects.toThrow(/Whole number only/);
      },
    );
  });

  it('refuses a half-filled ratio, which would save with no computed value', async () => {
    await withMetric({ component_count: 2 }, async ({ session, project_id, metric_id }) => {
      await expect(
        upsertKpiRecord({
          project_id,
          ...WEEK,
          entries: [{ metric_id, component_1_value: 5, component_2_value: null }],
          session,
        }),
      ).rejects.toThrow(/Required/);
    });
  });

  it('refuses a numerator above the total on a share metric', async () => {
    await withMetric(
      { component_count: 2, is_share: true },
      async ({ session, project_id, metric_id }) => {
        await expect(
          upsertKpiRecord({
            project_id,
            ...WEEK,
            entries: [{ metric_id, component_1_value: 21, component_2_value: 20 }],
            session,
          }),
        ).rejects.toThrow(/exceed Denominator/);
      },
    );
  });

  it('saves a negative figure when the metric allows one, and reads it back', async () => {
    await withMetric(
      {
        component_count: 1,
        component_1_integer: true,
        component_1_min: -49,
        component_1_max: 49,
      },
      async ({ session, project_id, metric_id }) => {
        await upsertKpiRecord({
          project_id,
          ...WEEK,
          entries: [{ metric_id, component_1_value: -12, component_2_value: null }],
          session,
        });

        const record = await getKpiRecord({ project_id, ...WEEK, session });
        expect(record.metrics[0]?.component_1_value).toBe(-12);

        await expect(
          upsertKpiRecord({
            project_id,
            ...WEEK,
            entries: [{ metric_id, component_1_value: -50, component_2_value: null }],
            session,
          }),
        ).rejects.toThrow(/Enter -49 to 49/);
      },
    );
  });

  it('carries the rules onto the record the entry screen reads', async () => {
    await withMetric(
      {
        component_count: 2,
        component_1_integer: true,
        component_2_integer: true,
        component_1_min: 0,
        is_share: true,
      },
      async ({ session, project_id }) => {
        const record = await getKpiRecord({ project_id, ...WEEK, session });
        expect(record.metrics[0]).toMatchObject({
          component_1_integer: true,
          component_2_integer: true,
          component_1_min: 0,
          component_1_max: null,
          is_share: true,
        });
      },
    );
  });
});
