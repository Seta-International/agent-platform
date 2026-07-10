import type { SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person } from '../../src/backend/db/schema.ts';
import { provisionWorker, readMyProfile, setBio } from '../../src/index.ts';
import { inScope, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function linkSelf(workerId: string, userId: string): Promise<void> {
  await peopleDb().update(person).set({ user_id: userId }).where(eq(person.id, workerId));
}

function narrowSession(base: SessionScope, perms: string[]): SessionScope {
  return { ...base, permissions: new Set(perms) };
}

describe('self-service /me uses people.self.* (not people.worker.read)', () => {
  it('readMyProfile resolves with only people.self.read (no people.worker.read)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await inScope(t.adminSession, async () => {
          const { worker_id } = await provisionWorker({
            full_name: 'Self Read User',
            start_date: '2026-01-01',
            employment_type: 'full_time',
            session: t.adminSession,
          });
          await linkSelf(worker_id, t.admin_user_id);

          const selfReadSession = narrowSession(t.adminSession, ['people.self.read']);
          await expect(readMyProfile(selfReadSession)).resolves.toBeDefined();
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('readMyProfile rejects when no self.read and no worker.read', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await inScope(t.adminSession, async () => {
          const { worker_id } = await provisionWorker({
            full_name: 'No Perms User',
            start_date: '2026-01-01',
            employment_type: 'full_time',
            session: t.adminSession,
          });
          await linkSelf(worker_id, t.admin_user_id);

          const emptySession = narrowSession(t.adminSession, []);
          await expect(readMyProfile(emptySession)).rejects.toThrow();
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('setBio resolves with only people.self.manage (no people.worker.read)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await inScope(t.adminSession, async () => {
          const { worker_id } = await provisionWorker({
            full_name: 'Bio Writer',
            start_date: '2026-01-01',
            employment_type: 'full_time',
            session: t.adminSession,
          });
          await linkSelf(worker_id, t.admin_user_id);

          const selfManageSession = narrowSession(t.adminSession, ['people.self.manage']);
          await expect(setBio(selfManageSession, { bio: 'hello' })).resolves.toBeUndefined();
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('setBio rejects when no self.manage and no worker.read', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await inScope(t.adminSession, async () => {
          const { worker_id } = await provisionWorker({
            full_name: 'No Write Perms',
            start_date: '2026-01-01',
            employment_type: 'full_time',
            session: t.adminSession,
          });
          await linkSelf(worker_id, t.admin_user_id);

          const emptySession = narrowSession(t.adminSession, []);
          await expect(setBio(emptySession, { bio: 'x' })).rejects.toThrow();
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
