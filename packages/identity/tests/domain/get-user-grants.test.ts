import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { getUserGrants } from '../../src/backend/domain/get-user-grants.ts';
import { grantRole } from '../../src/backend/domain/grant-role.ts';
import { revokeRole } from '../../src/backend/domain/revoke-role.ts';
import { registerIdentityContributions } from '../../src/register.ts';

describe('getUserGrants', () => {
  it('returns active grants only, including id and granted_via', async () => {
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

          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', 'demo')`,
            [tenantId],
          );

          const { user_id } = await createUser(
            {
              tenant_id: tenantId,
              email: 'admin@d.local',
              name: 'Admin',
              password: 'demo-password-1234',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );

          const { grant_id } = await grantRole(
            {
              user_id,
              tenant_id: tenantId,
              role_slug: 'planner.viewer',
              scope_type: 'tenant',
              scope_id: null,
            },
            { type: 'cli', user_id: null },
          );

          await revokeRole(grant_id, { type: 'cli', user_id: null });

          const grants = await getUserGrants(user_id);
          expect(grants.map((g) => g.role_slug).sort()).toEqual(['org.admin']);
          expect(grants[0]?.id).toBeDefined();
          expect(grants[0]?.granted_via).toBe('cli');
          expect(grants[0]?.scope_type).toBe('tenant');
          expect(grants[0]?.granted_at).toBeInstanceOf(Date);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
