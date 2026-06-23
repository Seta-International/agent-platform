// packages/core/tests/integration/apply-feature-flag.test.ts
import { registerIdentityContributions } from '@seta/identity/register';
import { initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { coreDb, resetCoreDb } from '../../src/db/client.ts';
import { coreEvents } from '../../src/db/schema/events.ts';
import { coreFeatureFlags } from '../../src/db/schema/index.ts';
import { applyFeatureFlag, FlagError } from '../../src/flags/apply-feature-flag.ts';
import { resetFlagCache } from '../../src/flags/cache.ts';
import { setFlagCatalog } from '../../src/flags/catalog.ts';
import { createContributionRegistry, runMigrations } from '../../src/index.ts';
import { registerCoreContributions } from '../../src/register.ts';

describe('applyFeatureFlag', () => {
  it('validates, upserts the row, and emits the event in one txn', async () => {
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

        const tenantId = crypto.randomUUID();
        const actor = crypto.randomUUID();

        await expect(
          applyFeatureFlag({ tenantId, key: 'nope', strategies: [], actorUserId: actor }),
        ).rejects.toBeInstanceOf(FlagError);
        await expect(
          applyFeatureFlag({
            tenantId,
            key: 'hiring',
            strategies: [{ kind: 'percentage' }],
            actorUserId: actor,
          }),
        ).rejects.toBeInstanceOf(FlagError);

        await applyFeatureFlag({
          tenantId,
          key: 'hiring',
          strategies: [{ kind: 'enabled' }],
          actorUserId: actor,
        });
        // Upsert: second call updates the same row, not a duplicate.
        await applyFeatureFlag({
          tenantId,
          key: 'hiring',
          strategies: [{ kind: 'member-allowlist', config: { userIds: [actor] } }],
          actorUserId: actor,
        });

        const rows = await coreDb()
          .select()
          .from(coreFeatureFlags)
          .where(and(eq(coreFeatureFlags.key, 'hiring'), eq(coreFeatureFlags.tenant_id, tenantId)));
        expect(rows).toHaveLength(1);
        expect(rows[0].strategies[0].kind).toBe('member-allowlist');

        const events = await coreDb()
          .select()
          .from(coreEvents)
          .where(eq(coreEvents.eventType, 'core.feature_flag.updated'));
        expect(events.length).toBe(2);
      },
    );
  });
});
