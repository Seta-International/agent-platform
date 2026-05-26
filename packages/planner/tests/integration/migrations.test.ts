import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { plannerDb } from '../../src/backend/db/index.ts';

describe('groups schema migration', () => {
  it('has all expected sync columns on planner.groups', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const db = plannerDb();
          const res = await db.execute(sql`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'planner' AND table_name = 'groups'
            ORDER BY ordinal_position
          `);
          const cols = (res.rows as Array<{ column_name: string }>).map((r) => r.column_name);
          for (const c of [
            'description',
            'theme',
            'visibility',
            'default_role',
            'external_source',
            'external_id',
            'external_synced_at',
          ]) {
            expect(cols).toContain(c);
          }
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects linked group without external_id (groups_external_id_required_for_linked)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          await expect(
            pool.query(
              `INSERT INTO planner.groups (tenant_id, name, created_by, external_source)
                 VALUES ($1::uuid, 'x', $1::uuid, 'm365')`,
              ['11111111-1111-1111-1111-111111111111'],
            ),
          ).rejects.toThrow(/groups_external_id_required_for_linked/);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('has role column on planner.group_members', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const db = plannerDb();
          const res = await db.execute(sql`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'planner' AND table_name = 'group_members'
          `);
          const cols = (res.rows as Array<{ column_name: string }>).map((r) => r.column_name);
          expect(cols).toContain('role');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
