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
            'user_skill_embeddings',
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
});
