import { resetCoreDb } from '@seta/core/testing';
import { createAccount } from '@seta/pm';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  person,
  projectProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { getAllocationGrid } from '../../src/backend/domain/allocation-grid.ts';
import { buildSession, linkUserToPerson, seedTenant } from '../helpers.ts';

/** A pm-capable session for seeding accounts (am ownership) through pm's public surface. */
function pmManagerSession(tenantId: string) {
  return buildSession({
    tenant_id: tenantId,
    user_id: crypto.randomUUID(),
    roles: ['pm.manager'],
    assignments: [{ role_slug: 'pm.manager', scope_kind: 'tenant', scope_id: null }],
  });
}

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('getAllocationGrid', () => {
  it('spreads spans to months, sums per worker, flags over-allocation', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool); // adminSession holds a tenant-scope assignment
        const personId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const projA = crypto.randomUUID();
        const projB = crypto.randomUUID();

        await peopleDb().insert(person).values({
          id: personId,
          tenant_id: t.tenant_id,
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
              person_id: personId,
              project_id: projA,
              account_id: accountId,
              date_from: '2026-01-01',
              date_to: '2026-06-30',
              planned_pct: '80',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personId,
              project_id: projB,
              account_id: accountId,
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
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not flag sequential non-overlapping allocations within the same month as over-allocated', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const projA = crypto.randomUUID();
        const projB = crypto.randomUUID();

        await peopleDb().insert(person).values({
          id: personId,
          tenant_id: t.tenant_id,
          full_name: 'Sam Sequential',
        });
        await peopleDb()
          .insert(projectProjection)
          .values([
            { project_id: projA, tenant_id: t.tenant_id, account_id: accountId, name: 'Project A' },
            { project_id: projB, tenant_id: t.tenant_id, account_id: accountId, name: 'Project B' },
          ]);
        // Two sequential allocations in January: Jan 1-15 (60%) and Jan 16-31 (60%)
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personId,
              project_id: projA,
              account_id: accountId,
              date_from: '2026-01-01',
              date_to: '2026-01-15',
              planned_pct: '60',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personId,
              project_id: projB,
              account_id: accountId,
              date_from: '2026-01-16',
              date_to: '2026-01-31',
              planned_pct: '60',
              bucket: 'billable',
              active: true,
            },
          ]);

        const grid = await getAllocationGrid(t.adminSession, { year: 2026 });

        expect(grid.rows).toHaveLength(2);
        const totals = grid.worker_totals.find((w) => w.worker_id === personId)!;
        // Peak concurrent allocation in Jan is 60% (sequential, non-overlapping)
        expect(totals.totals[0]).toBe(60);
        expect(totals.over_months).not.toContain(0);
        expect(grid.kpis.over_allocated_count).toBe(0);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('returns rows grouped per worker, sorted by name', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = crypto.randomUUID();
        const zoe = crypto.randomUUID();
        const amy = crypto.randomUUID();
        await peopleDb()
          .insert(person)
          .values([
            { id: zoe, tenant_id: t.tenant_id, full_name: 'Zoe Last' },
            { id: amy, tenant_id: t.tenant_id, full_name: 'Amy First' },
          ]);
        // Interleave insert order: Zoe, Amy, Amy — the query must still group + alphabetize.
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: zoe,
              project_id: crypto.randomUUID(),
              account_id: accountId,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '50',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: amy,
              project_id: crypto.randomUUID(),
              account_id: accountId,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '50',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: amy,
              project_id: crypto.randomUUID(),
              account_id: accountId,
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

        // Search filters rows to the matching worker, and KPIs recalculate to the filtered set.
        const filtered = await getAllocationGrid(t.adminSession, { year: 2026, search: 'amy' });
        expect(new Set(filtered.rows.map((r) => r.worker_id))).toEqual(new Set([amy]));
        expect(filtered.kpis.member_count).toBe(1);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('folds diacritics for Vietnamese-insensitive search and filters by status/account/project/bucket', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
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
          .insert(person)
          .values([
            { id: hung, tenant_id: t.tenant_id, full_name: 'Hưng Vũ' },
            { id: dung, tenant_id: t.tenant_id, full_name: 'Đũng Trần' },
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
              person_id: hung,
              project_id: projAcme,
              account_id: acmeAcc,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '80',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: hung,
              project_id: projInternal,
              account_id: internalAcc,
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
              person_id: dung,
              project_id: projInternal,
              account_id: internalAcc,
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
        // Effort-by-account follows the filter so the summary still renders for that account.
        expect(acme.effort_by_account).toHaveLength(1);
        expect(acme.effort_by_account[0]!.account_id).toBe(acmeAcc);
        expect(acme.effort_by_account[0]!.total_mm).toBe(acme.rows[0]!.total_mm);
        // KPIs recalculate based on the filtered account.
        expect(acme.kpis.member_count).toBe(1);
        expect(acme.kpis.project_count).toBe(1);

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
        // Unfiltered effort rolls up both accounts; totals match row MM sums.
        expect(new Set(all.effort_by_account.map((a) => a.account_id))).toEqual(
          new Set([acmeAcc, internalAcc]),
        );
        const expectedMm = (accountId: string) =>
          Math.round(
            all.rows.filter((r) => r.account_id === accountId).reduce((s, r) => s + r.total_mm, 0) *
              100,
          ) / 100;
        for (const entry of all.effort_by_account) {
          expect(entry.total_mm).toBe(expectedMm(entry.account_id));
        }
        // Unknown account filter → empty effort summary (empty state on UI).
        const none = await getAllocationGrid(t.adminSession, {
          year: 2026,
          accountId: crypto.randomUUID(),
        });
        expect(none.rows).toHaveLength(0);
        expect(none.effort_by_account).toEqual([]);
        // KPIs recalculate based on the active filter.
        expect(over.kpis.member_count).toBe(1);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not flag a steady-100% worker as under-utilized despite ramp-up months', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acc = crypto.randomUUID();
        const nam = crypto.randomUUID();
        await peopleDb().insert(person).values({
          id: nam,
          tenant_id: t.tenant_id,
          full_name: 'Hoàng Phó Nam',
        });
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            // 91% but only Mar–Dec (project window starts in Q1), so Jan/Feb dip to the 9% line.
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: nam,
              project_id: crypto.randomUUID(),
              account_id: acc,
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
              person_id: nam,
              project_id: crypto.randomUUID(),
              account_id: acc,
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
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('exposes employee_no and flags account-manager rows', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const am = crypto.randomUUID();
        const member = crypto.randomUUID();
        await peopleDb()
          .insert(person)
          .values([
            {
              id: am,
              tenant_id: t.tenant_id,
              full_name: 'Ann Manager',
              employee_no: '6885',
            },
            {
              id: member,
              tenant_id: t.tenant_id,
              full_name: 'Ben Dev',
              employee_no: '7001',
            },
          ]);
        // AM ownership is sourced from pm.account (am_person_id); acc is the pm-created id.
        const { account_id: acc } = await createAccount({
          name: 'Fabrikam',
          am_worker_id: am,
          session: pmManagerSession(t.tenant_id),
        });
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: am,
              project_id: crypto.randomUUID(),
              account_id: acc,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '64',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: member,
              project_id: crypto.randomUUID(),
              account_id: acc,
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
        expect(memberRow.employee_no).toBe('7001');

        const byAmNo = await getAllocationGrid(t.adminSession, { year: 2026, search: '6885' });
        expect(new Set(byAmNo.rows.map((r) => r.worker_id))).toEqual(new Set([am]));
        expect(byAmNo.kpis.member_count).toBe(1);

        const byMemberNo = await getAllocationGrid(t.adminSession, { year: 2026, search: '7001' });
        expect(new Set(byMemberNo.rows.map((r) => r.worker_id))).toEqual(new Set([member]));
        expect(byMemberNo.kpis.member_count).toBe(1);

        const byPartial = await getAllocationGrid(t.adminSession, { year: 2026, search: '688' });
        expect(new Set(byPartial.rows.map((r) => r.worker_id))).toEqual(new Set([am]));
        expect(byPartial.kpis.member_count).toBe(1);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('excludes workers outside the viewer scope', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const stranger = crypto.randomUUID();
        await peopleDb().insert(person).values({
          id: stranger,
          tenant_id: t.tenant_id,
          full_name: 'Out Of Scope',
        });
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          person_id: stranger,
          project_id: crypto.randomUUID(),
          account_id: crypto.randomUUID(),
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
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('AM sees only allocation rows on managed accounts (FUT-342 dual-account leak)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const amUser = crypto.randomUUID();
        const am = crypto.randomUUID();
        const worker = crypto.randomUUID();
        await peopleDb()
          .insert(person)
          .values([
            { id: am, tenant_id: t.tenant_id, full_name: 'Minh AM' },
            { id: worker, tenant_id: t.tenant_id, full_name: 'Nhat Dual' },
          ]);
        await linkUserToPerson(t.tenant_id, am, amUser);

        const { account_id: granted } = await createAccount({
          name: 'SunWest Bank',
          am_worker_id: am,
          session: pmManagerSession(t.tenant_id),
        });
        const otherAm = crypto.randomUUID();
        await peopleDb().insert(person).values({
          id: otherAm,
          tenant_id: t.tenant_id,
          full_name: 'Other AM',
        });
        const { account_id: foreign } = await createAccount({
          name: 'Gridbeyond',
          am_worker_id: otherAm,
          session: pmManagerSession(t.tenant_id),
        });

        const projGranted = crypto.randomUUID();
        const projForeign = crypto.randomUUID();
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: worker,
              project_id: projGranted,
              account_id: granted,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '60',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: worker,
              project_id: projForeign,
              account_id: foreign,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '50',
              bucket: 'billable',
              active: true,
            },
          ]);

        const amSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: amUser,
          roles: ['people.viewer'],
          person_id: am,
        });
        const grid = await getAllocationGrid(amSession, { year: 2026 });
        expect(grid.rows.every((r) => r.account_id === granted)).toBe(true);
        expect(grid.rows).toHaveLength(1);
        expect(grid.rows[0]!.worker_id).toBe(worker);
        // KPIs stay within the managed-account slice (not both accounts' projects).
        expect(grid.kpis.project_count).toBe(1);
        expect(grid.kpis.member_count).toBe(1);

        // Cross project: same people only, but all of their allocation rows.
        const cross = await getAllocationGrid(amSession, { year: 2026, crossProject: true });
        expect(cross.rows).toHaveLength(2);
        expect(cross.rows.every((r) => r.worker_id === worker)).toBe(true);
        expect(new Set(cross.rows.map((r) => r.account_id))).toEqual(new Set([granted, foreign]));
        expect(cross.kpis.project_count).toBe(2);

        // Out-of-scope people on foreign accounts stay hidden even with crossProject.
        const stranger = crypto.randomUUID();
        await peopleDb().insert(person).values({
          id: stranger,
          tenant_id: t.tenant_id,
          full_name: 'Stranger Only Foreign',
        });
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          person_id: stranger,
          project_id: crypto.randomUUID(),
          account_id: foreign,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          planned_pct: '100',
          bucket: 'billable',
          active: true,
        });
        const cross2 = await getAllocationGrid(amSession, { year: 2026, crossProject: true });
        expect(cross2.rows.find((r) => r.worker_id === stranger)).toBeUndefined();
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('project lead sees only rows on projects they lead (FUT-343)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const leadUser = crypto.randomUUID();
        const lead = crypto.randomUUID();
        const worker = crypto.randomUUID();
        await peopleDb()
          .insert(person)
          .values([
            { id: lead, tenant_id: t.tenant_id, full_name: 'Duy Lead' },
            { id: worker, tenant_id: t.tenant_id, full_name: 'Member Dual' },
          ]);
        await linkUserToPerson(t.tenant_id, lead, leadUser);

        const accA = crypto.randomUUID();
        const accB = crypto.randomUUID();
        const projLed = crypto.randomUUID();
        const projOther = crypto.randomUUID();
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: worker,
              project_id: projLed,
              account_id: accA,
              lead_person_id: lead,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '70',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: worker,
              project_id: projOther,
              account_id: accB,
              lead_person_id: null,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '50',
              bucket: 'billable',
              active: true,
            },
          ]);

        const leadSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: leadUser,
          roles: ['people.viewer'],
          person_id: lead,
        });
        const grid = await getAllocationGrid(leadSession, { year: 2026 });
        expect(grid.rows).toHaveLength(1);
        expect(grid.rows[0]!.project_id).toBe(projLed);
        expect(grid.kpis.project_count).toBe(1);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('prorates monthly planned_pct for partial-month allocations so total_mm matches grid months', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const proj = crypto.randomUUID();

        await peopleDb().insert(person).values({
          id: personId,
          tenant_id: t.tenant_id,
          full_name: 'Thu Ngọc Trần',
          employee_no: '6799',
        });
        await peopleDb().insert(projectProjection).values({
          project_id: proj,
          tenant_id: t.tenant_id,
          account_id: accountId,
          name: 'Commerce Canal',
        });
        // Allocation spanning mid-July to mid-August (partial months)
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          person_id: personId,
          project_id: proj,
          account_id: accountId,
          date_from: '2026-07-27',
          date_to: '2026-08-05',
          planned_pct: '100',
          bucket: 'billable',
          active: true,
        });

        const grid = await getAllocationGrid(t.adminSession, { year: 2026 });
        const row = grid.rows.find((r) => r.worker_id === personId)!;

        // July (m=6) has 23 working days total, 5 covered -> 5 / 23 * 100 = 21.74%
        // Aug (m=7) has 21 working days total, 3 covered -> 3 / 21 * 100 = 14.29%
        expect(row.months[6]).toBeCloseTo(21.74, 1);
        expect(row.months[7]).toBeCloseTo(14.29, 1);

        // Sum of monthly MM matches total_mm
        const sumMonthlyMm = row.months.reduce((s: number, m) => s + (m ?? 0) / 100, 0);
        expect(Math.round(sumMonthlyMm * 100) / 100).toBe(row.total_mm);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('calculates monthly planned value for FUT-893 partial-month allocation (50%, Aug 7 to Aug 18)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const proj = crypto.randomUUID();

        await peopleDb().insert(person).values({
          id: personId,
          tenant_id: t.tenant_id,
          full_name: 'FUT-893 Tester',
        });
        await peopleDb().insert(projectProjection).values({
          project_id: proj,
          tenant_id: t.tenant_id,
          account_id: accountId,
          name: 'Test Project',
        });
        // Allocation = 50%, Start Date = 07 Aug 2026, End Date = 18 Aug 2026 (8 working days covered out of 21 working days in August)
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          person_id: personId,
          project_id: proj,
          account_id: accountId,
          date_from: '2026-08-07',
          date_to: '2026-08-18',
          planned_pct: '50',
          bucket: 'billable',
          active: true,
        });

        const grid = await getAllocationGrid(t.adminSession, { year: 2026 });
        const row = grid.rows.find((r) => r.worker_id === personId)!;

        // Aug (m=7): 8 working days / 21 * 50% = 19.05%
        expect(row.months[7]).toBe(19.05);
        expect(row.total_mm).toBe(0.19);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('calculates 1.0 MM for every month and 12.0 MM annual total for a 100% full-year allocation (FUT-903)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const proj = crypto.randomUUID();

        await peopleDb().insert(person).values({
          id: personId,
          tenant_id: t.tenant_id,
          full_name: 'FUT-903 Full Year Resource',
        });
        await peopleDb().insert(projectProjection).values({
          project_id: proj,
          tenant_id: t.tenant_id,
          account_id: accountId,
          name: 'Full Year Project',
        });
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          person_id: personId,
          project_id: proj,
          account_id: accountId,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          planned_pct: '100',
          bucket: 'billable',
          active: true,
        });

        const grid = await getAllocationGrid(t.adminSession, { year: 2026 });
        const row = grid.rows.find((r) => r.worker_id === personId)!;

        // Every month should be 100% planned load
        expect(row.months).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
        // Total MM for the year must equal 12.0
        expect(row.total_mm).toBe(12);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('groups multiple allocation records for the same project into a single row preserving periods (FUT-850)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const projA = crypto.randomUUID();
        const projB = crypto.randomUUID();

        await peopleDb().insert(person).values({
          id: personId,
          tenant_id: t.tenant_id,
          full_name: 'FUT-850 Grouped Resource',
        });
        await peopleDb()
          .insert(projectProjection)
          .values([
            {
              project_id: projA,
              tenant_id: t.tenant_id,
              account_id: accountId,
              name: 'Project Alpha',
            },
            {
              project_id: projB,
              tenant_id: t.tenant_id,
              account_id: accountId,
              name: 'Project Beta',
            },
          ]);
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            // Period 1 on Alpha: Jan 1 - Mar 31 (Q1) at 50%
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personId,
              project_id: projA,
              account_id: accountId,
              date_from: '2026-01-01',
              date_to: '2026-03-31',
              planned_pct: '50',
              bucket: 'billable',
              active: true,
            },
            // Period 2 on Alpha: Jul 1 - Sep 30 (Q3) at 100%
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personId,
              project_id: projA,
              account_id: accountId,
              date_from: '2026-07-01',
              date_to: '2026-09-30',
              planned_pct: '100',
              bucket: 'billable',
              active: true,
            },
            // Single period on Beta: May 1 - Jun 30 at 80%
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personId,
              project_id: projB,
              account_id: accountId,
              date_from: '2026-05-01',
              date_to: '2026-06-30',
              planned_pct: '80',
              bucket: 'internal',
              active: true,
            },
          ]);

        const grid = await getAllocationGrid(t.adminSession, { year: 2026 });
        const workerRows = grid.rows.filter((r) => r.worker_id === personId);

        // Crucial: 2 distinct projects must yield exactly 2 rows (NOT 3 rows)
        expect(workerRows).toHaveLength(2);

        const alphaRow = workerRows.find((r) => r.project_id === projA)!;
        expect(alphaRow).toBeDefined();
        // Jan-Mar: 50%, Apr-Jun: null, Jul-Sep: 100%, Oct-Dec: null
        expect(alphaRow.months).toEqual([
          50,
          50,
          50,
          null,
          null,
          null,
          100,
          100,
          100,
          null,
          null,
          null,
        ]);
        // Total MM: 0.5 * 3 + 1.0 * 3 = 4.5
        expect(alphaRow.total_mm).toBe(4.5);
        expect(alphaRow.bucket).toBe('billable');

        const betaRow = workerRows.find((r) => r.project_id === projB)!;
        expect(betaRow).toBeDefined();
        expect(betaRow.months).toEqual([
          null,
          null,
          null,
          null,
          80,
          80,
          null,
          null,
          null,
          null,
          null,
          null,
        ]);
        expect(betaRow.total_mm).toBe(1.6);
        expect(betaRow.bucket).toBe('internal');
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('groups multiple sequential allocation records for the same project in the same month (FUT-850)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const projA = crypto.randomUUID();

        await peopleDb().insert(person).values({
          id: personId,
          tenant_id: t.tenant_id,
          full_name: 'FUT-850 Intra-Month Resource',
        });
        await peopleDb()
          .insert(projectProjection)
          .values([
            {
              project_id: projA,
              tenant_id: t.tenant_id,
              account_id: accountId,
              name: 'Project Alpha',
            },
          ]);
        // Two sequential allocations in January: Jan 1-15 (60%) and Jan 16-31 (40%)
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personId,
              project_id: projA,
              account_id: accountId,
              date_from: '2026-01-01',
              date_to: '2026-01-15',
              planned_pct: '60',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personId,
              project_id: projA,
              account_id: accountId,
              date_from: '2026-01-16',
              date_to: '2026-01-31',
              planned_pct: '40',
              bucket: 'billable',
              active: true,
            },
          ]);

        const grid = await getAllocationGrid(t.adminSession, { year: 2026 });
        const workerRows = grid.rows.filter((r) => r.worker_id === personId);

        expect(workerRows).toHaveLength(1);
        const row = workerRows[0]!;
        // Jan 2026 has 22 working days (11 in 1-15, 11 in 16-31) -> 60*0.5 + 40*0.5 = 50%
        expect(row.months[0]).toBe(50);
        // MM: (0.6/100)*0.5 + (0.4/100)*0.5 = 0.003 + 0.002 = 0.005 -> 0.5 MM equivalent for Jan
        expect(row.total_mm).toBe(0.5);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
