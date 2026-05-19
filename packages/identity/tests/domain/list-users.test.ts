import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
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
});
