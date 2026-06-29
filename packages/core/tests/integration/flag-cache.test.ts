// packages/core/tests/integration/flag-cache.test.ts
import { registerIdentityContributions } from '@seta/identity/register';
import { initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { coreDb, resetCoreDb } from '../../src/db/client.ts';
import { coreFeatureFlags } from '../../src/db/schema/index.ts';
import { evictTenantFlags, getEffectiveFlag, resetFlagCache } from '../../src/flags/cache.ts';
import { createContributionRegistry, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';

describe('flag-row cache', () => {
  it('prefers the tenant row over the global default and reflects writes after eviction', async () => {
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
        resetFlagCache();

        const tenantId = crypto.randomUUID();
        await coreDb()
          .insert(coreFeatureFlags)
          .values({ key: 'hiring', tenant_id: null, strategies: [] });

        // Only global row exists → effective is the global row.
        expect((await getEffectiveFlag(tenantId, 'hiring'))?.tenant_id).toBeNull();
        expect(await getEffectiveFlag(tenantId, 'people.x')).toBeUndefined();

        // Add a tenant override; cache is stale until evicted.
        await coreDb()
          .insert(coreFeatureFlags)
          .values({ key: 'hiring', tenant_id: tenantId, strategies: [{ kind: 'enabled' }] });
        expect((await getEffectiveFlag(tenantId, 'hiring'))?.tenant_id).toBeNull();

        evictTenantFlags(tenantId);
        expect((await getEffectiveFlag(tenantId, 'hiring'))?.tenant_id).toBe(tenantId);
      },
    );
  });
});
