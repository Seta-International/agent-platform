import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleGetAvailabilitySpec } from '../../src/backend/agent-tools/get-availability-for-user.ts';
import { peopleGetTimezoneSpec } from '../../src/backend/agent-tools/get-timezone-for-user.ts';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person } from '../../src/backend/db/schema.ts';
import { provisionWorker, readPresence, setPresence } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('setPresence / readPresence / agent-tools', () => {
  it('set + read presence round-trips correctly', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { worker_id } = await provisionWorker({
          full_name: 'Presence Worker',
          start_date: '2026-01-01',
          employment_type: 'full_time',
          session: t.adminSession,
        });

        // Link person to the admin user so setPresence (self-service) can find the worker
        await peopleDb()
          .update(person)
          .set({ user_id: t.admin_user_id })
          .where(eq(person.id, worker_id));

        const ooo = new Date(Date.now() + 86_400_000);

        await setPresence(t.adminSession, {
          availability_status: 'ooo',
          ooo_until: ooo,
          working_hours: { start: '09:00', end: '17:00' },
          timezone: 'Asia/Ho_Chi_Minh',
        });

        const result = await readPresence(t.adminSession, { user_id: t.admin_user_id });

        expect(result.availability_status).toBe('ooo');
        expect(result.ooo_until?.toISOString()).toBe(ooo.toISOString());
        expect(result.working_hours).toEqual({ start: '09:00', end: '17:00' });
        expect(result.timezone).toBe('Asia/Ho_Chi_Minh');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('people_getAvailabilityForUser agent-tool returns same values', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { worker_id } = await provisionWorker({
          full_name: 'Avail Worker',
          start_date: '2026-01-01',
          employment_type: 'full_time',
          session: t.adminSession,
        });

        await peopleDb()
          .update(person)
          .set({ user_id: t.admin_user_id })
          .where(eq(person.id, worker_id));

        await setPresence(t.adminSession, {
          availability_status: 'busy',
          working_hours: { start: '08:00', end: '16:00' },
        });

        const toolResult = await peopleGetAvailabilitySpec.execute({
          session: {
            tenant_id: t.tenant_id,
            user_id: t.admin_user_id,
            role_summary: { roles: ['people.manager'], cross_tenant_read: false },
          },
          input: { userId: t.admin_user_id },
        });

        const domainResult = await readPresence(t.adminSession, { user_id: t.admin_user_id });

        expect(toolResult.availability_status).toBe(domainResult.availability_status);
        expect(toolResult.working_hours).toEqual(domainResult.working_hours);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('people_getTimezoneForUser agent-tool returns same timezone', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { worker_id } = await provisionWorker({
          full_name: 'TZ Worker',
          start_date: '2026-01-01',
          employment_type: 'full_time',
          session: t.adminSession,
        });

        await peopleDb()
          .update(person)
          .set({ user_id: t.admin_user_id })
          .where(eq(person.id, worker_id));

        await setPresence(t.adminSession, { timezone: 'America/New_York' });

        const toolResult = await peopleGetTimezoneSpec.execute({
          session: {
            tenant_id: t.tenant_id,
            user_id: t.admin_user_id,
            role_summary: { roles: ['people.manager'], cross_tenant_read: false },
          },
          input: { userId: t.admin_user_id },
        });

        expect(toolResult.timezone).toBe('America/New_York');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('readPresence defaults to available/UTC for unknown user_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const result = await readPresence(t.adminSession, { user_id: crypto.randomUUID() });

        expect(result.availability_status).toBe('available');
        expect(result.ooo_until).toBeNull();
        expect(result.working_hours).toBeNull();
        expect(result.timezone).toBe('UTC');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('people_getAvailabilityForUser defaults to available for unknown user_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const toolResult = await peopleGetAvailabilitySpec.execute({
          session: {
            tenant_id: t.tenant_id,
            user_id: crypto.randomUUID(),
            role_summary: { roles: ['org.admin'], cross_tenant_read: false },
          },
          input: { userId: crypto.randomUUID() },
        });

        expect(toolResult.availability_status).toBe('available');
        expect(toolResult.ooo_until).toBeNull();
        expect(toolResult.working_hours).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
