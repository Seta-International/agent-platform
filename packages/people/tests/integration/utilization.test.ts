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
import { getUtilizationByPerson } from '../../src/backend/domain/utilization.ts';
import { buildSession, linkUserToPerson, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('getUtilizationByPerson', () => {
  it('groups active allocations into segments, total, over-flag, and bucket split', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
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
          full_name: 'Pat Lin',
          employee_no: '6885',
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
              date_to: '2026-12-31',
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
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '40',
              bucket: 'internal',
              active: true,
            },
            // inactive as-of 2026-06-15 → excluded
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personId,
              project_id: crypto.randomUUID(),
              account_id: accountId,
              date_from: '2025-01-01',
              date_to: '2025-12-31',
              planned_pct: '50',
              bucket: 'bench',
              active: true,
            },
          ]);

        const util = await getUtilizationByPerson(t.adminSession, { asOf: '2026-06-15' });
        const row = util.rows.find((r) => r.worker_id === personId)!;
        expect(row.segments).toHaveLength(2);
        expect(row.total_pct).toBe(120);
        expect(row.over_allocated).toBe(true);
        expect(row.employee_no).toBe('6885');
        expect(row.split).toEqual({ billable: 80, internal: 40, bench: 0 });
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
        // Non-privileged viewer: holds people.worker.read (not .all), unlinked → no rows.
        const memberSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
        });
        const util = await getUtilizationByPerson(memberSession, { asOf: '2026-06-15' });
        expect(util.rows.find((r) => r.worker_id === stranger)).toBeUndefined();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('AM utilization segments exclude non-managed accounts (FUT-342)', async () => {
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
          session: buildSession({
            tenant_id: t.tenant_id,
            user_id: crypto.randomUUID(),
            roles: ['pm.manager'],
            assignments: [{ role_slug: 'pm.manager', scope_kind: 'tenant', scope_id: null }],
          }),
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
          session: buildSession({
            tenant_id: t.tenant_id,
            user_id: crypto.randomUUID(),
            roles: ['pm.manager'],
            assignments: [{ role_slug: 'pm.manager', scope_kind: 'tenant', scope_id: null }],
          }),
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
        const util = await getUtilizationByPerson(amSession, { asOf: '2026-06-15' });
        const row = util.rows.find((r) => r.worker_id === worker)!;
        expect(row.segments).toHaveLength(1);
        expect(row.segments[0]!.project_id).toBe(projGranted);
        expect(row.total_pct).toBe(60);

        const cross = await getUtilizationByPerson(amSession, {
          asOf: '2026-06-15',
          crossProject: true,
        });
        const crossRow = cross.rows.find((r) => r.worker_id === worker)!;
        expect(crossRow.segments).toHaveLength(2);
        expect(crossRow.total_pct).toBe(110);
        expect(cross.rows.find((r) => r.worker_id === otherAm)).toBeUndefined();
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('includes persons with no allocations as idle with 0% total (AC2 / FUT-339)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const allocatedWorker = crypto.randomUUID();
        const idleWorker = crypto.randomUUID();
        const projA = crypto.randomUUID();
        const accountId = crypto.randomUUID();

        await peopleDb()
          .insert(person)
          .values([
            {
              id: allocatedWorker,
              tenant_id: t.tenant_id,
              full_name: 'Allocated Worker',
              employee_no: 'A100',
            },
            {
              id: idleWorker,
              tenant_id: t.tenant_id,
              full_name: 'Idle Worker',
              employee_no: 'I200',
            },
          ]);

        await peopleDb()
          .insert(projectProjection)
          .values([
            { project_id: projA, tenant_id: t.tenant_id, account_id: accountId, name: 'Alpha' },
          ]);

        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: allocatedWorker,
              project_id: projA,
              account_id: accountId,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '100',
              bucket: 'billable',
              active: true,
            },
          ]);

        const util = await getUtilizationByPerson(t.adminSession, { asOf: '2026-06-15' });
        expect(util.rows).toHaveLength(2);

        const idleRow = util.rows.find((r) => r.worker_id === idleWorker)!;
        expect(idleRow).toBeDefined();
        expect(idleRow.full_name).toBe('Idle Worker');
        expect(idleRow.employee_no).toBe('I200');
        expect(idleRow.total_pct).toBe(0);
        expect(idleRow.segments).toEqual([]);
        expect(idleRow.over_allocated).toBe(false);
        expect(idleRow.split).toEqual({ billable: 0, internal: 0, bench: 0 });

        // Under-utilized filter includes idle workers
        const underUtil = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-06-15',
          status: 'under',
        });
        expect(underUtil.rows.some((r) => r.worker_id === idleWorker)).toBe(true);

        // Over-allocated filter excludes idle workers
        const overUtil = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-06-15',
          status: 'over',
        });
        expect(overUtil.rows.some((r) => r.worker_id === idleWorker)).toBe(false);

        // Search by employee ID finds the idle worker
        const searchUtil = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-06-15',
          search: 'I200',
        });
        expect(searchUtil.rows).toHaveLength(1);
        expect(searchUtil.rows[0]!.worker_id).toBe(idleWorker);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('calculates utilization from calendar working-day effort and applies filters (FUT-911)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personA = crypto.randomUUID();
        const personB = crypto.randomUUID();
        const personC = crypto.randomUUID();
        const personD = crypto.randomUUID();
        const personE = crypto.randomUUID();
        const account1 = crypto.randomUUID();
        const account2 = crypto.randomUUID();
        const account3 = crypto.randomUUID();
        const projAlpha = crypto.randomUUID();
        const projBeta = crypto.randomUUID();
        const projGamma = crypto.randomUUID();

        await peopleDb()
          .insert(person)
          .values([
            { id: personA, tenant_id: t.tenant_id, full_name: 'Alex Pro', employee_no: 'E101' },
            { id: personB, tenant_id: t.tenant_id, full_name: 'Bao Junior', employee_no: 'E102' },
            {
              id: personC,
              tenant_id: t.tenant_id,
              full_name: 'Hoàng Tuấn Kiệt',
              employee_no: '7138',
            },
            { id: personD, tenant_id: t.tenant_id, full_name: 'Donna Future', employee_no: 'E104' },
            { id: personE, tenant_id: t.tenant_id, full_name: 'Evan Outside', employee_no: 'E105' },
          ]);

        await peopleDb()
          .insert(projectProjection)
          .values([
            { project_id: projAlpha, tenant_id: t.tenant_id, account_id: account1, name: 'Alpha' },
            { project_id: projBeta, tenant_id: t.tenant_id, account_id: account2, name: 'Beta' },
            { project_id: projGamma, tenant_id: t.tenant_id, account_id: account3, name: 'Gamma' },
          ]);

        // In August 2026: 21 working days (Aug 1 to Aug 31)
        // Person A: 100% full year on Alpha (100% effort in August) + 50% on Beta from Aug 1 to Aug 14 (10 working days / 21 = 47.62% -> 50 * 10/21 = 23.81%) -> total 123.81% (over-allocated)
        // Person B: 60% full year on Beta (60% effort in August) -> total 60% (under-utilized)
        // Person C: 100% on Alpha Jan 1 to Jul 25 (0% in August) -> total 0% (under-utilized / idle in August)
        // Person D: 100% on Alpha Sep 1 to Dec 31 (future start -> 0% in August) -> total 0% (under-utilized / idle in August)
        // Person E: 100% full year on Gamma (account3) -> total 100%
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personA,
              project_id: projAlpha,
              account_id: account1,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '100',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personA,
              project_id: projBeta,
              account_id: account2,
              date_from: '2026-08-01',
              date_to: '2026-08-14',
              planned_pct: '50',
              bucket: 'internal',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personB,
              project_id: projBeta,
              account_id: account2,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '60',
              bucket: 'internal',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personC,
              project_id: projAlpha,
              account_id: account1,
              date_from: '2026-01-01',
              date_to: '2026-07-25',
              planned_pct: '100',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personD,
              project_id: projAlpha,
              account_id: account1,
              date_from: '2026-09-01',
              date_to: '2026-12-31',
              planned_pct: '100',
              bucket: 'billable',
              active: true,
            },
            {
              allocation_id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              person_id: personE,
              project_id: projGamma,
              account_id: account3,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '100',
              bucket: 'billable',
              active: true,
            },
          ]);

        // 1. Effort calculation in August 2026 (All view)
        const augUtil = await getUtilizationByPerson(t.adminSession, { asOf: '2026-08-15' });
        expect(augUtil.rows).toHaveLength(5);
        const rowA = augUtil.rows.find((r) => r.worker_id === personA)!;
        expect(rowA).toBeDefined();
        expect(rowA.segments).toHaveLength(2);
        const segAlpha = rowA.segments.find((s) => s.project_id === projAlpha)!;
        const segBeta = rowA.segments.find((s) => s.project_id === projBeta)!;
        expect(segAlpha.pct).toBe(100);
        // Aug 1 to Aug 14: 10 working days / 21 working days in Aug = 23.81%
        expect(segBeta.pct).toBeCloseTo(23.81, 1);
        expect(rowA.total_pct).toBeCloseTo(123.81, 1);
        expect(rowA.over_allocated).toBe(true);

        // 2. Filter by search: "kiệt" (accent-insensitive)
        const searchUtil = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-08-15',
          search: 'kiet',
        });
        expect(searchUtil.rows).toHaveLength(1);
        expect(searchUtil.rows[0]!.worker_id).toBe(personC);
        expect(searchUtil.rows[0]!.employee_no).toBe('7138');
        expect(searchUtil.rows[0]!.total_pct).toBe(0);

        // 3. Filter by status: 'over'
        const overUtil = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-08-15',
          status: 'over',
        });
        expect(overUtil.rows).toHaveLength(1);
        expect(overUtil.rows[0]!.worker_id).toBe(personA);

        // 4. Filter by status: 'under'
        const underUtil = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-08-15',
          status: 'under',
        });
        expect(underUtil.rows).toHaveLength(3);
        expect(new Set(underUtil.rows.map((r) => r.worker_id))).toEqual(
          new Set([personB, personC, personD]),
        );

        // 5. Filter by account: account1
        const accUtil = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-08-15',
          accountId: account1,
        });
        expect(accUtil.rows).toHaveLength(3);
        const accRowA = accUtil.rows.find((r) => r.worker_id === personA)!;
        expect(accRowA.segments).toHaveLength(1);
        expect(accRowA.segments[0]!.project_id).toBe(projAlpha);
        expect(accRowA.total_pct).toBe(100);
        const accRowC = accUtil.rows.find((r) => r.worker_id === personC)!;
        expect(accRowC.segments).toHaveLength(0);
        expect(accRowC.total_pct).toBe(0);
        const accRowD = accUtil.rows.find((r) => r.worker_id === personD)!;
        expect(accRowD.segments).toHaveLength(0);
        expect(accRowD.total_pct).toBe(0);

        // 5b. Combined status=over with accountId: account2
        // Person A is over-allocated (123.81% overall). Filtering account2 must still return Person A's account2 segment!
        const overAcc2 = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-08-15',
          status: 'over',
          accountId: account2,
        });
        expect(overAcc2.rows).toHaveLength(1);
        expect(overAcc2.rows[0]!.worker_id).toBe(personA);
        expect(overAcc2.rows[0]!.segments).toHaveLength(1);
        expect(overAcc2.rows[0]!.segments[0]!.project_id).toBe(projBeta);
        expect(overAcc2.rows[0]!.over_allocated).toBe(true);

        // 5c. Combined status=under with projectId: projAlpha
        // Person C (past Jan-Jul) and Person D (future Sep-Dec) are both under-utilized in August (0%).
        // Person A (100% Alpha, 123.81% overall) and Person E (on Gamma) are excluded.
        const underProjAlpha = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-08-15',
          status: 'under',
          projectId: projAlpha,
        });
        expect(underProjAlpha.rows).toHaveLength(2);
        expect(new Set(underProjAlpha.rows.map((r) => r.worker_id))).toEqual(
          new Set([personC, personD]),
        );
        expect(underProjAlpha.rows.every((r) => r.total_pct === 0)).toBe(true);

        // 5d. Search + projectId + status=under
        const searchUnderProj = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-08-15',
          search: '7138',
          status: 'under',
          projectId: projAlpha,
        });
        expect(searchUnderProj.rows).toHaveLength(1);
        expect(searchUnderProj.rows[0]!.worker_id).toBe(personC);
        expect(searchUnderProj.rows[0]!.full_name).toBe('Hoàng Tuấn Kiệt');
        expect(searchUnderProj.rows[0]!.total_pct).toBe(0);

        // 5e. Cross-project view with projectId: projBeta
        // Person A matches projBeta and has crossProject: true -> shows both Alpha (100%) and Beta (23.81%) segments!
        // Person B matches projBeta -> shows Beta (60%) segment!
        // Persons C, D, E do not belong to projBeta -> excluded.
        const crossProjBeta = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-08-15',
          projectId: projBeta,
          crossProject: true,
        });
        expect(crossProjBeta.rows).toHaveLength(2);
        const crossRowA = crossProjBeta.rows.find((r) => r.worker_id === personA)!;
        expect(crossRowA.segments).toHaveLength(2);
        expect(crossRowA.total_pct).toBeCloseTo(123.81, 1);
        const crossRowB = crossProjBeta.rows.find((r) => r.worker_id === personB)!;
        expect(crossRowB.segments).toHaveLength(1);
        expect(crossRowB.total_pct).toBe(60);

        // 6. Filter by bucket
        const billableUtil = await getUtilizationByPerson(t.adminSession, {
          asOf: '2026-08-15',
          bucket: 'billable',
        });
        expect(billableUtil.rows).toHaveLength(4);
        expect(new Set(billableUtil.rows.map((r) => r.worker_id))).toEqual(
          new Set([personA, personC, personD, personE]),
        );
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
