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
import { IdentityError, requirePermission } from '../../src/backend/rbac.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

const CLI = { type: 'cli' as const, user_id: null };

describe('group roles enforced by requirePermission', () => {
  it('passes a permission granted only via a group, and rejects before membership', async () => {
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
          // Create a user with no initial role — cannot have people.worker.read
          const { user_id } = await createUser(
            {
              tenant_id,
              email: 'worker@demo.local',
              name: 'Plain Worker',
              password: 'pw',
            },
            CLI,
          );

          // BEFORE group membership: permission must be denied
          await expect(
            requirePermission(user_id, 'people.worker.read', tenant_id),
          ).rejects.toBeInstanceOf(IdentityError);

          // Insert group → assign people.manager role → add user
          const db = identityDb();
          const groupId = crypto.randomUUID();
          await db.insert(accessGroup).values({
            id: groupId,
            tenant_id,
            slug: 'hr',
            name: 'HR',
          });
          await db.insert(accessGroupRole).values({
            tenant_id,
            group_id: groupId,
            role_slug: 'people.manager',
          });
          await db.insert(accessGroupMembership).values({
            tenant_id,
            group_id: groupId,
            user_id,
          });

          // AFTER group membership: people.manager includes people.worker.read
          await expect(
            requirePermission(user_id, 'people.worker.read', tenant_id),
          ).resolves.toBeUndefined();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
