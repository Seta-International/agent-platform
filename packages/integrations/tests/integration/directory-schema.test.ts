import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { integrationsDb, resetIntegrationsDb } from '../../src/backend/db/client.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const TABLES = ['m365_person_links', 'm365_org_unit_links', 'm365_directory_conflict'];

describe('integrations directory schema', () => {
  it('creates the three directory tables', async () => {
    await withTestDb(ctx, async ({ databaseUrl }) => {
      resetIntegrationsDb();
      initPools({ databaseUrl });
      try {
        const rows = await integrationsDb().execute(sql`
          SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'integrations'
             AND table_name IN (${sql.join(
               TABLES.map((t) => sql`${t}`),
               sql`, `,
             )})
        `);
        expect(rows.rows.map((r) => r.table_name).sort()).toEqual([...TABLES].sort());
      } finally {
        resetIntegrationsDb();
        await closePools();
      }
    });
  });

  it('adds the directory cursor columns to m365_tenant_config', async () => {
    await withTestDb(ctx, async ({ databaseUrl }) => {
      resetIntegrationsDb();
      initPools({ databaseUrl });
      try {
        const rows = await integrationsDb().execute(sql`
          SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'integrations' AND table_name = 'm365_tenant_config'
             AND column_name LIKE 'directory_%'
        `);
        expect(rows.rows.map((r) => r.column_name).sort()).toEqual([
          'directory_delta_link',
          'directory_last_error',
          'directory_last_status',
          'directory_synced_at',
        ]);
      } finally {
        resetIntegrationsDb();
        await closePools();
      }
    });
  });

  it('dedupes open conflicts on the natural key', async () => {
    await withTestDb(ctx, async ({ databaseUrl }) => {
      resetIntegrationsDb();
      initPools({ databaseUrl });
      try {
        const rows = await integrationsDb().execute(sql`
          SELECT indexdef FROM pg_indexes
           WHERE schemaname = 'integrations' AND tablename = 'm365_directory_conflict'
             AND indexdef ILIKE '%unique%' AND indexdef ILIKE '%open%'
        `);
        expect(rows.rows).toHaveLength(1);
      } finally {
        resetIntegrationsDb();
        await closePools();
      }
    });
  });
});
