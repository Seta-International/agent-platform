import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person, userProjection } from '../../src/backend/db/schema.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BACKFILL_SQL = readFileSync(
  resolve(__dirname, '../../drizzle/migrations/0006_backfill_user_projection.sql'),
  'utf-8',
);

describe('people.user_projection backfill (0006)', () => {
  it('populates user_projection from identity.user.person_id, idempotently', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const [p] = await peopleDb().insert(person).values({ tenant_id: t.tenant_id }).returning();
        const personId = p!.id;

        // The pre-existing user (from before the link subscriber shipped): identity.user carries
        // the canonical person_id (backfilled by Task 5) but nothing ever created its projection row.
        await pool.query(`UPDATE identity."user" SET person_id = $1 WHERE id = $2`, [
          personId,
          t.admin_user_id,
        ]);

        const before = await peopleDb()
          .select()
          .from(userProjection)
          .where(eq(userProjection.user_id, t.admin_user_id));
        expect(before).toHaveLength(0);

        await pool.query(BACKFILL_SQL);

        const [row] = await peopleDb()
          .select()
          .from(userProjection)
          .where(
            and(
              eq(userProjection.user_id, t.admin_user_id),
              eq(userProjection.tenant_id, t.tenant_id),
            ),
          );
        expect(row?.person_id).toBe(personId);

        // Idempotent: a second run (subscriber may have raced, or migrate re-applied) is a no-op.
        await pool.query(BACKFILL_SQL);
        const after = await peopleDb()
          .select()
          .from(userProjection)
          .where(eq(userProjection.user_id, t.admin_user_id));
        expect(after).toHaveLength(1);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('skips users with no person_id (unlinked accounts get no projection row)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        // seedTenant's admin has person_id NULL and no worker — the backfill must not invent a link.
        await pool.query(BACKFILL_SQL);

        const rows = await peopleDb()
          .select()
          .from(userProjection)
          .where(eq(userProjection.user_id, t.admin_user_id));
        expect(rows).toHaveLength(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
