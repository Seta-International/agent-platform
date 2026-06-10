import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../../src/backend/db/index.ts';
import { roleGrants } from '../../../src/backend/db/schema.ts';
import { bulkGrantRole, bulkRevokeRole } from '../../../src/backend/domain/bulk-grant-role.ts';
import { registerIdentityContributions } from '../../../src/register.ts';
import { seedTenantWithUsers } from '../../helpers/seed-tenant.ts';

function withDb<T>(fn: (pool: import('pg').Pool) => Promise<T>): Promise<T> {
  return withTestDb(
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
        return await fn(pool);
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

describe('bulkGrantRole', () => {
  it('bulk grants idempotently and summarizes', async () => {
    await withDb(async (pool) => {
      const { tenant_id, admin, users } = await seedTenantWithUsers(pool, 3);
      // pre-grant users[0]
      await identityDb().insert(roleGrants).values({
        user_id: users[0],
        tenant_id,
        role_slug: 'knowledge.viewer',
        scope_type: 'tenant',
        scope_id: null,
      });

      const res = await bulkGrantRole(
        {
          user_ids: users,
          tenant_id,
          role_slug: 'knowledge.viewer',
          scope_type: 'tenant',
          scope_id: null,
        },
        { type: 'user', user_id: admin },
      );
      expect(res.granted).toBe(2);
      expect(res.skipped).toBe(1);
      expect(res.failed).toEqual([]);

      const active = await identityDb()
        .select()
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.tenant_id, tenant_id),
            eq(roleGrants.role_slug, 'knowledge.viewer'),
            isNull(roleGrants.revoked_at),
          ),
        );
      expect(active).toHaveLength(3);

      const events = (
        await pool.query(
          `SELECT payload->>'user_id' AS user_id FROM core.events
           WHERE event_type = 'identity.role_grant.changed' AND payload->>'change' = 'granted'
             AND payload->'grant'->>'role_slug' = 'knowledge.viewer'
             AND tenant_id = $1`,
          [tenant_id],
        )
      ).rows as { user_id: string }[];
      expect(events).toHaveLength(2);
    });
  });
});

describe('bulkRevokeRole', () => {
  it('bulk revokes idempotently and summarizes', async () => {
    await withDb(async (pool) => {
      const { tenant_id, admin, users } = await seedTenantWithUsers(pool, 3);
      // grant users[0] and users[1] (users[2] holds nothing)
      await bulkGrantRole(
        {
          user_ids: [users[0], users[1]],
          tenant_id,
          role_slug: 'knowledge.viewer',
          scope_type: 'tenant',
          scope_id: null,
        },
        { type: 'user', user_id: admin },
      );

      const res = await bulkRevokeRole(
        {
          user_ids: users,
          tenant_id,
          role_slug: 'knowledge.viewer',
          scope_type: 'tenant',
          scope_id: null,
        },
        { type: 'user', user_id: admin },
      );
      expect(res.revoked).toBe(2);
      expect(res.skipped).toBe(1);
      expect(res.failed).toEqual([]);

      const active = await identityDb()
        .select()
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.tenant_id, tenant_id),
            eq(roleGrants.role_slug, 'knowledge.viewer'),
            isNull(roleGrants.revoked_at),
          ),
        );
      expect(active).toHaveLength(0);

      const revokeEvents = (
        await pool.query(
          `SELECT payload->>'user_id' AS user_id FROM core.events
           WHERE event_type = 'identity.role_grant.changed' AND payload->>'change' = 'revoked'
             AND payload->'grant'->>'role_slug' = 'knowledge.viewer'
             AND tenant_id = $1`,
          [tenant_id],
        )
      ).rows as { user_id: string }[];
      expect(revokeEvents).toHaveLength(2);
    });
  });
});
