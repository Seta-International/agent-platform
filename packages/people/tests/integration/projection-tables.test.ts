import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  projectProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const T1 = '00000000-0000-0000-0000-000000000001';
const ACCT = '00000000-0000-0000-0000-000000000002';
const PROJ = '00000000-0000-0000-0000-000000000003';
const ALLOC = '00000000-0000-0000-0000-000000000004';
const WORKER = '00000000-0000-0000-0000-000000000005';

describe('people projection tables', () => {
  it('includes the three new projection tables in the schema', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const r = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='people' ORDER BY 1`,
      );
      const names = r.rows.map((x: { table_name: string }) => x.table_name);
      expect(names).toContain('worker_allocation_projection');
      expect(names).toContain('account_projection');
      expect(names).toContain('project_projection');
    });
  });

  it('account_projection: round-trip insert and upsert', async () => {
    await withTestDb(ctx, async ({ databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const db = peopleDb();
        await db.insert(accountProjection).values({
          account_id: ACCT,
          tenant_id: T1,
          name: 'Acme Corp',
        });
        const [row] = await db
          .select()
          .from(accountProjection)
          .where(eq(accountProjection.account_id, ACCT));
        expect(row?.name).toBe('Acme Corp');

        await db
          .insert(accountProjection)
          .values({ account_id: ACCT, tenant_id: T1, name: 'Acme Corp Renamed' })
          .onConflictDoUpdate({
            target: accountProjection.account_id,
            set: { name: 'Acme Corp Renamed' },
          });
        const [updated] = await db
          .select()
          .from(accountProjection)
          .where(eq(accountProjection.account_id, ACCT));
        expect(updated?.name).toBe('Acme Corp Renamed');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('project_projection: round-trip insert and upsert', async () => {
    await withTestDb(ctx, async ({ databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const db = peopleDb();
        await db.insert(projectProjection).values({
          project_id: PROJ,
          tenant_id: T1,
          account_id: ACCT,
          name: 'Alpha Project',
        });
        const [row] = await db
          .select()
          .from(projectProjection)
          .where(eq(projectProjection.project_id, PROJ));
        expect(row?.name).toBe('Alpha Project');
        expect(row?.account_id).toBe(ACCT);

        await db
          .insert(projectProjection)
          .values({ project_id: PROJ, tenant_id: T1, account_id: ACCT, name: 'Alpha Renamed' })
          .onConflictDoUpdate({
            target: projectProjection.project_id,
            set: { name: 'Alpha Renamed' },
          });
        const [updated] = await db
          .select()
          .from(projectProjection)
          .where(eq(projectProjection.project_id, PROJ));
        expect(updated?.name).toBe('Alpha Renamed');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('worker_allocation_projection: round-trip insert and upsert', async () => {
    await withTestDb(ctx, async ({ databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const db = peopleDb();
        await db.insert(workerAllocationProjection).values({
          allocation_id: ALLOC,
          tenant_id: T1,
          worker_id: WORKER,
          project_id: PROJ,
          account_id: ACCT,
          account_name: 'Acme Corp',
          lead_worker_id: null,
          active: true,
        });
        const [row] = await db
          .select()
          .from(workerAllocationProjection)
          .where(eq(workerAllocationProjection.allocation_id, ALLOC));
        expect(row?.account_name).toBe('Acme Corp');
        expect(row?.active).toBe(true);
        expect(row?.worker_id).toBe(WORKER);

        await db
          .insert(workerAllocationProjection)
          .values({
            allocation_id: ALLOC,
            tenant_id: T1,
            worker_id: WORKER,
            project_id: PROJ,
            account_id: ACCT,
            account_name: 'Acme Corp Renamed',
            active: false,
          })
          .onConflictDoUpdate({
            target: workerAllocationProjection.allocation_id,
            set: { account_name: 'Acme Corp Renamed', active: false },
          });
        const [updated] = await db
          .select()
          .from(workerAllocationProjection)
          .where(eq(workerAllocationProjection.allocation_id, ALLOC));
        expect(updated?.account_name).toBe('Acme Corp Renamed');
        expect(updated?.active).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('projection indexes exist', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const r = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='people' AND indexname IN (
          'worker_alloc_by_worker','worker_alloc_by_account','worker_alloc_by_project','project_proj_by_account'
        ) ORDER BY 1`,
      );
      const names = r.rows.map((x: { indexname: string }) => x.indexname);
      expect(names).toContain('worker_alloc_by_worker');
      expect(names).toContain('worker_alloc_by_account');
      expect(names).toContain('worker_alloc_by_project');
      expect(names).toContain('project_proj_by_account');
    });
  });
});
