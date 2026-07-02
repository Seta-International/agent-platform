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
  roleAssignments,
} from '../../src/backend/db/schema.ts';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { resolveEffectiveAssignments } from '../../src/backend/domain/resolve-effective-assignments.ts';
import { registerIdentityContributions } from '../../src/register.ts';
import { createTestTenantWithAdmin } from '../../src/testing/index.ts';

const CLI = { type: 'cli' as const, user_id: null };

describe('resolveEffectiveAssignments', () => {
  it('unions direct assignments with group-derived roles', async () => {
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

          // Create a non-admin target user with a direct planner.member grant
          const { user_id } = await createUser(
            {
              tenant_id,
              email: 'target@demo.local',
              name: 'Target User',
              password: 'pw',
              initial_role: {
                role_slug: 'planner.member',
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
            { tenant_id, group_id: groupId, role_slug: 'people.manager' },
            { tenant_id, group_id: groupId, role_slug: 'hiring.manager' },
          ]);
          await db.insert(accessGroupMembership).values({
            tenant_id,
            group_id: groupId,
            user_id,
          });

          const assignments = await resolveEffectiveAssignments(user_id, tenant_id);
          const slugs = assignments.map((a) => a.role_slug).sort();
          expect(slugs).toEqual(['hiring.manager', 'people.manager', 'planner.member']);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns group-derived assignments with the group scope', async () => {
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
          const { user_id } = await createUser(
            {
              tenant_id,
              email: 'scoped-group@demo.local',
              name: 'Scoped Group User',
              password: 'pw',
            },
            CLI,
          );

          const orgUnitId = crypto.randomUUID();
          const groupId = crypto.randomUUID();
          const db = identityDb();
          await db.insert(accessGroup).values({
            id: groupId,
            tenant_id,
            slug: 'pm-org-unit',
            name: 'PM Org Unit',
            kind: 'default',
          });
          await db.insert(accessGroupRole).values({
            tenant_id,
            group_id: groupId,
            role_slug: 'pm.manager',
            scope_kind: 'org_unit',
            scope_id: orgUnitId,
          });
          await db.insert(accessGroupMembership).values({ tenant_id, group_id: groupId, user_id });

          const assignments = await resolveEffectiveAssignments(user_id, tenant_id);
          expect(assignments).toContainEqual({
            role_slug: 'pm.manager',
            scope_kind: 'org_unit',
            scope_id: orgUnitId,
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('keeps same role at two scopes as two assignments', async () => {
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
          const { user_id } = await createUser(
            {
              tenant_id,
              email: 'two-scopes@demo.local',
              name: 'Two Scopes User',
              password: 'pw',
            },
            CLI,
          );

          const orgUnitId = crypto.randomUUID();
          const db = identityDb();
          await db.insert(roleAssignments).values([
            { user_id, tenant_id, role_slug: 'pm.viewer', scope_kind: 'tenant', scope_id: null },
            {
              user_id,
              tenant_id,
              role_slug: 'pm.viewer',
              scope_kind: 'org_unit',
              scope_id: orgUnitId,
            },
          ]);

          const assignments = await resolveEffectiveAssignments(user_id, tenant_id);
          expect(assignments.filter((a) => a.role_slug === 'pm.viewer')).toHaveLength(2);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
