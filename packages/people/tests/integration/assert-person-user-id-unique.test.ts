import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// -- cross-schema-read: this test executes the identity guard/backfill migration statements
// (which themselves carry the allowlisted markers); it adds no new production cross-schema read.
const ASSERT_SQL = readFileSync(
  resolve(
    __dirname,
    '../../../identity/drizzle/0003b_assert_person_user_id_unique_before_backfill.sql',
  ),
  'utf-8',
);
const BACKFILL_SQL = readFileSync(
  resolve(__dirname, '../../../identity/drizzle/0004_backfill_user_person_id.sql'),
  'utf-8',
);

async function insertPerson(
  pool: Pool,
  args: { tenant_id: string; user_id: string | null },
): Promise<string> {
  // people.person.user_id was dropped once the projection replaced it; this test validates a
  // still-live identity migration whose premise is that the column existed, so re-add it to seed
  // the historical precondition. Idempotent — first caller adds it, the rest no-op.
  await pool.query(`ALTER TABLE people.person ADD COLUMN IF NOT EXISTS user_id uuid`);
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO people.person (id, tenant_id, user_id) VALUES ($1, $2, $3)`, [
    id,
    args.tenant_id,
    args.user_id,
  ]);
  return id;
}

async function personIdFor(pool: Pool, user_id: string): Promise<string | null> {
  const { rows } = await pool.query<{ person_id: string | null }>(
    `SELECT person_id FROM identity."user" WHERE id = $1`,
    [user_id],
  );
  return rows[0]?.person_id ?? null;
}

describe('pre-backfill person.user_id ambiguity guard', () => {
  it('raises when two person rows in one tenant share a user_id, before the backfill can run', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        // Two person rows, same tenant, same user_id — allowed by the schema (the
        // person_by_tenant_user index is NON-unique and there is no FK). identity.user
        // .person_id is left NULL (seedTenant does not set it), so 0004's
        // `u.person_id IS NULL` guard would NOT short-circuit — the ambiguous UPDATE
        // would fire and stamp an arbitrary one of these two persons onto the user.
        await insertPerson(pool, { tenant_id: t.tenant_id, user_id: t.admin_user_id });
        await insertPerson(pool, { tenant_id: t.tenant_id, user_id: t.admin_user_id });
        expect(await personIdFor(pool, t.admin_user_id)).toBeNull();

        await expect(pool.query(ASSERT_SQL)).rejects.toThrow(/backfill aborted/i);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('passes on unambiguous data and lets the backfill link the user', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = await insertPerson(pool, {
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
        });

        // Guard must not throw when every (tenant_id, user_id) is unique.
        await expect(pool.query(ASSERT_SQL)).resolves.toBeDefined();

        // ...and the backfill it protects still links correctly afterward.
        await pool.query(BACKFILL_SQL);
        expect(await personIdFor(pool, t.admin_user_id)).toBe(personId);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
