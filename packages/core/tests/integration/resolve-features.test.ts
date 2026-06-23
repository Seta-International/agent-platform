// packages/core/tests/integration/resolve-features.test.ts
import { OpenFeature } from '@openfeature/server-sdk';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { coreDb, resetCoreDb } from '../../src/db/client.ts';
import { coreFeatureFlagExposure, coreFeatureFlags } from '../../src/db/schema/index.ts';
import { getEffectiveFlag, resetFlagCache } from '../../src/flags/cache.ts';
import { setFlagCatalog } from '../../src/flags/catalog.ts';
import { SetaFeatureProvider } from '../../src/flags/provider.ts';
import { resolveFeatures } from '../../src/flags/resolve-features.ts';
import { createContributionRegistry, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';

afterEach(async () => {
  resetCoreDb();
  await closePools();
});

afterAll(async () => {
  await OpenFeature.clearProviders();
});

describe('resolveFeatures', () => {
  it('resolves the enabled set and upserts exposure rows', async () => {
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
        setFlagCatalog([
          { key: 'hiring', description: 'Hiring' },
          { key: 'people.x', description: 'X' },
        ]);
        await OpenFeature.setProviderAndWait(new SetaFeatureProvider({ getEffectiveFlag }));

        const tenantId = crypto.randomUUID();
        const userId = crypto.randomUUID();
        await coreDb()
          .insert(coreFeatureFlags)
          .values({ key: 'hiring', tenant_id: tenantId, strategies: [{ kind: 'enabled' }] });

        const features = await resolveFeatures(tenantId, userId, []);
        expect(features.has('hiring')).toBe(true);
        expect(features.has('people.x')).toBe(false);

        const rows = await coreDb()
          .select()
          .from(coreFeatureFlagExposure)
          .where(eq(coreFeatureFlagExposure.user_id, userId));
        expect(rows).toHaveLength(2); // one row per catalog key
        const hiringRow = rows.find((r) => r.flag_key === 'hiring');
        expect(hiringRow?.result).toBe(true);
      },
    );
  });

  it('returns the enabled set even when the exposure upsert fails (fail-open)', async () => {
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
        setFlagCatalog([{ key: 'hiring', description: 'Hiring' }]);
        await OpenFeature.setProviderAndWait(new SetaFeatureProvider({ getEffectiveFlag }));

        const tenantId = crypto.randomUUID();
        const userId = crypto.randomUUID();
        await coreDb()
          .insert(coreFeatureFlags)
          .values({ key: 'hiring', tenant_id: tenantId, strategies: [{ kind: 'enabled' }] });

        // Drop the exposure table to force the upsert to throw.
        await pool.query('DROP TABLE core.feature_flag_exposure');

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          const features = await resolveFeatures(tenantId, userId, []);
          expect(features.has('hiring')).toBe(true);
          expect(warnSpy).toHaveBeenCalledOnce();
        } finally {
          warnSpy.mockRestore();
        }
      },
    );
  });
});
