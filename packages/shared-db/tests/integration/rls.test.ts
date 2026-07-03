import { randomUUID } from 'node:crypto';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { buildRlsSql } from '../../src/rls.ts';

const env = {
  template: () => process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  base: () => process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('buildRlsSql', () => {
  it('isolates tenants for a non-bypass role and blocks cross-tenant writes', async () => {
    await withTestDb({ templateDbName: env.template(), baseUrl: env.base() }, async ({ pool }) => {
      const t1 = randomUUID();
      const t2 = randomUUID();
      await pool.query(`CREATE SCHEMA scratch`);
      await pool.query(`CREATE TABLE scratch.items (tenant_id uuid NOT NULL, label text NOT NULL)`);
      await pool.query(buildRlsSql('scratch', ['items']));
      await pool.query(`INSERT INTO scratch.items VALUES ($1,'one'), ($2,'two')`, [t1, t2]);
      // role is cluster-scoped and outlives the per-run database on a reused container
      await pool.query(`DROP ROLE IF EXISTS app_rls_test`);
      await pool.query(`CREATE ROLE app_rls_test; GRANT USAGE ON SCHEMA scratch TO app_rls_test;
                        GRANT SELECT, INSERT ON scratch.items TO app_rls_test`);

      const client = await pool.connect();
      try {
        await client.query(`SET ROLE app_rls_test`);

        // No GUC set -> policy is NULL -> zero rows, no error
        const blind = await client.query(`SELECT * FROM scratch.items`);
        expect(blind.rowCount).toBe(0);

        await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [t1]);
        const scoped = await client.query(`SELECT label FROM scratch.items`);
        expect(scoped.rows).toEqual([{ label: 'one' }]);

        // WITH CHECK blocks writing another tenant's row
        await expect(
          client.query(`INSERT INTO scratch.items VALUES ($1,'smuggled')`, [t2]),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        client.release();
      }
    });
  });
});
