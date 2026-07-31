import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('people.person directory columns', () => {
  it('has photo_storage_key and directory_managed', async () => {
    await withTestDb(ctx, async ({ databaseUrl }) => {
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const rows = await peopleDb().execute(sql`
          SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
           WHERE table_schema = 'people' AND table_name = 'person'
             AND column_name IN ('photo_storage_key', 'directory_managed')
           ORDER BY column_name
        `);
        expect(rows.rows).toHaveLength(2);
        const byName = Object.fromEntries(rows.rows.map((r) => [r.column_name, r]));
        expect(byName.directory_managed.is_nullable).toBe('NO');
        expect(byName.directory_managed.column_default).toContain('false');
        expect(byName.photo_storage_key.is_nullable).toBe('YES');
      } finally {
        resetPeopleDb();
        await closePools();
      }
    });
  });

  it('still has no manager_id column (F-ORG-3)', async () => {
    await withTestDb(ctx, async ({ databaseUrl }) => {
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const rows = await peopleDb().execute(sql`
          SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'people' AND table_name = 'person' AND column_name = 'manager_id'
        `);
        expect(rows.rows).toHaveLength(0);
      } finally {
        resetPeopleDb();
        await closePools();
      }
    });
  });
});
