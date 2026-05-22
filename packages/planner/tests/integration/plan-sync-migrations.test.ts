import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { plannerDb } from '../../src/db/index.ts';

const HARNESS = {
  templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.SETA_TEST_PG_BASE as string,
};

describe('plan sync schema migration', () => {
  it('adds sync_status + last_error to planner.plans and planner.tasks', async () => {
    await withTestDb(HARNESS, async ({ databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const db = plannerDb();
        for (const table of ['plans', 'tasks']) {
          const res = await db.execute(sql`
            SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'planner' AND table_name = ${table}
              AND column_name IN ('sync_status', 'last_error')
          `);
          const cols = res.rows as Array<{
            column_name: string;
            data_type: string;
            column_default: string | null;
            is_nullable: 'YES' | 'NO';
          }>;
          const status = cols.find((c) => c.column_name === 'sync_status');
          expect(status, `${table}.sync_status`).toBeDefined();
          expect(status?.is_nullable).toBe('NO');
          expect(status?.column_default).toContain('idle');
          const lastError = cols.find((c) => c.column_name === 'last_error');
          expect(lastError, `${table}.last_error`).toBeDefined();
          expect(lastError?.is_nullable).toBe('YES');
        }
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('adds external_assigned_at to planner.task_assignments', async () => {
    await withTestDb(HARNESS, async ({ databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const db = plannerDb();
        const res = await db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'planner' AND table_name = 'task_assignments'
            AND column_name = 'external_assigned_at'
        `);
        expect(res.rows).toHaveLength(1);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('adds deleted_at to planner.checklist_items', async () => {
    await withTestDb(HARNESS, async ({ databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const db = plannerDb();
        const res = await db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'planner' AND table_name = 'checklist_items'
            AND column_name = 'deleted_at'
        `);
        expect(res.rows).toHaveLength(1);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('creates partial unique index plans_external_uniq with the expected predicate', async () => {
    await withTestDb(HARNESS, async ({ databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const db = plannerDb();
        const res = await db.execute(sql`
          SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'planner' AND indexname = 'plans_external_uniq'
        `);
        expect(res.rows).toHaveLength(1);
        const indexdef = (res.rows[0] as { indexdef: string }).indexdef;
        expect(indexdef).toMatch(/UNIQUE INDEX plans_external_uniq/);
        expect(indexdef).toMatch(/\(external_source, external_id\)/);
        expect(indexdef).toMatch(/external_source <> 'native'/);
        expect(indexdef).toMatch(/external_id IS NOT NULL/);
        expect(indexdef).toMatch(/deleted_at IS NULL/);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('creates partial unique index checklist_items_external_uniq with the expected predicate', async () => {
    await withTestDb(HARNESS, async ({ databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const db = plannerDb();
        const res = await db.execute(sql`
          SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'planner' AND indexname = 'checklist_items_external_uniq'
        `);
        expect(res.rows).toHaveLength(1);
        const indexdef = (res.rows[0] as { indexdef: string }).indexdef;
        expect(indexdef).toMatch(/UNIQUE INDEX checklist_items_external_uniq/);
        expect(indexdef).toMatch(/\(task_id, external_id\)/);
        expect(indexdef).toMatch(/external_id IS NOT NULL/);
        expect(indexdef).toMatch(/deleted_at IS NULL/);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('enforces sync_status CHECK on plans and tasks', async () => {
    await withTestDb(HARNESS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const tenant = '11111111-1111-1111-1111-111111111111';
        const groupId = '22222222-2222-2222-2222-222222222222';
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          tenant,
          'T',
          `t-${tenant.slice(0, 8)}`,
        ]);
        await pool.query(
          `INSERT INTO planner.groups (id, tenant_id, name, theme, visibility, default_role, external_source, created_by)
             VALUES ($1, $2, 'G', 'blue', 'private', 'member', 'native', $3)`,
          [groupId, tenant, '33333333-3333-3333-3333-333333333333'],
        );
        await expect(
          pool.query(
            `INSERT INTO planner.plans (tenant_id, group_id, name, created_by, sync_status)
               VALUES ($1, $2, 'P', $3, 'bogus')`,
            [tenant, groupId, '33333333-3333-3333-3333-333333333333'],
          ),
        ).rejects.toThrow(/plans_sync_status_check/);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
