import { closePools, initPools } from '@seta/shared-db';
import { assertRlsCensus, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetKnowledgeDb } from '../../src/backend/db/client.ts';
import * as knowledgeSchema from '../../src/backend/db/schema.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('knowledge RLS census', () => {
  it('every tenant-scoped knowledge table is RLS-forced and tenant-blind to strangers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        await pool.query(`CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS`).catch(() => {});
        await pool.query(`GRANT USAGE ON SCHEMA knowledge TO seta_app`);
        await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA knowledge TO seta_app`);
        await assertRlsCensus(pool, {
          schema: 'knowledge',
          tables: knowledgeSchema,
          allowlist: [],
        });

        // knowledge.chunks is LIST-partitioned by tenant_id (hand-written SQL migration,
        // drizzle cannot model partitioning) so it has no drizzle table export and
        // assertRlsCensus never sees it. Assert its FORCE RLS directly against the parent
        // relation (relrowsecurity/relforcerowsecurity live on the partitioned parent and
        // are inherited by every partition), then repeat the same foreign-tenant-sees-zero
        // check assertRlsCensus performs for every other table.
        const sec = await pool.query<{ rls: boolean; forced: boolean }>(
          `SELECT relrowsecurity AS rls, relforcerowsecurity AS forced
             FROM pg_class WHERE oid = 'knowledge.chunks'::regclass`,
        );
        expect(sec.rows[0]?.rls).toBe(true);
        expect(sec.rows[0]?.forced).toBe(true);

        const client = await pool.connect();
        try {
          await client.query(`SET ROLE seta_app`);
          await client.query(`SELECT set_config('app.tenant_id', gen_random_uuid()::text, false)`);
          const rows = await client.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM knowledge.chunks`,
          );
          expect(rows.rows[0]?.n).toBe(0);
          await client.query(`RESET ROLE`);
        } finally {
          client.release();
        }
      } finally {
        await closePools();
      }
    });
  });
});
