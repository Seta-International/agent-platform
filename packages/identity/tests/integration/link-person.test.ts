import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetIdentityDb } from '../../src/backend/db/index.ts';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { linkPersonSubscribers } from '../../src/backend/subscribers/link-person.ts';
import { dispatch } from '../helpers/bus.ts';
import { seedTenantRaw } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const EVENT_TYPE = 'people.worker.user_linked';

async function readUser(pool: import('pg').Pool, userId: string) {
  const { rows } = await pool.query(
    `SELECT person_id, xmin::text::bigint AS xmin FROM identity."user" WHERE id = $1`,
    [userId],
  );
  return rows[0] as { person_id: string | null; xmin: string } | undefined;
}

describe('identity link-person subscriber', () => {
  it('stamps person_id onto the user, and redelivery is a no-op', async () => {
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
        const person_id = crypto.randomUUID();
        const ev = {
          eventType: EVENT_TYPE,
          tenantId: tenant_id,
          payload: { worker_id: person_id, person_id, user_id, tenant_id },
        };

        await dispatch(linkPersonSubscribers, ev);
        const afterFirst = await readUser(pool, user_id);
        expect(afterFirst?.person_id).toBe(person_id);

        await dispatch(linkPersonSubscribers, ev);
        const afterSecond = await readUser(pool, user_id);
        expect(afterSecond?.person_id).toBe(person_id);
        // xmin is Postgres's row-version system column: it only changes when a
        // physical UPDATE rewrites the tuple. Unchanged xmin proves the second
        // (redelivered) dispatch touched zero rows, not just that the value
        // happened to end up the same.
        expect(afterSecond?.xmin).toBe(afterFirst?.xmin);
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not overwrite an existing person_id with a later event naming a different person', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenant_id = await seedTenantRaw(pool);
        const { user_id } = await createUser(
          { tenant_id, email: 'ben@seta.test', name: 'Ben', password: 'x' },
          { type: 'cli', user_id: null },
        );
        const firstPerson = crypto.randomUUID();
        const secondPerson = crypto.randomUUID();

        await dispatch(linkPersonSubscribers, {
          eventType: EVENT_TYPE,
          tenantId: tenant_id,
          payload: { worker_id: firstPerson, person_id: firstPerson, user_id, tenant_id },
        });
        await dispatch(linkPersonSubscribers, {
          eventType: EVENT_TYPE,
          tenantId: tenant_id,
          payload: { worker_id: secondPerson, person_id: secondPerson, user_id, tenant_id },
        });

        const row = await readUser(pool, user_id);
        expect(row?.person_id).toBe(firstPerson);
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not touch a user when the event names the wrong tenant', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      initPools({ databaseUrl });
      try {
        const tenant_id = await seedTenantRaw(pool);
        const otherTenantId = await seedTenantRaw(pool);
        const { user_id } = await createUser(
          { tenant_id, email: 'cam@seta.test', name: 'Cam', password: 'x' },
          { type: 'cli', user_id: null },
        );
        const person_id = crypto.randomUUID();

        // user.id is a global primary key (not composite with tenant_id), so two
        // tenants can never share a row with the same id — the realistic way to
        // exercise the tenant_id filter is an event that names the right user_id
        // but the wrong tenant_id, as would happen if a bus subscription somehow
        // fanned an event out to the wrong tenant's handler.
        await dispatch(linkPersonSubscribers, {
          eventType: EVENT_TYPE,
          tenantId: otherTenantId,
          payload: { worker_id: person_id, person_id, user_id, tenant_id: otherTenantId },
        });

        const row = await readUser(pool, user_id);
        expect(row?.person_id).toBeNull();
      } finally {
        resetIdentityDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
