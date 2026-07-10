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
import { getUtilizationByPerson } from '../../src/backend/domain/utilization.ts';
import { buildSession, inScope, seedPersons, seedTenant } from '../helpers.ts';

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
        await inScope(t.adminSession, async () => {
          const personId = crypto.randomUUID();
          const accountId = crypto.randomUUID();
          const projA = crypto.randomUUID();
          const projB = crypto.randomUUID();

          await seedPersons(t.tenant_id, personId);
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
                date_to: '2026-12-31',
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
                worker_id: personId,
                project_id: crypto.randomUUID(),
                account_id: accountId,
                account_name: 'Acme',
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
          expect(row.split).toEqual({ billable: 80, internal: 40, bench: 0 });
        });
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
        await inScope(t.adminSession, async () => {
          const stranger = crypto.randomUUID();
          await seedPersons(t.tenant_id, stranger);
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
          // Non-privileged viewer: holds people.worker.read (not .all), unlinked → no rows.
          const memberSession = buildSession({
            tenant_id: t.tenant_id,
            user_id: crypto.randomUUID(),
            roles: ['people.viewer'],
          });
          const util = await getUtilizationByPerson(memberSession, { asOf: '2026-06-15' });
          expect(util.rows.find((r) => r.worker_id === stranger)).toBeUndefined();
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
