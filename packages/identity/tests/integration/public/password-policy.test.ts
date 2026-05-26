import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { createUser, IdentityError } from '@seta/identity';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

describe('password policy', () => {
  it('rejects passwords shorter than 12 chars at createUser entry', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          await runMigrations(reg, { pool });

          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );
          await expect(
            createUser(
              { tenant_id: tenantId, email: 'a@d.local', name: 'A', password: 'short' },
              { type: 'superadmin', user_id: null },
            ),
          ).rejects.toSatisfy(
            (e: unknown) => e instanceof IdentityError && e.code === 'PASSWORD_LENGTH',
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects passwords longer than 128 chars', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          await runMigrations(reg, { pool });

          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );
          await expect(
            createUser(
              {
                tenant_id: tenantId,
                email: 'b@d.local',
                name: 'B',
                password: 'x'.repeat(129),
              },
              { type: 'cli', user_id: null },
            ),
          ).rejects.toSatisfy(
            (e: unknown) => e instanceof IdentityError && e.code === 'PASSWORD_LENGTH',
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
