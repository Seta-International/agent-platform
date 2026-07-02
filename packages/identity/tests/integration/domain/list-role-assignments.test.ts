import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { listRoleAssignments } from '../../../src/backend/domain/list-role-assignments.ts';
import { IdentityError } from '../../../src/backend/rbac.ts';

describe('listRoleAssignments', () => {
  it('returns tenant_id and active assignments for a user', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();

          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', 'test-org')`,
            [tenantId],
          );
          await pool.query(
            `INSERT INTO identity."user" (id, email, name, tenant_id) VALUES ($1, $2, $3, $4)`,
            [userId, 'alice@test.local', 'Alice', tenantId],
          );

          const assignmentId1 = crypto.randomUUID();
          const assignmentId2 = crypto.randomUUID();
          const assignmentId3 = crypto.randomUUID();

          await pool.query(
            `INSERT INTO identity.role_assignments (id, user_id, tenant_id, role_slug, scope_kind, scope_id)
             VALUES ($1, $2, $3, 'org.admin', 'tenant', NULL),
                    ($4, $2, $3, 'planner.member', 'tenant', NULL),
                    ($5, $2, $3, 'org.viewer', 'tenant', NULL)`,
            [assignmentId1, userId, tenantId, assignmentId2, assignmentId3],
          );

          // Soft-revoke the third assignment
          await pool.query(
            `UPDATE identity.role_assignments SET revoked_at = NOW() WHERE id = $1`,
            [assignmentId3],
          );

          const result = await listRoleAssignments(userId);

          expect(result.tenant_id).toBe(tenantId);
          expect(result.assignments).toHaveLength(2);
          const slugs = [...result.assignments].map((a) => a.role_slug).sort();
          expect(slugs).toEqual(['org.admin', 'planner.member']);
          for (const assignment of result.assignments) {
            expect(assignment.granted_at).toBeInstanceOf(Date);
            expect(['tenant', 'org_unit', 'self', 'group']).toContain(assignment.scope_kind);
          }
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws when the user does not exist', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', 'test-org-2')`,
            [tenantId],
          );

          const nonExistentUserId = crypto.randomUUID();
          await expect(listRoleAssignments(nonExistentUserId)).rejects.toSatisfy(
            (e: unknown) => e instanceof IdentityError && /USER_NOT_FOUND/.test(e.code),
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
