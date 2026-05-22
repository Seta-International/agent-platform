import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { deactivateUser } from '../../src/backend/domain/deactivate-user.ts';
import { getUserProfileForEmbedding } from '../../src/backend/domain/get-user-profile-for-embedding.ts';
import { updateUserProfile } from '../../src/backend/domain/update-user-profile.ts';
import { registerIdentityContributions } from '../../src/register.ts';

async function setup(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  databaseUrl: string,
) {
  const reg = createContributionRegistry();
  registerCoreContributions(reg);
  registerIdentityContributions(reg);
  await runMigrations(reg, { pool: pool as Parameters<typeof runMigrations>[1]['pool'] });
  initPools({ databaseUrl });
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenantId,
    'Demo',
    `t-${tenantId.slice(0, 8)}`,
  ]);
  const { user_id } = await createUser(
    {
      tenant_id: tenantId,
      email: `u-${tenantId.slice(0, 8)}@d.local`,
      name: 'U',
      password: 'demo-password-1234',
    },
    { type: 'cli', user_id: null },
  );
  return { tenantId, userId: user_id };
}

describe('getUserProfileForEmbedding', () => {
  it('returns skills for an active user with skills', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId, userId } = await setup(pool, databaseUrl);
        try {
          await updateUserProfile(
            userId,
            { skills: ['terraform', 'kubernetes'] },
            { type: 'user', user_id: userId },
          );

          const result = await getUserProfileForEmbedding({ tenant_id: tenantId, user_id: userId });

          expect(result).not.toBeNull();
          expect(result?.skills).toEqual(['kubernetes', 'terraform']);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns { skills: [] } for an active user with no skills', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId, userId } = await setup(pool, databaseUrl);
        try {
          const result = await getUserProfileForEmbedding({ tenant_id: tenantId, user_id: userId });

          expect(result).not.toBeNull();
          expect(result?.skills).toEqual([]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null for a deactivated user', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId, userId } = await setup(pool, databaseUrl);
        try {
          await deactivateUser(userId, { type: 'cli', user_id: null });

          const result = await getUserProfileForEmbedding({ tenant_id: tenantId, user_id: userId });
          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns null for an unknown user_id', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId } = await setup(pool, databaseUrl);
        try {
          const result = await getUserProfileForEmbedding({
            tenant_id: tenantId,
            user_id: crypto.randomUUID(),
          });
          expect(result).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
