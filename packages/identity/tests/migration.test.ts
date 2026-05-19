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
});
