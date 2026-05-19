import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { searchSkills } from '../../src/backend/domain/search-skills.ts';
import { registerIdentityContributions } from '../../src/register.ts';

describe('searchSkills', () => {
  it('returns distinct tenant-scoped skills matching the prefix', async () => {
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
          const otherTenantId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'A', 'a'), ($2, 'B', 'b')`,
            [tenantId, otherTenantId],
          );

          await pool.query(
            `INSERT INTO identity."user" (id, email, name, tenant_id) VALUES (gen_random_uuid(), 'u1@a', 'U1', $1)`,
            [tenantId],
          );
          const u1 = (
            await pool.query(`SELECT id FROM identity."user" WHERE tenant_id = $1`, [tenantId])
          ).rows[0] as { id: string };
          await pool.query(
            `INSERT INTO identity.user_profile (user_id, tenant_id, skills) VALUES ($1, $2, ARRAY['rust','typescript','rust-async'])`,
            [u1.id, tenantId],
          );

          await pool.query(
            `INSERT INTO identity."user" (id, email, name, tenant_id) VALUES (gen_random_uuid(), 'u2@b', 'U2', $1)`,
            [otherTenantId],
          );
          const u2 = (
            await pool.query(`SELECT id FROM identity."user" WHERE tenant_id = $1`, [otherTenantId])
          ).rows[0] as { id: string };
          await pool.query(
            `INSERT INTO identity.user_profile (user_id, tenant_id, skills) VALUES ($1, $2, ARRAY['rust-from-other-tenant'])`,
            [u2.id, otherTenantId],
          );

          const results = await searchSkills(tenantId, 'rust', 10);
          expect([...results].sort()).toEqual(['rust', 'rust-async']);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
