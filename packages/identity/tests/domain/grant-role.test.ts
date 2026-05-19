import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { grantRole } from '../../src/backend/domain/grant-role.ts';
import { revokeRole } from '../../src/backend/domain/revoke-role.ts';
import { registerIdentityContributions } from '../../src/register.ts';

describe('grantRole / revokeRole', () => {
  it('inserts a role_grants row + emits identity.role_grant.changed; revoke sets revoked_at', async () => {
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
          const { user_id: adminId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'admin@d.local',
              name: 'Admin',
              password: 'demo-password-1234',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );
          const { user_id: targetId } = await createUser(
            { tenant_id: tenantId, email: 'u@d.local', name: 'U', password: 'demo-password-1234' },
            { type: 'cli', user_id: null },
          );

          const { grant_id } = await grantRole(
            {
              user_id: targetId,
              tenant_id: tenantId,
              role_slug: 'planner.viewer',
              scope_type: 'tenant',
              scope_id: null,
            },
            { type: 'user', user_id: adminId },
          );

          const active = (
            await pool.query(
              `SELECT count(*)::int AS n FROM identity.role_grants WHERE user_id = $1 AND role_slug = 'planner.viewer' AND revoked_at IS NULL`,
              [targetId],
            )
          ).rows[0] as { n: number };
          expect(active.n).toBe(1);

          await revokeRole(grant_id, { type: 'user', user_id: adminId });

          const revokedActive = (
            await pool.query(
              `SELECT count(*)::int AS n FROM identity.role_grants WHERE id = $1 AND revoked_at IS NULL`,
              [grant_id],
            )
          ).rows[0] as { n: number };
          expect(revokedActive.n).toBe(0);

          const events = (
            await pool.query(
              `SELECT payload->>'change' AS change FROM core.events WHERE event_type = 'identity.role_grant.changed' AND payload->>'user_id' = $1 ORDER BY occurred_at, ctid`,
              [targetId],
            )
          ).rows as { change: string }[];
          expect(events.map((e) => e.change)).toEqual(['granted', 'revoked']);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
