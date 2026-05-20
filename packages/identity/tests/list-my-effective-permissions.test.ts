import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { listMyEffectivePermissions } from '../src/index.ts';
import { registerIdentityContributions } from '../src/register.ts';
import { createTestTenantWithAdmin } from '../src/testing/index.ts';

describe('listMyEffectivePermissions', () => {
  it('returns a sorted, deduplicated permission list for an org.admin', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          await runMigrations(reg, { pool });
          const { admin_user_id } = await createTestTenantWithAdmin({ pool });
          const perms = await listMyEffectivePermissions({
            user_id: admin_user_id,
            type: 'user',
          });
          expect(Array.isArray(perms)).toBe(true);
          expect(perms.length).toBeGreaterThan(0);
          expect(perms).toEqual([...new Set(perms)]);
          const sorted = [...perms].sort();
          expect(perms).toEqual(sorted);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns [] for a non-user actor', async () => {
    expect(await listMyEffectivePermissions({ user_id: null, type: 'cli' })).toEqual([]);
  });
});
