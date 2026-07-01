import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { identityDb, resetIdentityDb } from '../../src/backend/db/index.ts';
import { account, user } from '../../src/backend/db/schema.ts';
import { provisionLogin } from '../../src/index.ts';
import { seedTenantRaw } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('provisionLogin', () => {
  it('creates a user + profile with no credential account and emits user.created', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenantId = await seedTenantRaw(pool);
        const r = await provisionLogin(
          { tenant_id: tenantId, email: 'Alice.Work@corp.test', name: 'Alice Work' },
          { type: 'system', user_id: null },
        );
        expect(r.created).toBe(true);

        const [u] = await identityDb().select().from(user).where(eq(user.id, r.user_id));
        expect(u?.email).toBe('alice.work@corp.test');
        expect(u?.name).toBe('Alice Work');

        const accts = await identityDb()
          .select()
          .from(account)
          .where(eq(account.user_id, r.user_id));
        expect(accts).toHaveLength(0);

        const ev = await pool.query(
          `SELECT count(*)::int n FROM core.events WHERE tenant_id=$1 AND event_type='identity.user.created'`,
          [tenantId],
        );
        expect(ev.rows[0].n).toBe(1);
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is idempotent on (tenant, email): second call returns the same id, no duplicate', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenantId = await seedTenantRaw(pool);
        const a = await provisionLogin(
          { tenant_id: tenantId, email: 'dup@corp.test', name: 'Dup' },
          { type: 'system', user_id: null },
        );
        const b = await provisionLogin(
          { tenant_id: tenantId, email: 'DUP@corp.test', name: 'Dup' },
          { type: 'system', user_id: null },
        );
        expect(b.user_id).toBe(a.user_id);
        expect(b.created).toBe(false);
        const rows = await identityDb()
          .select()
          .from(user)
          .where(and(eq(user.tenant_id, tenantId)));
        expect(rows.filter((u) => u.email === 'dup@corp.test')).toHaveLength(1);
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is concurrency-safe: parallel calls for the same (tenant, email) yield one user, one created', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenantId = await seedTenantRaw(pool);

        // The pre-SELECT is a fast-path, not a guard; fire enough parallel calls that
        // several race past it into the insert and hit ON CONFLICT DO NOTHING.
        const results = await Promise.all(
          Array.from({ length: 8 }, () =>
            provisionLogin(
              { tenant_id: tenantId, email: 'Race@corp.test', name: 'Race' },
              { type: 'system', user_id: null },
            ),
          ),
        );

        const ids = new Set(results.map((r) => r.user_id));
        expect(ids.size).toBe(1);
        expect(results.filter((r) => r.created)).toHaveLength(1);

        const rows = await identityDb()
          .select()
          .from(user)
          .where(and(eq(user.tenant_id, tenantId), eq(user.email, 'race@corp.test')));
        expect(rows).toHaveLength(1);

        const ev = await pool.query(
          `SELECT count(*)::int n FROM core.events WHERE tenant_id=$1 AND event_type='identity.user.created'`,
          [tenantId],
        );
        expect(ev.rows[0].n).toBe(1);
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
