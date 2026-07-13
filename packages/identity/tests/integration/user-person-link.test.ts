import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { identityDb, resetIdentityDb } from '../../src/backend/db/index.ts';
import { user } from '../../src/backend/db/schema.ts';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { seedTenantRaw } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('identity.user.person_id', () => {
  it('defaults to null and accepts a bare person uuid', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenant_id = await seedTenantRaw(pool);
        const { user_id } = await createUser(
          { tenant_id, email: 'ana@seta.test', name: 'Ana', password: 'x' },
          { type: 'cli', user_id: null },
        );

        const [before] = await identityDb().select().from(user).where(eq(user.id, user_id));
        expect(before?.person_id).toBeNull();

        const personId = crypto.randomUUID();
        await identityDb().update(user).set({ person_id: personId }).where(eq(user.id, user_id));

        const [after] = await identityDb().select().from(user).where(eq(user.id, user_id));
        expect(after?.person_id).toBe(personId);
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects two users in one tenant claiming the same person', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenant_id = await seedTenantRaw(pool);
        const personId = crypto.randomUUID();
        const { user_id: a } = await createUser(
          { tenant_id, email: 'a@seta.test', name: 'A', password: 'x' },
          { type: 'cli', user_id: null },
        );
        const { user_id: b } = await createUser(
          { tenant_id, email: 'b@seta.test', name: 'B', password: 'x' },
          { type: 'cli', user_id: null },
        );

        await identityDb().update(user).set({ person_id: personId }).where(eq(user.id, a));
        await expect(
          identityDb().update(user).set({ person_id: personId }).where(eq(user.id, b)),
        ).rejects.toThrow();
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
