import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { identityDb, resetIdentityDb } from '../../src/backend/db/index.ts';
import { user } from '../../src/backend/db/schema.ts';
import { provisionLogin, syncLoginIdentity } from '../../src/index.ts';
import { seedTenantRaw } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('syncLoginIdentity', () => {
  it('pushes a new name and email into the satellite', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenantId = await seedTenantRaw(pool);
        const { user_id } = await provisionLogin(
          { tenant_id: tenantId, email: 'old@corp.test', name: 'Old Name' },
          { type: 'system', user_id: null },
        );
        await syncLoginIdentity(
          { user_id, email: 'new@corp.test', name: 'New Name' },
          { type: 'system', user_id: null },
        );
        const [u] = await identityDb().select().from(user).where(eq(user.id, user_id));
        expect(u?.email).toBe('new@corp.test');
        expect(u?.name).toBe('New Name');
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
