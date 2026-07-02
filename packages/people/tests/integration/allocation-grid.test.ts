import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
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

        // Search filters rows to the matching worker, but KPIs stay at full scope.
        const filtered = await getAllocationGrid(t.adminSession, { year: 2026, search: 'amy' });
        expect(new Set(filtered.rows.map((r) => r.worker_id))).toEqual(new Set([amy]));
        expect(filtered.kpis.member_count).toBe(2);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('folds diacritics for Vietnamese-insensitive search and filters by status/account/project/bucket', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acmeAcc = crypto.randomUUID();
        const internalAcc = crypto.randomUUID();
        const projAcme = crypto.randomUUID();
        const projInternal = crypto.randomUUID();
        const hung = crypto.randomUUID(); // over-allocated
        const dung = crypto.randomUUID(); // under-utilized, đ in name

        await peopleDb()
          .insert(worker)
          .values([
            { tenant_id: t.tenant_id, person_id: hung, full_name: 'Hưng Vũ' },
            { tenant_id: t.tenant_id, person_id: dung, full_name: 'Đũng Trần' },
          ]);
        await peopleDb()
          .insert(projectProjection)
          .values([
            { project_id: projAcme, tenant_id: t.tenant_id, account_id: acmeAcc, name: 'Apollo' },
            {
              project_id: projInternal,
              tenant_id: t.tenant_id,
              account_id: internalAcc,
              name: 'Internal Tools',
            },
          ]);
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            // Hưng: two billable Acme bookings overlapping → over 100% all year
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: hung,
              project_id: projAcme,
              account_id: acmeAcc,
              account_name: 'Acme',
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '80',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: hung,
              project_id: projInternal,
              account_id: internalAcc,
              account_name: 'SETA Internal',
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '40',
              bucket: 'internal',
              active: true,
            },
            // Đũng: a single light internal booking → under-utilized
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: dung,
              project_id: projInternal,
              account_id: internalAcc,
              account_name: 'SETA Internal',
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '30',
              bucket: 'internal',
              active: true,
            },
          ]);

        // Accent-insensitive: "hung" matches "Hưng", "dung" matches "Đũng".
        const byHung = await getAllocationGrid(t.adminSession, { year: 2026, search: 'hung' });
        expect(new Set(byHung.rows.map((r) => r.worker_id))).toEqual(new Set([hung]));
        const byDung = await getAllocationGrid(t.adminSession, { year: 2026, search: 'dung' });
        expect(new Set(byDung.rows.map((r) => r.worker_id))).toEqual(new Set([dung]));

        // status=over keeps only Hưng; status=under keeps only Đũng.
        const over = await getAllocationGrid(t.adminSession, { year: 2026, status: 'over' });
        expect(new Set(over.rows.map((r) => r.worker_id))).toEqual(new Set([hung]));
        const under = await getAllocationGrid(t.adminSession, { year: 2026, status: 'under' });
        expect(new Set(under.rows.map((r) => r.worker_id))).toEqual(new Set([dung]));

        // account filter keeps only that account's rows.
        const acme = await getAllocationGrid(t.adminSession, { year: 2026, accountId: acmeAcc });
        expect(acme.rows.every((r) => r.account_id === acmeAcc)).toBe(true);
        expect(acme.rows).toHaveLength(1);

        // project filter narrows to a single project's line.
        const proj = await getAllocationGrid(t.adminSession, {
          year: 2026,
          projectId: projInternal,
        });
        expect(proj.rows.every((r) => r.project_id === projInternal)).toBe(true);

        // bucket filter keeps only billable lines.
        const billable = await getAllocationGrid(t.adminSession, {
          year: 2026,
          bucket: 'billable',
        });
        expect(billable.rows.every((r) => r.bucket === 'billable')).toBe(true);
        expect(billable.rows).toHaveLength(1);

        // Facets cover the full scope (both accounts/projects) even though no filter is applied.
        const all = await getAllocationGrid(t.adminSession, { year: 2026 });
        expect(new Set(all.facets.accounts.map((a) => a.id))).toEqual(
          new Set([acmeAcc, internalAcc]),
        );
        expect(new Set(all.facets.projects.map((p) => p.id))).toEqual(
          new Set([projAcme, projInternal]),
        );
        // KPIs stay at full scope regardless of the active filter.
        expect(over.kpis.member_count).toBe(2);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not flag a steady-100% worker as under-utilized despite ramp-up months', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acc = crypto.randomUUID();
        const nam = crypto.randomUUID();
        await peopleDb().insert(worker).values({
          tenant_id: t.tenant_id,
          person_id: nam,
          full_name: 'Hoàng Phó Nam',
        });
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            // 91% but only Mar–Dec (project window starts in Q1), so Jan/Feb dip to the 9% line.
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: nam,
              project_id: crypto.randomUUID(),
              account_id: acc,
              account_name: 'Acme',
              date_from: '2026-03-01',
              date_to: '2026-12-31',
              planned_pct: '91',
              bucket: 'billable',
              active: true,
            },
            // 9% internal all year.
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: nam,
              project_id: crypto.randomUUID(),
              account_id: acc,
              account_name: 'SETA Internal',
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '9',
              bucket: 'internal',
              active: true,
            },
          ]);

        // Peak month is 100% (Mar–Dec) → neither under-utilized nor over-allocated.
        const under = await getAllocationGrid(t.adminSession, { year: 2026, status: 'under' });
        expect(under.rows.find((r) => r.worker_id === nam)).toBeUndefined();
        const over = await getAllocationGrid(t.adminSession, { year: 2026, status: 'over' });
        expect(over.rows.find((r) => r.worker_id === nam)).toBeUndefined();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('exposes employee_no and flags account-manager rows', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acc = crypto.randomUUID();
        const am = crypto.randomUUID();
        const member = crypto.randomUUID();
        await peopleDb()
          .insert(worker)
          .values([
            {
              tenant_id: t.tenant_id,
              person_id: am,
              full_name: 'Ann Manager',
              employee_no: '6885',
            },
            {
              tenant_id: t.tenant_id,
              person_id: member,
              full_name: 'Ben Dev',
              employee_no: '7001',
            },
          ]);
        await peopleDb()
          .insert(accountProjection)
          .values({ account_id: acc, tenant_id: t.tenant_id, name: 'Fabrikam', am_worker_id: am });
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: am,
              project_id: crypto.randomUUID(),
              account_id: acc,
              account_name: 'Fabrikam',
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '64',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              worker_id: member,
              project_id: crypto.randomUUID(),
              account_id: acc,
              account_name: 'Fabrikam',
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '100',
              bucket: 'billable',
              active: true,
            },
          ]);

        const grid = await getAllocationGrid(t.adminSession, { year: 2026 });
        const amRow = grid.rows.find((r) => r.worker_id === am)!;
        const memberRow = grid.rows.find((r) => r.worker_id === member)!;
        expect(amRow.employee_no).toBe('6885');
        expect(amRow.is_account_am).toBe(true); // manages the account → render account, not project
        expect(memberRow.employee_no).toBe('7001');
        expect(memberRow.is_account_am).toBe(false); // a plain member on the same account
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
