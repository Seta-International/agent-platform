import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { registerIdentityContributions } from '../src/register.ts';

describe('identity migrations', () => {
  it('applies cleanly on a fresh database', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });

        const res = await pool.query(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'identity' ORDER BY table_name
        `);
        const tables = res.rows.map((r: { table_name: string }) => r.table_name);
        expect(tables).toContain('user');
        expect(tables).toContain('session');
        expect(tables).toContain('account');
        expect(tables).toContain('verification');
      },
    );
  });

  it('creates all extension tables with the expected indexes', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });

        const tables = (
          await pool.query(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'identity' ORDER BY table_name
        `)
        ).rows.map((r: { table_name: string }) => r.table_name);
        expect(tables).toEqual(
          expect.arrayContaining([
            'user',
            'session',
            'account',
            'verification',
            'user_profile',
            'role_grants',
            'failed_login_attempts',
            'tenant_sso_providers',
          ]),
        );

        const indexes = (
          await pool.query(`
          SELECT indexname FROM pg_indexes WHERE schemaname = 'identity'
        `)
        ).rows.map((r: { indexname: string }) => r.indexname);
        expect(indexes).toEqual(
          expect.arrayContaining([
            'user_tenant_email_uniq',
            'role_grants_active_uniq',
            'role_grants_user_idx',
            'role_grants_tenant_role_idx',
            'failed_login_email_ip_idx',
            'tenant_sso_providers_domain_idx',
          ]),
        );
      },
    );
  });

  it('has the vector extension installed after migrations', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });

        const r = await pool.query<{ extname: string }>(
          `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
        );
        expect(r.rows).toHaveLength(1);
      },
    );
  });

  it('supports halfvec column type (pgvector >= 0.7) after migrations', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });

        await pool.query(`CREATE TEMP TABLE _hv_probe (e halfvec(3))`);
        await pool.query(`INSERT INTO _hv_probe (e) VALUES ('[0.1, 0.2, 0.3]'::halfvec)`);
        const r = await pool.query<{ e: string }>(`SELECT e::text FROM _hv_probe`);
        expect(r.rows[0]?.e).toMatch(/^\[0\.[0-9]+/);
      },
    );
  });

  it('adds idle_timeout_days and local_password_disabled to core.tenants', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });

        const cols = (
          await pool.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_schema = 'core' AND table_name = 'tenants'
              AND column_name IN ('idle_timeout_days', 'local_password_disabled')
            ORDER BY column_name
          `)
        ).rows;
        expect(cols).toEqual([
          expect.objectContaining({ column_name: 'idle_timeout_days', data_type: 'integer' }),
          expect.objectContaining({ column_name: 'local_password_disabled', data_type: 'boolean' }),
        ]);

        const cacheTable = await pool.query(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'core' AND table_name = 'session_scope_cache'
        `);
        expect(cacheTable.rows.length).toBe(1);
      },
    );
  });

  it('drops the user_skill_embeddings table (renamed to user_profile_embeddings)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });

        const r = await pool.query<{ exists: boolean }>(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'identity' AND table_name = 'user_skill_embeddings'
          ) AS exists
        `);
        expect(r.rows[0]?.exists).toBe(false);
      },
    );
  });

  it('creates identity.user_profile_embeddings as a partitioned parent', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool }) => {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });

        const cols = await pool.query<{ column_name: string; data_type: string }>(`
          SELECT column_name, data_type FROM information_schema.columns
           WHERE table_schema = 'identity' AND table_name = 'user_profile_embeddings'
           ORDER BY ordinal_position
        `);
        expect(cols.rows.map((r) => r.column_name)).toEqual([
          'tenant_id',
          'user_id',
          'source_hash',
          'embedding',
          'model_id',
          'embedded_at',
        ]);

        const part = await pool.query<{ partstrat: string; partattrs: string }>(`
          SELECT partstrat::text, partattrs::text FROM pg_partitioned_table
           WHERE partrelid = 'identity.user_profile_embeddings'::regclass
        `);
        expect(part.rows[0]?.partstrat).toBe('l');
      },
    );
  });
});
