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
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
