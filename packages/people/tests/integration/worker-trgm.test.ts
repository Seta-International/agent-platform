import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { provisionWorker } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('worker pg_trgm GIN indexes', () => {
  it('pg_trgm extension is installed', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const r = await pool.query(`SELECT 1 FROM pg_extension WHERE extname='pg_trgm'`);
      expect(r.rowCount).toBe(1);
    });
  });

  it('all three trigram indexes exist', async () => {
    await withTestDb(ctx, async ({ pool }) => {
      const r = await pool.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname='people'
           AND indexname IN ('worker_full_name_trgm','worker_work_email_trgm','worker_job_title_trgm')
         ORDER BY indexname`,
      );
      expect(r.rowCount).toBe(3);
      expect(r.rows.map((x: { indexname: string }) => x.indexname)).toEqual([
        'worker_full_name_trgm',
        'worker_job_title_trgm',
        'worker_work_email_trgm',
      ]);
    });
  });

  it('case-insensitive substring search over full_name returns the seeded worker', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await provisionWorker({
          full_name: 'Trigram Testworker',
          start_date: '2026-06-21',
          employment_type: 'full_time',
          session: t.adminSession,
        });
        const r = await pool.query(
          `SELECT full_name FROM people.worker WHERE full_name ILIKE '%trigram%'`,
        );
        expect(r.rowCount).toBeGreaterThanOrEqual(1);
        expect(r.rows[0].full_name).toBe('Trigram Testworker');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
