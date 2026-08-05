import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { account, project } from '../../src/backend/db/schema.ts';
import { listAppliedMetrics, setAppliedMetric } from '../../src/index.ts';
import { buildSession, type SeededTenant, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

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
     VALUES ($1,$2,$3,'quality','core','Defect Leakage','x',1,'x',
             '{"op":"lte","value":100}','{"op":"between","min":100,"max":200}',
             '{"op":"gt","value":200}')`,
    [id, tenantId, normId],
  );
  return id;
}

async function projectInOrg(tenantId: string, accountId: string, name: string, orgUnitId: string) {
  const [row] = await pmDb()
    .insert(project)
    .values({ tenant_id: tenantId, account_id: accountId, name, org_unit_id: orgUnitId })
    .returning({ id: project.id });
  return row!.id;
}

function orgManager(t: SeededTenant, orgUnitId: string): ReturnType<typeof buildSession> {
  return buildSession({
    tenant_id: t.tenant_id,
    user_id: crypto.randomUUID(),
    roles: ['pm.manager'],
    assignments: [
      {
        role_slug: 'pm.manager',
        scope_kind: 'org_unit',
        scope_id: orgUnitId,
        org_unit_ids: [orgUnitId],
      },
    ],
  });
}

describe('listAppliedMetrics honours the project visibility scope', () => {
  it('counts only the projects the caller is allowed to see', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const ownOrg = crypto.randomUUID();
        const otherOrg = crypto.randomUUID();
        const [acc] = await pmDb()
          .insert(account)
          .values({ tenant_id: t.tenant_id, name: 'Acme' })
          .returning({ id: account.id });
        const mine = await projectInOrg(t.tenant_id, acc!.id, 'Mine', ownOrg);
        const theirs = await projectInOrg(t.tenant_id, acc!.id, 'Theirs', otherOrg);
        const metricId = await seedMetric(pool, t.tenant_id);
        await setAppliedMetric({
          metric_id: metricId,
          applied: true,
          project_ids: [mine, theirs],
          session: t.adminSession,
        });

        const viewer = orgManager(t, ownOrg);

        expect(
          await listAppliedMetrics(viewer, [theirs]),
          'a project outside the caller org must not report its configuration',
        ).toEqual([]);

        expect(
          await listAppliedMetrics(viewer, [mine, theirs]),
          'the invisible project must not be counted alongside the visible one',
        ).toEqual([
          { metric_id: metricId, applied_count: 1, entered_count: 0, would_empty_count: 1 },
        ]);

        expect(
          await listAppliedMetrics(t.adminSession, [mine, theirs]),
          'a tenant-wide caller still sees both',
        ).toEqual([
          { metric_id: metricId, applied_count: 2, entered_count: 0, would_empty_count: 2 },
        ]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
