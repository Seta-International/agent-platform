import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { account } from '../../src/backend/db/schema.ts';
import { assertSameTenant, tenantScoped } from '../../src/backend/db/scope.ts';
import { createAccount } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('pm org isolation', () => {
  it('never returns another tenant rows and rejects cross-tenant reads', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const orgA = await seedTenant(pool);
        const orgB = await seedTenant(pool);

        const { account_id } = await createAccount({
          name: 'Org A account',
          session: orgA.adminSession,
        });

        const visibleToB = await pmDb()
          .select()
          .from(account)
          .where(
            and(eq(account.id, account_id), tenantScoped(account.tenant_id, orgB.adminSession)),
          );
        expect(visibleToB).toHaveLength(0);

        const [rowA] = await pmDb().select().from(account).where(eq(account.id, account_id));
        expect(() => assertSameTenant(rowA!, orgB.adminSession)).toThrow(/another tenant/i);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
