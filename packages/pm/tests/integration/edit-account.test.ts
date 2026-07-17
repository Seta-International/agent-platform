import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { account } from '../../src/backend/db/schema.ts';
import { createAccount, editAccount } from '../../src/index.ts';
import { buildSession, countEvents, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('editAccount', () => {
  it('updates fields, bumps version, emits account.updated with changed fields', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { account_id } = await createAccount({ name: 'Acme', session: t.adminSession });

        const r = await editAccount({
          account_id,
          patch: { name: 'Acme Corp', industry: 'Fintech' },
          session: t.adminSession,
        });
        expect(r.version).toBe(2);

        const [a] = await pmDb().select().from(account).where(eq(account.id, account_id));
        expect(a?.name).toBe('Acme Corp');
        expect(a?.industry).toBe('Fintech');

        const events = await readEvents(pool, t.tenant_id, 'pm.account.updated');
        expect(events).toHaveLength(1);
        expect((events[0]!.payload.fields as string[]).sort()).toEqual(['industry', 'name']);
        expect(events[0]?.payload.name).toBe('Acme Corp');
        expect(events[0]?.payload.am_worker_id).toBeNull();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('emits updated name and am_worker_id in payload (including explicit null)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const workerId = crypto.randomUUID();
        const { account_id } = await createAccount({
          name: 'Gamma',
          am_worker_id: workerId,
          session: t.adminSession,
        });

        // Set am_worker_id to null explicitly
        await editAccount({
          account_id,
          patch: { name: 'Gamma Updated', am_worker_id: null },
          session: t.adminSession,
        });

        const events = await readEvents(pool, t.tenant_id, 'pm.account.updated');
        expect(events).toHaveLength(1);
        expect(events[0]?.payload.name).toBe('Gamma Updated');
        expect(events[0]?.payload.am_worker_id).toBeNull();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('no-op when nothing changes: no event, version unchanged', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { account_id } = await createAccount({ name: 'Acme', session: t.adminSession });
        const r = await editAccount({
          account_id,
          patch: { name: 'Acme' },
          session: t.adminSession,
        });
        expect(r.version).toBe(1);
        expect(await countEvents(pool, t.tenant_id, 'pm.account.updated')).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('stale expected_version throws CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { account_id } = await createAccount({ name: 'Acme', session: t.adminSession });
        await expect(
          editAccount({
            account_id,
            expected_version: 99,
            patch: { name: 'X' },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('viewer cannot edit (FORBIDDEN); cross-tenant is NOT_FOUND', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t1 = await seedTenant(pool);
        const t2 = await seedTenant(pool);
        const { account_id } = await createAccount({ name: 'Acme', session: t1.adminSession });

        const viewer = buildSession({
          tenant_id: t1.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['pm.viewer'],
        });
        await expect(
          editAccount({ account_id, patch: { name: 'Y' }, session: viewer }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });

        await expect(
          editAccount({ account_id, patch: { name: 'Z' }, session: t2.adminSession }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
