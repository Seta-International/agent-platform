import { createContributionRegistry, runMigrations, type SessionScope } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, listGroups, setGroupRoles } from '../../src/index.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

describe('groups CRUD', () => {
  it('creates a group, sets roles, lists it', async () => {
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

          const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });

          const session = { user_id: admin_user_id, tenant_id } as unknown as SessionScope;
          const actor = { type: 'user' as const, user_id: admin_user_id };

          const { group_id } = await createGroup(
            { tenant_id, slug: 'hr', name: 'HR', kind: 'default' },
            actor,
          );

          await setGroupRoles(
            { group_id, tenant_id, role_slugs: ['people.strategic', 'hiring.strategic'] },
            actor,
          );

          const rows = await listGroups(session);
          const hr = rows.find((r) => r.slug === 'hr');
          expect(hr?.role_slugs.sort()).toEqual(['hiring.strategic', 'people.strategic']);
          expect(hr?.member_count).toBe(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
