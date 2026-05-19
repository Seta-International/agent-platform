import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { getUserProfile } from '../../src/backend/domain/get-user-profile.ts';
import { registerIdentityContributions } from '../../src/register.ts';

describe('getUserProfile', () => {
  it('returns the profile merged with identity.user fields', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          await runMigrations(reg, { pool });

          const { user_id } = await createUser(
            { tenant_id: tenantId, email: 'a@d.local', name: 'A', password: 'demo-password-1234' },
            { type: 'cli', user_id: null },
          );

          const profile = await getUserProfile(user_id);
          expect(profile?.display_name).toBe('A');
          expect(profile?.email).toBe('a@d.local');
          expect(profile?.tenant_id).toBe(tenantId);
          expect(profile?.availability_status).toBe('available');
          expect(profile?.timezone).toBe('UTC');
          expect(profile?.skills).toEqual([]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null when the user does not exist', async () => {
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

          const result = await getUserProfile(crypto.randomUUID());
          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
