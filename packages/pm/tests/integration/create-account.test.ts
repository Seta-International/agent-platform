import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { account } from '../../src/backend/db/schema.ts';
import { createAccount } from '../../src/index.ts';
import { countEvents, inScope, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('createAccount', () => {
  it('creates an account and emits account.created in one tx', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { account_id } = await inScope(t.adminSession, () =>
          createAccount({
            name: 'Acme Corp',
            industry: 'Fintech',
            session: t.adminSession,
          }),
        );

        const [a] = await inScope(t.adminSession, () =>
          pmDb().select().from(account).where(eq(account.id, account_id)),
        );
        expect(a?.tenant_id).toBe(t.tenant_id);
        expect(a?.name).toBe('Acme Corp');

        const events = await readEvents(pool, t.tenant_id, 'pm.account.created');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(account_id);
        expect(events[0]?.payload.account_id).toBe(account_id);
        expect(events[0]?.payload.name).toBe('Acme Corp');
        expect(events[0]?.payload.am_worker_id).toBeNull();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('emits name and am_worker_id when set', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const workerId = crypto.randomUUID();

        const { account_id } = await inScope(t.adminSession, () =>
          createAccount({
            name: 'Beta Ltd',
            am_worker_id: workerId,
            session: t.adminSession,
          }),
        );

        const events = await readEvents(pool, t.tenant_id, 'pm.account.created');
        expect(events).toHaveLength(1);
        expect(events[0]?.payload.name).toBe('Beta Ltd');
        expect(events[0]?.payload.am_worker_id).toBe(workerId);
        expect(events[0]?.payload.account_id).toBe(account_id);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is atomic: a failure inside the tx persists nothing', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        // am_worker_id 'not-a-uuid' fails the Postgres uuid cast inside the tx → full rollback.
        await expect(
          inScope(t.adminSession, () =>
            createAccount({
              name: 'Atomic Rollback',
              am_worker_id: 'not-a-uuid',
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow();

        const rows = await pool.query(`SELECT count(*)::int n FROM pm.account WHERE tenant_id=$1`, [
          t.tenant_id,
        ]);
        expect(rows.rows[0].n).toBe(0);
        expect(await countEvents(pool, t.tenant_id, 'pm.account.created')).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
