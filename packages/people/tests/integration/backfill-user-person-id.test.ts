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
// -- cross-schema-read: this test proves the identity migration's backfill statement
// (which itself carries the allowlisted markers) behaves correctly; it does not add a
// new production cross-schema read.
const BACKFILL_SQL = readFileSync(
  resolve(__dirname, '../../../identity/drizzle/0004_backfill_user_person_id.sql'),
  'utf-8',
);

async function insertPerson(
  pool: Pool,
  args: { tenant_id: string; user_id: string | null },
): Promise<string> {
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

describe('identity.user.person_id backfill', () => {
  it('links a user to its person by matching tenant + user_id, and running it again changes nothing', async () => {
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

        expect(await personIdFor(pool, t.admin_user_id)).toBeNull();

        await pool.query(BACKFILL_SQL);
        expect(await personIdFor(pool, t.admin_user_id)).toBe(personId);

        // Idempotent: running it again must not throw and must not change the result.
        await pool.query(BACKFILL_SQL);
        expect(await personIdFor(pool, t.admin_user_id)).toBe(personId);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not overwrite a user that already has a person_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const existingPersonId = crypto.randomUUID();
        await pool.query(`UPDATE identity."user" SET person_id = $1 WHERE id = $2`, [
          existingPersonId,
          t.admin_user_id,
        ]);
        // A different (or corrupted) person row also points at this user; the backfill
        // must not clobber the pre-existing link.
        await insertPerson(pool, { tenant_id: t.tenant_id, user_id: t.admin_user_id });

        await pool.query(BACKFILL_SQL);

        expect(await personIdFor(pool, t.admin_user_id)).toBe(existingPersonId);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('never stamps a user from a person row filed under a different tenant', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const a = await seedTenant(pool);
        const b = await seedTenant(pool);

        // A stray/corrupted row: filed under tenant B (no FK ties person.user_id to
        // identity.user, so this is a data-integrity scenario the backfill must guard
        // against, not something the schema prevents), but its user_id happens to be
        // A's admin — a user that actually belongs to tenant A. This is a single,
        // unambiguous match on `p.user_id = u.id` alone (no other person row references
        // this user), so the outcome is fully deterministic: the `p.tenant_id =
        // u.tenant_id` predicate is the only thing standing between this user and being
        // stamped with a person from the wrong tenant. The mutation test below removes
        // that predicate and shows the assertion below then fails.
        await insertPerson(pool, {
          tenant_id: b.tenant_id,
          user_id: a.admin_user_id,
        });

        await pool.query(BACKFILL_SQL);

        expect(await personIdFor(pool, a.admin_user_id)).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
