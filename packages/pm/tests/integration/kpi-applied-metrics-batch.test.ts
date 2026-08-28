import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  listAppliedMetrics,
  setAppliedMetric,
  setAppliedMetrics,
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

/** Two metrics in each of two areas — enough to exercise the "every area keeps at least one
 * applied metric" rule both within and across areas. */
async function seedMetrics(
  pool: Pool,
  tenantId: string,
): Promise<{ qualityA: string; qualityB: string; deliveryA: string; deliveryB: string }> {
  const normId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'TEST','v1')`,
    [normId, tenantId],
  );
  const insertMetric = async (name: string, category: string, sortOrder: number) => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO pm.kpi_norm_metric
         (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
          component_1_label, green_band, yellow_band, red_band, sort_order)
       VALUES ($1,$2,$3,$4,'core',$5,'x',1,'x',
               '{"op":"lte","value":100}','{"op":"between","min":100,"max":200}',
               '{"op":"gt","value":200}',$6)`,
      [id, tenantId, normId, category, name, sortOrder],
    );
    return id;
  };
  return {
    qualityA: await insertMetric('Quality A', 'quality', 0),
    qualityB: await insertMetric('Quality B', 'quality', 1),
    deliveryA: await insertMetric('Delivery A', 'delivery', 2),
    deliveryB: await insertMetric('Delivery B', 'delivery', 3),
  };
}

describe('setAppliedMetrics — Configure metrics saves the whole panel at once (FUT-963)', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('swaps the last metric in an area for another one in the same save', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const { qualityA, qualityB } = await seedMetrics(pool, t.tenant_id);

        await setAppliedMetric({
          metric_id: qualityA,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });

        // One at a time this is impossible: turning Quality A off first empties the area.
        await setAppliedMetrics({
          changes: [
            { metric_id: qualityA, applied: false },
            { metric_id: qualityB, applied: true },
          ],
          project_ids: [projectId],
          session: t.adminSession,
        });

        const coverage = await listAppliedMetrics(t.adminSession, [projectId]);
        const byMetric = new Map(coverage.map((c) => [c.metric_id, c.applied_count]));
        expect(byMetric.get(qualityA) ?? 0).toBe(0);
        expect(byMetric.get(qualityB)).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('applies nothing when one change in the save is refused', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const { qualityA, deliveryA } = await seedMetrics(pool, t.tenant_id);

        await setAppliedMetric({
          metric_id: qualityA,
          applied: true,
          project_ids: [projectId],
          session: t.adminSession,
        });

        await expect(
          setAppliedMetrics({
            changes: [
              { metric_id: deliveryA, applied: true },
              { metric_id: qualityA, applied: false },
            ],
            project_ids: [projectId],
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({
          details: { category: 'quality', empty_project_ids: [projectId] },
        });

        // The Delivery metric rode along in the refused save, so it must not be applied either.
        const coverage = await listAppliedMetrics(t.adminSession, [projectId]);
        const byMetric = new Map(coverage.map((c) => [c.metric_id, c.applied_count]));
        expect(byMetric.get(deliveryA) ?? 0).toBe(0);
        expect(byMetric.get(qualityA)).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('refuses a save that turns off every applied metric in one area', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const { qualityA, qualityB, deliveryA } = await seedMetrics(pool, t.tenant_id);

        for (const metric_id of [qualityA, qualityB, deliveryA]) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectId],
            session: t.adminSession,
          });
        }

        // Neither tick empties Quality on its own — only the pair does.
        await expect(
          setAppliedMetrics({
            changes: [
              { metric_id: qualityA, applied: false },
              { metric_id: qualityB, applied: false },
            ],
            project_ids: [projectId],
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({
          details: { category: 'quality', empty_project_ids: [projectId] },
        });

        const coverage = await listAppliedMetrics(t.adminSession, [projectId]);
        const byMetric = new Map(coverage.map((c) => [c.metric_id, c.applied_count]));
        expect(byMetric.get(qualityA)).toBe(1);
        expect(byMetric.get(qualityB)).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('drops the open week figures of every metric the save turns off', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const { qualityA, qualityB, deliveryA, deliveryB } = await seedMetrics(pool, t.tenant_id);

        for (const metric_id of [qualityA, qualityB, deliveryA, deliveryB]) {
          await setAppliedMetric({
            metric_id,
            applied: true,
            project_ids: [projectId],
            session: t.adminSession,
          });
        }
        const record = await upsertKpiRecord({
          project_id: projectId,
          iso_year: 2026,
          iso_week: 29,
          entries: [
            { metric_id: qualityA, component_1_value: 1, component_2_value: null },
            { metric_id: qualityB, component_1_value: 2, component_2_value: null },
            { metric_id: deliveryA, component_1_value: 3, component_2_value: null },
            { metric_id: deliveryB, component_1_value: 4, component_2_value: null },
          ],
          session: t.adminSession,
        });

        // One save spanning two areas — both turned-off metrics lose the week's figures.
        await setAppliedMetrics({
          changes: [
            { metric_id: qualityB, applied: false },
            { metric_id: deliveryB, applied: false },
          ],
          project_ids: [projectId],
          session: t.adminSession,
        });

        const entries = await pool.query(
          `SELECT metric_id FROM pm.kpi_record_entry WHERE tenant_id = $1 AND record_id = $2`,
          [t.tenant_id, record.record_id],
        );
        expect(entries.rows.map((r) => r.metric_id).sort()).toEqual([qualityA, deliveryA].sort());
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('refuses a save that names the same metric twice', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const { qualityA } = await seedMetrics(pool, t.tenant_id);

        await expect(
          setAppliedMetrics({
            changes: [
              { metric_id: qualityA, applied: true },
              { metric_id: qualityA, applied: false },
            ],
            project_ids: [projectId],
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('re-checks manage rights on every project in the save', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await liveProject(pool, t.adminSession, t.tenant_id, 'A');
        const { qualityA } = await seedMetrics(pool, t.tenant_id);
        const outsider = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: [],
        });

        await expect(
          setAppliedMetrics({
            changes: [{ metric_id: qualityA, applied: true }],
            project_ids: [projectId],
            session: outsider,
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
