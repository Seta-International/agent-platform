import { registerIdentityContributions } from '@seta/identity/register';
import { initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { coreDb, resetCoreDb } from '../../src/db/client.ts';
import { coreFeatureFlagExposure, coreFeatureFlags } from '../../src/db/schema/index.ts';
import { createContributionRegistry, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';

describe('feature flag tables', () => {
  it('stores a tenant row and a global (null-tenant) row side by side', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        resetCoreDb();
        initPools({ databaseUrl });

        const tenantId = crypto.randomUUID();
        await coreDb()
          .insert(coreFeatureFlags)
          .values([
            { key: 'hiring', tenant_id: tenantId, strategies: [{ kind: 'enabled' }] },
            { key: 'hiring', tenant_id: null, strategies: [] },
          ]);

        const rows = await coreDb().select().from(coreFeatureFlags);
        expect(rows).toHaveLength(2);

        const userId = crypto.randomUUID();
        await coreDb()
          .insert(coreFeatureFlagExposure)
          .values({ flag_key: 'hiring', tenant_id: tenantId, user_id: userId, result: true });
        // PK (flag_key, user_id): re-insert with onConflict updates result
        await coreDb()
          .insert(coreFeatureFlagExposure)
          .values({ flag_key: 'hiring', tenant_id: tenantId, user_id: userId, result: false })
          .onConflictDoUpdate({
            target: [coreFeatureFlagExposure.flag_key, coreFeatureFlagExposure.user_id],
            set: { result: false, last_evaluated_at: sql`now()` },
          });
        const exp = await coreDb().select().from(coreFeatureFlagExposure);
        expect(exp).toHaveLength(1);
        expect(exp[0].result).toBe(false);
      },
    );
  });
});
