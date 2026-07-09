import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { argon2id } from '../../src/backend/argon2.ts';
import { identityDb, resetIdentityDb } from '../../src/backend/db/index.ts';
import { account, user } from '../../src/backend/db/schema.ts';
import { ensureLocalLogin, provisionLogin } from '../../src/index.ts';
import { seedTenantRaw } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const SYS = { type: 'system', user_id: null } as const;

describe('ensureLocalLogin', () => {
  it('is idempotent: provisionLogin then ensureLocalLogin twice yields one usable credential', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenantId = await seedTenantRaw(pool);

        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context identityDb() requires.
        await scoped(tenantId, async () => {
          // Subscriber-driven path: a credential-less user with email_verified=false.
          const { user_id } = await provisionLogin(
            { tenant_id: tenantId, email: 'eve@corp.test', name: 'Eve' },
            SYS,
          );
          const [before] = await identityDb().select().from(user).where(eq(user.id, user_id));
          expect(before?.email_verified).toBe(false);

          await ensureLocalLogin({ user_id, tenant_id: tenantId, password: 'ChangeMe@2026' }, SYS);
          // Re-run must not error and must keep exactly one credential account.
          await ensureLocalLogin({ user_id, tenant_id: tenantId, password: 'ChangeMe@2026' }, SYS);

          const [after] = await identityDb().select().from(user).where(eq(user.id, user_id));
          expect(after?.email_verified).toBe(true);

          const creds = await identityDb()
            .select()
            .from(account)
            .where(and(eq(account.user_id, user_id), eq(account.provider_id, 'credential')));
          expect(creds).toHaveLength(1);
          expect(creds[0]?.password).toBeTruthy();
          expect(await argon2id.verify(creds[0]!.password!, 'ChangeMe@2026')).toBe(true);
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('updates the stored hash when called again with a different password', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenantId = await seedTenantRaw(pool);
        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context identityDb() requires.
        await scoped(tenantId, async () => {
          const { user_id } = await provisionLogin(
            { tenant_id: tenantId, email: 'rot@corp.test', name: 'Rot' },
            SYS,
          );
          await ensureLocalLogin(
            { user_id, tenant_id: tenantId, password: 'FirstPassword@1' },
            SYS,
          );
          await ensureLocalLogin(
            { user_id, tenant_id: tenantId, password: 'SecondPassword@2' },
            SYS,
          );

          const creds = await identityDb()
            .select()
            .from(account)
            .where(and(eq(account.user_id, user_id), eq(account.provider_id, 'credential')));
          expect(creds).toHaveLength(1);
          expect(await argon2id.verify(creds[0]!.password!, 'SecondPassword@2')).toBe(true);
          expect(await argon2id.verify(creds[0]!.password!, 'FirstPassword@1')).toBe(false);
        });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws NOT_FOUND for a user that does not exist in the tenant', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenantId = await seedTenantRaw(pool);
        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context identityDb() requires.
        await expect(
          scoped(tenantId, () =>
            ensureLocalLogin(
              { user_id: crypto.randomUUID(), tenant_id: tenantId, password: 'whateverpass@1' },
              SYS,
            ),
          ),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
