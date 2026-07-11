// packages/hiring/tests/integration/reason-migration.test.ts
// Proves the shipped 0012 data migration (opening_close_reason + rejection_reason -> reason)
// against a real Postgres. The testcontainers harness already ran 0012 once during setup
// (a no-op against empty tables), so this test seeds fresh rows into the still-live source
// tables AFTER setup and re-runs the SHIPPED 0012 file verbatim to exercise the copy.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const MIGRATION_0012 = fileURLToPath(
  new URL('../../drizzle/migrations/0012_copy_reason_rows.sql', import.meta.url),
);

async function runMigration0012(pool: Pool): Promise<void> {
  const body = readFileSync(MIGRATION_0012, 'utf-8');
  await pool.query(body);
}

describe('0012 opening_close_reason + rejection_reason -> reason data migration', () => {
  it('copies both source tables into reason preserving id, kind, label, category and leaves sources intact', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const r1 = await pool.query(
          `INSERT INTO hiring.opening_close_reason (tenant_id, label) VALUES ($1, $2) RETURNING id`,
          [t.tenant_id, 'Budget cut'],
        );
        const r1Id = r1.rows[0].id as string;

        const r2 = await pool.query(
          `INSERT INTO hiring.rejection_reason (tenant_id, label, category) VALUES ($1, $2, $3) RETURNING id`,
          [t.tenant_id, 'Failed screen', 'rejected_by_us'],
        );
        const r2Id = r2.rows[0].id as string;

        await runMigration0012(pool);

        const reason1 = await pool.query(`SELECT * FROM hiring.reason WHERE id = $1`, [r1Id]);
        expect(reason1.rows).toHaveLength(1);
        expect(reason1.rows[0]).toMatchObject({
          id: r1Id,
          kind: 'opening_close',
          label: 'Budget cut',
          category: null,
        });

        const reason2 = await pool.query(`SELECT * FROM hiring.reason WHERE id = $1`, [r2Id]);
        expect(reason2.rows).toHaveLength(1);
        expect(reason2.rows[0]).toMatchObject({
          id: r2Id,
          kind: 'rejection',
          label: 'Failed screen',
          category: 'rejected_by_us',
        });

        // sources intact: copy, not move
        const source1 = await pool.query(
          `SELECT id FROM hiring.opening_close_reason WHERE id = $1`,
          [r1Id],
        );
        expect(source1.rows).toHaveLength(1);

        const source2 = await pool.query(`SELECT id FROM hiring.rejection_reason WHERE id = $1`, [
          r2Id,
        ]);
        expect(source2.rows).toHaveLength(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
