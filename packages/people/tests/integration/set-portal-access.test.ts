import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person, worker } from '../../src/backend/db/schema.ts';
import { createWorker, setPortalAccess } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('setPortalAccess', () => {
  it('enable provisions a login, sets portal_access + person.user_id, and emits', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Toggle Me',
          work_email: 'toggle.me@example.test',
          session: t.adminSession,
        });

        const r = await setPortalAccess({ worker_id, enabled: true, session: t.adminSession });
        expect(r.portal_access).toBe(true);

        const [w] = await peopleDb().select().from(worker).where(eq(worker.person_id, worker_id));
        expect(w?.portal_access).toBe(true);
        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.user_id).not.toBeNull();
        expect(
          await readEvents(pool, t.tenant_id, 'people.worker.portal_access.changed'),
        ).toHaveLength(1);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('disable then re-enable keeps the same user_id (deactivate/reactivate, no new user)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Cycle',
          work_email: 'cycle@example.test',
          session: t.adminSession,
        });
        await setPortalAccess({ worker_id, enabled: true, session: t.adminSession });
        const [p1] = await peopleDb().select().from(person).where(eq(person.id, worker_id));

        await setPortalAccess({ worker_id, enabled: false, session: t.adminSession });
        const [wOff] = await peopleDb()
          .select()
          .from(worker)
          .where(eq(worker.person_id, worker_id));
        expect(wOff?.portal_access).toBe(false);
        const [pOff] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(pOff?.user_id).toBe(p1?.user_id); // binding kept

        await setPortalAccess({ worker_id, enabled: true, session: t.adminSession });
        const [pOn] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(pOn?.user_id).toBe(p1?.user_id); // same user reactivated
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('enable without a work_email is rejected', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        // provisionWorker leaves work_email null
        const { worker_id } = await createWorker({
          full_name: 'No Email',
          session: t.adminSession,
        });
        await expect(
          setPortalAccess({ worker_id, enabled: true, session: t.adminSession }),
        ).rejects.toThrow();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is idempotent: enabling an already-on worker reports changed=false', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Idem',
          work_email: 'idem@example.test',
          session: t.adminSession,
        });
        await setPortalAccess({ worker_id, enabled: true, session: t.adminSession });
        const r = await setPortalAccess({ worker_id, enabled: true, session: t.adminSession });
        expect(r.changed).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
