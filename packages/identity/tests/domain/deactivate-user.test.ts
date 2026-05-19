import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { deactivateUser } from '../../src/backend/domain/deactivate-user.ts';
import { reactivateUser } from '../../src/backend/domain/reactivate-user.ts';
import { registerIdentityContributions } from '../../src/register.ts';

describe('deactivateUser / reactivateUser', () => {
  it('sets and clears identity.user.deactivated_at and emits identity.user.deactivated', async () => {
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
            { tenant_id: tenantId, email: 'b@d.local', name: 'B', password: 'demo-password-1234' },
            { type: 'cli', user_id: null },
          );

          await deactivateUser(targetId, { type: 'user', user_id: adminId });
          let row = (
            await pool.query(`SELECT deactivated_at FROM identity."user" WHERE id = $1`, [targetId])
          ).rows[0] as { deactivated_at: Date | null };
          expect(row.deactivated_at).not.toBeNull();

          const event = (
            await pool.query(
              `SELECT payload FROM core.events WHERE event_type = 'identity.user.deactivated'`,
            )
          ).rows[0] as { payload: { user_id: string } };
          expect(event.payload.user_id).toBe(targetId);

          await reactivateUser(targetId, { type: 'user', user_id: adminId });
          row = (
            await pool.query(`SELECT deactivated_at FROM identity."user" WHERE id = $1`, [targetId])
          ).rows[0] as { deactivated_at: Date | null };
          expect(row.deactivated_at).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('refuses to deactivate the last active org.admin', async () => {
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
              email: 'a@d.local',
              name: 'A',
              password: 'demo-password-1234',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );

          await expect(deactivateUser(adminId, { type: 'cli', user_id: null })).rejects.toThrow(
            /LAST_ORG_ADMIN/,
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
