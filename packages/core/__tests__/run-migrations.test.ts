import { closePools, getPool, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createContributionRegistry, runMigrations } from '../src/index.ts';
import { registerCoreContributions } from '../src/register.ts';

describe('runMigrations(reg)', () => {
  it('applies all core migrations against a fresh DB and is idempotent', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ databaseUrl, pool }) => {
        await pool.query(`DROP SCHEMA IF EXISTS core CASCADE`);
        await closePools();
        initPools({ databaseUrl });

        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        await runMigrations(reg, { pool: getPool('worker') });

        const { rows } = await getPool('web').query(
          `SELECT count(*)::int AS n FROM core.__seta_migrations WHERE module='core'`,
        );
        expect(rows[0]?.n).toBeGreaterThanOrEqual(3);

        await runMigrations(reg, { pool: getPool('worker') });
        const { rows: rows2 } = await getPool('web').query(
          `SELECT count(*)::int AS n FROM core.__seta_migrations WHERE module='core'`,
        );
        expect(rows2[0]?.n).toBe(rows[0]?.n);
      },
    );
  });
});
