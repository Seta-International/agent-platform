import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { whoAmI } from '../src/index.ts';
import { registerIdentityContributions } from '../src/register.ts';
import { createTestTenantWithAdmin } from '../src/testing/index.ts';

describe('whoAmI', () => {
  it("returns the caller's own profile", async () => {
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
          const profile = await whoAmI({ user_id: admin_user_id, type: 'user' });
          expect(profile).not.toBeNull();
          expect(profile?.user_id).toBe(admin_user_id);
          expect(profile?.email).toBe('admin@demo.local');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null for a non-user actor', async () => {
    const profile = await whoAmI({ user_id: null, type: 'cli' });
    expect(profile).toBeNull();
  });
});
