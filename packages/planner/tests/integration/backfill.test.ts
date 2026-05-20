import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const BACKFILL_SQL = readFileSync(
  resolve(__dirname, '../../drizzle/0001_planner_assignee_projection_backfill.sql'),
  'utf-8',
);

const BASE_URL = process.env.SETA_TEST_PG_BASE as string;
const TEMPLATE = process.env.SETA_TEST_PG_TEMPLATE as string;

describe('backfill migration: 0001_planner_assignee_projection_backfill', () => {
  it('seeds assignee_projection rows from identity.user + identity.user_profile for existing users', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId1 = crypto.randomUUID();
          const userId2 = crypto.randomUUID();

          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantId,
            'BF Tenant',
            `bf-${tenantId.slice(0, 8)}`,
          ]);

          // Insert users directly into identity."user" (bypassing domain to simulate pre-subscriber state)
          await pool.query(
            `INSERT INTO identity."user" (id, email, name, email_verified, tenant_id)
           VALUES ($1, $2, $3, false, $4), ($5, $6, $7, false, $8)`,
            [
              userId1,
              'u1@example.test',
              'User One',
              tenantId,
              userId2,
              'u2@example.test',
              'User Two',
              tenantId,
            ],
          );

          // Insert a user_profile for userId1 only
          await pool.query(
            `INSERT INTO identity.user_profile (user_id, tenant_id, skills, availability_status, timezone)
           VALUES ($1, $2, ARRAY['python','go'], 'busy', 'America/New_York')`,
            [userId1, tenantId],
          );

          // Clear assignee_projection to simulate fresh state before backfill
          await pool.query(`TRUNCATE planner.assignee_projection`);

          // Run the backfill
          await pool.query(BACKFILL_SQL);

          const { rows } = await pool.query(
            `SELECT user_id, display_name, email, skills, availability_status, timezone
             FROM planner.assignee_projection
            WHERE user_id = ANY($1::uuid[])
            ORDER BY email`,
            [[userId1, userId2]],
          );

          expect(rows).toHaveLength(2);

          // userId1 has a profile row — should get its values
          const row1 = rows.find((r: { user_id: string }) => r.user_id === userId1)!;
          expect(row1.display_name).toBe('User One');
          expect(row1.email).toBe('u1@example.test');
          expect(row1.skills).toEqual(['python', 'go']);
          expect(row1.availability_status).toBe('busy');
          expect(row1.timezone).toBe('America/New_York');

          // userId2 has no profile row — should get COALESCE defaults
          const row2 = rows.find((r: { user_id: string }) => r.user_id === userId2)!;
          expect(row2.display_name).toBe('User Two');
          expect(row2.email).toBe('u2@example.test');
          expect(row2.skills).toEqual([]);
          expect(row2.availability_status).toBe('available');
          expect(row2.timezone).toBe('UTC');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is idempotent: re-running the backfill does not duplicate rows', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();

          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantId,
            'BF2 Tenant',
            `bf2-${tenantId.slice(0, 8)}`,
          ]);

          await pool.query(
            `INSERT INTO identity."user" (id, email, name, email_verified, tenant_id)
           VALUES ($1, $2, $3, false, $4)`,
            [userId, 'dup@example.test', 'Dup User', tenantId],
          );

          // Run twice
          await pool.query(BACKFILL_SQL);
          await pool.query(BACKFILL_SQL);

          const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM planner.assignee_projection WHERE user_id = $1`,
            [userId],
          );
          expect(rows[0].n).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
