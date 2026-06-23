// packages/core/tests/integration/flag-invalidation.test.ts
import { registerIdentityContributions } from '@seta/identity/register';
import { initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { coreDb, resetCoreDb } from '../../src/db/client.ts';
import { coreFeatureFlags } from '../../src/db/schema/index.ts';
import { getEffectiveFlag, resetFlagCache } from '../../src/flags/cache.ts';
import { setFlagCatalog } from '../../src/flags/catalog.ts';
import { featureFlagCacheInvalidateSubscriber } from '../../src/flags/subscriber.ts';
import { createContributionRegistry, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';

describe('feature flag cache-invalidation subscriber', () => {
  it('proves evictTenantFlags runs on tenant event and resetFlagCache runs on global event', async () => {
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

        expect(featureFlagCacheInvalidateSubscriber.event).toBe('core.feature_flag.updated');

        const tenantId = crypto.randomUUID();
        setFlagCatalog([{ key: 'hiring', description: 'H' }]);

        // --- TENANT branch ---
        // Seed a global row
        await coreDb()
          .insert(coreFeatureFlags)
          .values({ key: 'hiring', tenant_id: null, strategies: [] });

        // Warm the cache; returns global row (tenant_id null)
        expect((await getEffectiveFlag(tenantId, 'hiring'))?.tenant_id).toBeNull();

        // Insert tenant override directly — cache is stale
        await coreDb()
          .insert(coreFeatureFlags)
          .values({ key: 'hiring', tenant_id: tenantId, strategies: [{ kind: 'enabled' }] });

        // Still returns global (stale cache)
        expect((await getEffectiveFlag(tenantId, 'hiring'))?.tenant_id).toBeNull();

        // Invoke subscriber with a tenant event
        await featureFlagCacheInvalidateSubscriber.handler(
          {
            id: crypto.randomUUID(),
            occurredAt: new Date(),
            tenantId,
            aggregateType: 'core.feature_flag',
            aggregateId: 'hiring',
            eventType: 'core.feature_flag.updated',
            eventVersion: 1,
            payload: { tenant_id: tenantId, key: 'hiring' },
          } as never,
          { tx: null as never },
        );

        // Cache evicted — now returns tenant row
        expect((await getEffectiveFlag(tenantId, 'hiring'))?.tenant_id).toBe(tenantId);

        // --- GLOBAL branch ---
        // Use a distinct tenant + key with no tenant override so getEffectiveFlag
        // resolves through the global row only.
        const tenant2 = crypto.randomUUID();
        setFlagCatalog([
          { key: 'hiring', description: 'H' },
          { key: 'people', description: 'P' },
        ]);
        await coreDb()
          .insert(coreFeatureFlags)
          .values({ key: 'people', tenant_id: null, strategies: [] });

        // Warm cache for tenant2/people — hits the global row (strategies: [])
        resetFlagCache();
        expect((await getEffectiveFlag(tenant2, 'people'))?.strategies).toEqual([]);

        // Update global row's strategies in DB — cache still stale
        await coreDb()
          .update(coreFeatureFlags)
          .set({ strategies: [{ kind: 'enabled' }] })
          .where(and(isNull(coreFeatureFlags.tenant_id), eq(coreFeatureFlags.key, 'people')));

        // Cache still stale: returns old strategies
        expect((await getEffectiveFlag(tenant2, 'people'))?.strategies).toEqual([]);

        // Invoke subscriber with a global event (tenant_id: null)
        await featureFlagCacheInvalidateSubscriber.handler(
          {
            id: crypto.randomUUID(),
            occurredAt: new Date(),
            tenantId: null,
            aggregateType: 'core.feature_flag',
            aggregateId: 'people',
            eventType: 'core.feature_flag.updated',
            eventVersion: 1,
            payload: { tenant_id: null, key: 'people' },
          } as never,
          { tx: null as never },
        );

        // Cache cleared — now reflects the updated global row
        expect((await getEffectiveFlag(tenant2, 'people'))?.strategies).toEqual([
          { kind: 'enabled' },
        ]);
      },
    );
  });
});
