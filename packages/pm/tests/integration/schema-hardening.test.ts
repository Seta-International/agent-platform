import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { account, project } from '../../src/backend/db/schema.ts';
import { createAccount } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('pm schema hardening', () => {
  it('aggregates carry version=1 by default and project supports soft-delete', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { account_id } = await createAccount({ name: 'A', session: t.adminSession });

        const [acc] = await pmDb().select().from(account).where(eq(account.id, account_id));
        expect(acc?.version).toBe(1);

        const [proj] = await pmDb()
          .insert(project)
          .values({ tenant_id: t.tenant_id, account_id, name: 'P' })
          .returning();
        expect(proj?.version).toBe(1);
        expect(proj?.deleted_at).toBeNull();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('indexes the allocation hot read path by (tenant_id, worker_id)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      initPools({ databaseUrl });
      try {
        const r = await pool.query(
          `SELECT indexname FROM pg_indexes WHERE schemaname = 'pm' AND indexname = 'allocation_by_worker'`,
        );
        expect(r.rows).toHaveLength(1);
      } finally {
        await closePools();
      }
    });
  });
});
