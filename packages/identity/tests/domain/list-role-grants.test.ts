import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { listRoleGrants } from '../../src/backend/domain/list-role-grants.ts';
import { IdentityError } from '../../src/backend/rbac.ts';

describe('listRoleGrants', () => {
  it('returns tenant_id and active grants for a user', async () => {
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
          const userId = crypto.randomUUID();

          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', 'test-org')`,
            [tenantId],
          );
          await pool.query(
            `INSERT INTO identity."user" (id, email, name, tenant_id) VALUES ($1, $2, $3, $4)`,
            [userId, 'alice@test.local', 'Alice', tenantId],
          );

          const grantId1 = crypto.randomUUID();
          const grantId2 = crypto.randomUUID();
          const grantId3 = crypto.randomUUID();

          await pool.query(
            `INSERT INTO identity.role_grants (id, user_id, tenant_id, role_slug, scope_type, scope_id)
             VALUES ($1, $2, $3, 'org.admin', 'tenant', NULL),
                    ($4, $2, $3, 'planner.member', 'tenant', NULL),
                    ($5, $2, $3, 'org.viewer', 'tenant', NULL)`,
            [grantId1, userId, tenantId, grantId2, grantId3],
          );

          // Soft-revoke the third grant
          await pool.query(`UPDATE identity.role_grants SET revoked_at = NOW() WHERE id = $1`, [
            grantId3,
          ]);

          const result = await listRoleGrants(userId);

          expect(result.tenant_id).toBe(tenantId);
          expect(result.grants).toHaveLength(2);
          const slugs = [...result.grants].map((g) => g.role_slug).sort();
          expect(slugs).toEqual(['org.admin', 'planner.member']);
          for (const grant of result.grants) {
            expect(grant.granted_at).toBeInstanceOf(Date);
            expect(['tenant', 'group']).toContain(grant.scope_type);
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
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
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
          await expect(listRoleGrants(nonExistentUserId)).rejects.toSatisfy(
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
