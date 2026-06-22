import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  projectProjection,
  worker,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { getAllocationGrid } from '../../src/backend/domain/allocation-grid.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('getAllocationGrid', () => {
  it('spreads spans to months, sums per worker, flags over-allocation', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool); // adminSession holds people.worker.read.all
        const personId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const projA = crypto.randomUUID();
        const projB = crypto.randomUUID();

        await peopleDb().insert(worker).values({
          tenant_id: t.tenant_id,
          person_id: personId,
          full_name: 'Pat Lin',
        });
        await peopleDb()
          .insert(projectProjection)
          .values([
            { project_id: projA, tenant_id: t.tenant_id, account_id: accountId, name: 'Alpha' },
            { project_id: projB, tenant_id: t.tenant_id, account_id: accountId, name: 'Beta' },
          ]);
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: personId,
              project_id: projA,
              account_id: accountId,
              account_name: 'Acme',
              date_from: '2026-01-01',
              date_to: '2026-06-30',
              planned_pct: '80',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: personId,
              project_id: projB,
              account_id: accountId,
              account_name: 'Acme',
              date_from: '2026-04-01',
              date_to: '2026-12-31',
              planned_pct: '40',
              bucket: 'internal',
              active: true,
            },
          ]);

        const grid = await getAllocationGrid(t.adminSession, { year: 2026 });

        expect(grid.rows).toHaveLength(2);
        const alpha = grid.rows.find((r) => r.project_id === projA)!;
        // Jan active (80), Dec inactive (null)
        expect(alpha.months[0]).toBe(80);
        expect(alpha.months[11]).toBeNull();

        const totals = grid.worker_totals.find((w) => w.worker_id === personId)!;
        // Apr–Jun both active → 80 + 40 = 120 > 100
        expect(totals.totals[3]).toBe(120);
        expect(totals.over_months).toContain(3);

        expect(grid.kpis.member_count).toBe(1);
        expect(grid.kpis.project_count).toBe(2);
        expect(grid.kpis.over_allocated_count).toBe(1);
        // total_mm > 0 and finite
        expect(alpha.total_mm).toBeGreaterThan(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns rows grouped per worker, sorted by name', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = crypto.randomUUID();
        const zoe = crypto.randomUUID();
        const amy = crypto.randomUUID();
        await peopleDb()
          .insert(worker)
          .values([
            { tenant_id: t.tenant_id, person_id: zoe, full_name: 'Zoe Last' },
            { tenant_id: t.tenant_id, person_id: amy, full_name: 'Amy First' },
          ]);
        // Interleave insert order: Zoe, Amy, Amy — the query must still group + alphabetize.
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: zoe,
              project_id: crypto.randomUUID(),
              account_id: accountId,
              account_name: 'Acme',
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '50',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: amy,
              project_id: crypto.randomUUID(),
              account_id: accountId,
              account_name: 'Acme',
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '50',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: amy,
              project_id: crypto.randomUUID(),
              account_id: accountId,
              account_name: 'Acme',
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '50',
              bucket: 'billable',
              active: true,
            },
          ]);

        const grid = await getAllocationGrid(t.adminSession, { year: 2026 });
        // Amy (2 rows) sorts before Zoe (1 row); each worker's rows are consecutive.
        expect(grid.rows.map((r) => r.worker_id)).toEqual([amy, amy, zoe]);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('excludes workers outside the viewer scope', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const stranger = crypto.randomUUID();
        await peopleDb().insert(worker).values({
          tenant_id: t.tenant_id,
          person_id: stranger,
          full_name: 'Out Of Scope',
        });
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          worker_id: stranger,
          project_id: crypto.randomUUID(),
          account_id: crypto.randomUUID(),
          account_name: 'Acme',
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          planned_pct: '100',
          bucket: 'billable',
          active: true,
        });
        // Non-privileged viewer: holds people.worker.read (not .all) and is not linked to
        // any worker, so buildWorkerScope yields no rows (fail-closed).
        const memberSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
        });
        const grid = await getAllocationGrid(memberSession, { year: 2026 });
        expect(grid.rows.find((r) => r.worker_id === stranger)).toBeUndefined();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
