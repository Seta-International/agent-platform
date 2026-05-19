import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { deactivateUser } from '../../src/backend/domain/deactivate-user.ts';
import { grantRole } from '../../src/backend/domain/grant-role.ts';
import { listUsers } from '../../src/backend/domain/list-users.ts';
import { registerIdentityContributions } from '../../src/register.ts';

describe('listUsers', () => {
  it('returns paginated users with computed status and role_slugs', async () => {
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
          await createUser(
            {
              tenant_id: tenantId,
              email: 'a@d.local',
              name: 'A',
              password: 'demo-password-1234',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );
          await createUser(
            { tenant_id: tenantId, email: 'b@d.local', name: 'B', password: 'demo-password-1234' },
            { type: 'cli', user_id: null },
          );

          const result = await listUsers(tenantId, { limit: 25, offset: 0 });
          expect(result.total).toBe(2);
          expect(result.rows.length).toBe(2);
          const admin = result.rows.find((r) => r.email === 'a@d.local');
          if (!admin) throw new Error('admin user not found in listUsers result');
          expect(admin.role_slugs).toContain('org.admin');
          expect(admin.status).toBe('active');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('filters by search prefix on email or name', async () => {
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
          await createUser(
            {
              tenant_id: tenantId,
              email: 'alice@d.local',
              name: 'Alice',
              password: 'demo-password-1234',
            },
            { type: 'cli', user_id: null },
          );
          await createUser(
            {
              tenant_id: tenantId,
              email: 'bob@d.local',
              name: 'Bob',
              password: 'demo-password-1234',
            },
            { type: 'cli', user_id: null },
          );

          const result = await listUsers(tenantId, { search: 'ali', limit: 25, offset: 0 });
          expect(result.rows.length).toBe(1);
          const firstRow = result.rows[0];
          if (!firstRow) throw new Error('expected at least one row');
          expect(firstRow.email).toBe('alice@d.local');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('filters by role_slug and returns matching total', async () => {
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
          await createUser(
            {
              tenant_id: tenantId,
              email: 'member@d.local',
              name: 'Member',
              password: 'demo-password-1234',
            },
            { type: 'cli', user_id: null },
          );

          // Grant an extra non-admin role to admin user to verify ANY() matching is exact
          await grantRole(
            {
              user_id: adminId,
              tenant_id: tenantId,
              role_slug: 'org.member',
              scope_type: 'tenant',
              scope_id: null,
            },
            { type: 'cli', user_id: null },
          );

          const result = await listUsers(tenantId, {
            role_slug: 'org.admin',
            limit: 25,
            offset: 0,
          });
          expect(result.total).toBe(1);
          expect(result.rows.length).toBe(1);
          const row = result.rows[0];
          if (!row) throw new Error('expected one row');
          expect(row.email).toBe('admin@d.local');
          expect(row.role_slugs).toContain('org.admin');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('filters by status=deactivated and returns matching total', async () => {
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
          await createUser(
            {
              tenant_id: tenantId,
              email: 'active@d.local',
              name: 'Active',
              password: 'demo-password-1234',
              initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
            },
            { type: 'cli', user_id: null },
          );
          const { user_id: deactivatedId } = await createUser(
            {
              tenant_id: tenantId,
              email: 'gone@d.local',
              name: 'Gone',
              password: 'demo-password-1234',
            },
            { type: 'cli', user_id: null },
          );
          await deactivateUser(deactivatedId, { type: 'cli', user_id: null });

          const result = await listUsers(tenantId, {
            status: 'deactivated',
            limit: 25,
            offset: 0,
          });
          expect(result.total).toBe(1);
          expect(result.rows.length).toBe(1);
          const row = result.rows[0];
          if (!row) throw new Error('expected one row');
          expect(row.email).toBe('gone@d.local');
          expect(row.status).toBe('deactivated');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
