import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { createUser, updateUserProfile } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { identityGetAvailabilitySpec } from '../../../src/backend/agent-tools/get-availability-for-user.ts';
import { identityGetTimezoneSpec } from '../../../src/backend/agent-tools/get-timezone-for-user.ts';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      const reg = createContributionRegistry();
      registerCoreContributions(reg);
      const { registerIdentityContributions } = await import('@seta/identity/register');
      registerIdentityContributions(reg);
      await runMigrations(reg, { pool: pool as Parameters<typeof runMigrations>[1]['pool'] });
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );

async function seedUserProfile(
  pool: import('pg').Pool,
  opts: {
    timezone?: string;
    availability_status?: 'available' | 'busy' | 'ooo';
    ooo_until?: Date | null;
    working_hours?: { start: string; end: string } | null;
  } = {},
): Promise<{ tenantId: string; userId: string }> {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenantId,
    'Demo',
    `t-${tenantId.slice(0, 8)}`,
  ]);
  const { user_id } = await createUser(
    {
      tenant_id: tenantId,
      email: `u-${tenantId.slice(0, 8)}@d.local`,
      name: 'U',
      password: 'ChangeMe@2026',
    },
    { type: 'cli', user_id: null },
  );
  await updateUserProfile(
    user_id,
    {
      ...(opts.timezone !== undefined ? { timezone: opts.timezone } : {}),
      ...(opts.availability_status !== undefined
        ? { availability_status: opts.availability_status }
        : {}),
      ...(opts.ooo_until !== undefined ? { ooo_until: opts.ooo_until } : {}),
      ...(opts.working_hours !== undefined ? { working_hours: opts.working_hours } : {}),
    },
    { type: 'user', user_id },
  );
  return { tenantId, userId: user_id };
}

describe('identity_getTimezoneForUser', () => {
  it('returns the user timezone', () =>
    withDb(async ({ pool }) => {
      const { tenantId, userId } = await seedUserProfile(pool, { timezone: 'Asia/Ho_Chi_Minh' });
      const out = await identityGetTimezoneSpec.execute({
        session: { tenant_id: tenantId, user_id: userId },
        input: { userId },
      });
      expect(out.timezone).toBe('Asia/Ho_Chi_Minh');
    }));

  it("defaults to 'UTC' for unknown user", () =>
    withDb(async ({ pool }) => {
      const { tenantId } = await seedUserProfile(pool);
      const out = await identityGetTimezoneSpec.execute({
        session: { tenant_id: tenantId, user_id: crypto.randomUUID() },
        input: { userId: crypto.randomUUID() },
      });
      expect(out.timezone).toBe('UTC');
    }));
});

describe('identity_getAvailabilityForUser', () => {
  it('returns status + ooo_until + working_hours', () =>
    withDb(async ({ pool }) => {
      const ooo = new Date(Date.now() + 86_400_000);
      const { tenantId, userId } = await seedUserProfile(pool, {
        availability_status: 'ooo',
        ooo_until: ooo,
        working_hours: { start: '09:00', end: '17:00' },
      });
      const out = await identityGetAvailabilitySpec.execute({
        session: { tenant_id: tenantId, user_id: userId },
        input: { userId },
      });
      expect(out.availability_status).toBe('ooo');
      expect(out.ooo_until?.toISOString()).toBe(ooo.toISOString());
      expect(out.working_hours).toEqual({ start: '09:00', end: '17:00' });
    }));

  it('defaults to available for unknown user', () =>
    withDb(async ({ pool }) => {
      const { tenantId } = await seedUserProfile(pool);
      const out = await identityGetAvailabilitySpec.execute({
        session: { tenant_id: tenantId, user_id: crypto.randomUUID() },
        input: { userId: crypto.randomUUID() },
      });
      expect(out.availability_status).toBe('available');
      expect(out.ooo_until).toBeNull();
      expect(out.working_hours).toBeNull();
    }));
});
