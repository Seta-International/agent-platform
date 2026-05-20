import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { getUserProfile, updateMyDisplayName } from '../src/index.ts';
import { registerIdentityContributions } from '../src/register.ts';
import { createTestTenantWithAdmin } from '../src/testing/index.ts';

describe('updateMyDisplayName', () => {
  it("updates the actor's own display name", async () => {
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
          await updateMyDisplayName(
            { user_id: admin_user_id, type: 'user' },
            { displayName: 'Renamed Admin' },
          );
          const profile = await getUserProfile(admin_user_id);
          expect(profile?.display_name).toBe('Renamed Admin');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects empty display names', async () => {
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
          await expect(
            updateMyDisplayName({ user_id: admin_user_id, type: 'user' }, { displayName: '   ' }),
          ).rejects.toThrow();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects when actor.type is not user', async () => {
    await expect(
      updateMyDisplayName({ user_id: null, type: 'cli' }, { displayName: 'cli call' }),
    ).rejects.toThrow(/unauthenticated/i);
  });
});
