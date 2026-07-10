import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { orgUnit, worker } from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { inScope, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('org_unit schema', () => {
  it('stores a unit with a head and a worker org_unit_id membership; worker has no manager_id column', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await inScope(t.adminSession, async () => {
          const { worker_id: headPid } = await createWorker({
            session: t.adminSession,
            full_name: 'Unit Head',
          } as never);

          const [u] = await peopleDb()
            .insert(orgUnit)
            .values({
              tenant_id: t.tenant_id,
              parent_id: null,
              name: 'Operation',
              kind: 'operation',
              head_worker_id: headPid,
              sort: 0,
            })
            .returning();
          expect(u!.id).toBeTruthy();

          await peopleDb()
            .update(worker)
            .set({ org_unit_id: u!.id })
            .where(eq(worker.person_id, headPid));
          const [row] = await peopleDb()
            .select({ ou: worker.org_unit_id })
            .from(worker)
            .where(eq(worker.person_id, headPid));
          expect(row!.ou).toBe(u!.id);
        });

        const cols = await pool.query(
          `SELECT column_name FROM information_schema.columns
             WHERE table_schema='people' AND table_name='worker' AND column_name='manager_id'`,
        );
        expect(cols.rowCount).toBe(0);
      } finally {
        resetPeopleDb();
        await closePools();
      }
    });
  });
});
