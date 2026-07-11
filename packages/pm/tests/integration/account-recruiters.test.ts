import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { accountRecruiter } from '../../src/backend/db/schema.ts';
import { createAccount, setAccountRecruiters } from '../../src/index.ts';
import { countEvents, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('account recruiters', () => {
  it('createAccount with recruiter_worker_ids inserts rows and emits one assigned per recruiter', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const r1 = crypto.randomUUID();
        const r2 = crypto.randomUUID();
        const { account_id } = await createAccount({
          name: 'Acme',
          recruiter_worker_ids: [r1, r2],
          session: t.adminSession,
        });
        const rows = await pmDb()
          .select()
          .from(accountRecruiter)
          .where(eq(accountRecruiter.account_id, account_id));
        expect(rows).toHaveLength(2);
        expect(await countEvents(pool, t.tenant_id, 'pm.account.recruiter.assigned')).toBe(2);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('setAccountRecruiters diffs: adds new, removes missing, emits matching events', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const r1 = crypto.randomUUID();
        const r2 = crypto.randomUUID();
        const r3 = crypto.randomUUID();
        const { account_id } = await createAccount({
          name: 'Acme',
          recruiter_worker_ids: [r1, r2],
          session: t.adminSession,
        });

        const res = await setAccountRecruiters({
          account_id,
          recruiter_worker_ids: [r2, r3], // remove r1, add r3, keep r2
          session: t.adminSession,
        });
        expect(res).toEqual({ added: 1, removed: 1 });

        const rows = await pmDb()
          .select({ id: accountRecruiter.recruiter_person_id })
          .from(accountRecruiter)
          .where(eq(accountRecruiter.account_id, account_id));
        expect(rows.map((x) => x.id).sort()).toEqual([r2, r3].sort());

        const assigned = await readEvents(pool, t.tenant_id, 'pm.account.recruiter.assigned');
        const unassigned = await readEvents(pool, t.tenant_id, 'pm.account.recruiter.unassigned');
        expect(assigned).toHaveLength(3); // 2 from create + 1 from diff
        expect(unassigned).toHaveLength(1);
        expect(unassigned[0]?.payload.recruiter_worker_id).toBe(r1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('setAccountRecruiters is conflict-safe: pre-existing DB row does not throw and emits no new event', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const r1 = crypto.randomUUID();
        const { account_id } = await createAccount({ name: 'Acme', session: t.adminSession });
        // Directly insert the recruiter row to simulate a concurrent caller having already committed it.
        await pool.query(
          'INSERT INTO pm.account_recruiter (tenant_id, account_id, recruiter_person_id) VALUES ($1,$2,$3)',
          [t.tenant_id, account_id, r1],
        );
        const res = await setAccountRecruiters({
          account_id,
          recruiter_worker_ids: [r1],
          session: t.adminSession,
        });
        expect(res).toEqual({ added: 0, removed: 0 });
        expect(await countEvents(pool, t.tenant_id, 'pm.account.recruiter.assigned')).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('setAccountRecruiters is idempotent: same set emits nothing', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const r1 = crypto.randomUUID();
        const { account_id } = await createAccount({
          name: 'Acme',
          recruiter_worker_ids: [r1],
          session: t.adminSession,
        });
        const res = await setAccountRecruiters({
          account_id,
          recruiter_worker_ids: [r1],
          session: t.adminSession,
        });
        expect(res).toEqual({ added: 0, removed: 0 });
        // only the 1 assigned from create
        expect(await countEvents(pool, t.tenant_id, 'pm.account.recruiter.assigned')).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
