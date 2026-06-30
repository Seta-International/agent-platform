import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../src/backend/db/index.ts';
import {
  accessGroup,
  accessGroupMembership,
  accessGroupRole,
} from '../../src/backend/db/schema.ts';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { resolveEffectiveRoleSlugs } from '../../src/backend/domain/resolve-effective-roles.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

const CLI = { type: 'cli' as const, user_id: null };

describe('resolveEffectiveRoleSlugs', () => {
  it('unions direct grants with group-derived roles', async () => {
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

          const { tenant_id } = await createTestTenantWithAdmin({ pool });

          // Create a non-admin target user with a direct planner.contributor grant
          const { user_id } = await createUser(
            {
              tenant_id,
              email: 'target@demo.local',
              name: 'Target User',
              password: 'pw',
              initial_role: {
                role_slug: 'planner.contributor',
                scope_type: 'tenant',
                scope_id: null,
              },
            },
            CLI,
          );

          // Create an access group with two roles and add the user as a member
          const groupId = crypto.randomUUID();
          const db = identityDb();
          await db.insert(accessGroup).values({
            id: groupId,
            tenant_id,
            slug: 'hr',
            name: 'HR',
            kind: 'default',
          });
          await db.insert(accessGroupRole).values([
            { group_id: groupId, role_slug: 'people.strategic' },
            { group_id: groupId, role_slug: 'hiring.strategic' },
          ]);
          await db.insert(accessGroupMembership).values({
            group_id: groupId,
            user_id,
          });

          const roles = await resolveEffectiveRoleSlugs(user_id, tenant_id);
          expect(roles).toEqual(['hiring.strategic', 'people.strategic', 'planner.contributor']);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
