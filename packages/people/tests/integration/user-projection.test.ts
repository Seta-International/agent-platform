import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { userProjection } from '../../src/backend/db/schema.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('people.user_projection', () => {
  it('stores the person->user link keyed on user_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const userId = crypto.randomUUID();
        const personId = crypto.randomUUID();

        await peopleDb()
          .insert(userProjection)
          .values({ user_id: userId, person_id: personId, tenant_id: t.tenant_id });

        const [row] = await peopleDb()
          .select()
          .from(userProjection)
          .where(
            and(eq(userProjection.user_id, userId), eq(userProjection.tenant_id, t.tenant_id)),
          );

        expect(row?.person_id).toBe(personId);
        expect(row?.deactivated_at).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('refuses two users in one tenant claiming the same person', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();

        await peopleDb()
          .insert(userProjection)
          .values({ user_id: crypto.randomUUID(), person_id: personId, tenant_id: t.tenant_id });

        await expect(
          peopleDb()
            .insert(userProjection)
            .values({ user_id: crypto.randomUUID(), person_id: personId, tenant_id: t.tenant_id }),
        ).rejects.toThrow();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
