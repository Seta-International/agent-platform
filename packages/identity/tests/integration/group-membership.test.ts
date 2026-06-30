import { createContributionRegistry, runMigrations, type SessionScope } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  addGroupMembers,
  createGroup,
  createUser,
  listUserGroups,
  removeGroupMember,
} from '../../src/index.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

describe('group membership', () => {
  it('adds and removes members, lists a user groups, invalidates session', async () => {
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

          const { user_id: targetUserId } = await createUser(
            {
              tenant_id,
              email: 'target@example.com',
              name: 'Target User',
              password: 'TestPassword123!',
              initial_role: { role_slug: 'org.viewer', scope_type: 'tenant', scope_id: null },
            },
            actor,
          );

          const { group_id } = await createGroup(
            { tenant_id, slug: 'pmo', name: 'PMO', kind: 'default' },
            actor,
          );

          await addGroupMembers({ group_id, tenant_id, user_ids: [targetUserId] }, actor);
          expect(await listUserGroups(session, targetUserId)).toEqual([
            { group_id, slug: 'pmo', name: 'PMO' },
          ]);

          await removeGroupMember({ group_id, tenant_id, user_id: targetUserId }, actor);
          expect(await listUserGroups(session, targetUserId)).toEqual([]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
