import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { employmentPeriod, person } from '../../src/backend/db/schema.ts';
import type { DirectoryPerson } from '../../src/backend/domain/sync-directory-people.ts';
import { syncDirectoryPeople } from '../../src/backend/domain/sync-directory-people.ts';
import { createWorker, editWorker } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function dp(overrides: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return {
    entra_oid: crypto.randomUUID(),
    work_email: 'default@x.vn',
    full_name: 'Default Person',
    employee_no: null,
    personal_email: null,
    phone: null,
    hire_date: null,
    leave_date: null,
    job_title: null,
    employment_type: null,
    account_enabled: true,
    org_unit_id: null,
    photo_storage_key: null,
    timezone: null,
    work_start: null,
    work_end: null,
    ooo_until: null,
    auto_replies_enabled: null,
    ...overrides,
  };
}

describe('syncDirectoryPeople', () => {
  it('creates an unmatched person with an open employment period', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { results } = await syncDirectoryPeople({
          people: [dp({ work_email: 'a@x.vn', full_name: 'Ada Lovelace' })],
          session: t.adminSession,
        });

        expect(results).toHaveLength(1);
        expect(results[0]?.outcome).toBe('created');
        const personId = results[0]?.person_id;
        expect(personId).toBeTruthy();

        const [p] = await peopleDb()
          .select()
          .from(person)
          .where(eq(person.id, personId as string));
        expect(p?.full_name).toBe('Ada Lovelace');
        expect(p?.work_email).toBe('a@x.vn');
        expect(p?.directory_managed).toBe(true);

        const periods = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(eq(employmentPeriod.person_id, personId as string));
        expect(periods).toHaveLength(1);
        expect(periods[0]?.end_date).toBeNull();
        expect(periods[0]?.seq).toBe(1);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('matches an existing person by lower(work_email) and updates it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const [seeded] = await peopleDb()
          .insert(person)
          .values({
            tenant_id: t.tenant_id,
            full_name: 'Old Name',
            work_email: 'A@X.VN',
            directory_managed: true,
          })
          .returning();
        if (!seeded) throw new Error('seed failed');

        const { results } = await syncDirectoryPeople({
          people: [dp({ work_email: 'a@x.vn', full_name: 'New Name' })],
          session: t.adminSession,
        });

        expect(results[0]?.outcome).toBe('updated');
        expect(results[0]?.person_id).toBe(seeded.id);

        const [p] = await peopleDb().select().from(person).where(eq(person.id, seeded.id));
        expect(p?.full_name).toBe('New Name');
        expect(p?.work_email).toBe('a@x.vn');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is idempotent — a second identical sync reports unchanged', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const input = dp({ work_email: 'idem@x.vn', full_name: 'Idem Person' });

        const first = await syncDirectoryPeople({ people: [input], session: t.adminSession });
        expect(first.results[0]?.outcome).toBe('created');

        const second = await syncDirectoryPeople({ people: [input], session: t.adminSession });
        expect(second.results[0]?.outcome).toBe('unchanged');
        expect(second.results[0]?.person_id).toBe(first.results[0]?.person_id);

        const rows = await peopleDb()
          .select()
          .from(person)
          .where(eq(person.work_email, 'idem@x.vn'));
        expect(rows).toHaveLength(1);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('reports a collision when the matched person is not directory managed', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Hand Created',
          work_email: 'collide@x.vn',
          session: t.adminSession,
        });

        const { results } = await syncDirectoryPeople({
          people: [dp({ work_email: 'collide@x.vn', full_name: 'Entra Name' })],
          session: t.adminSession,
        });

        expect(results[0]?.outcome).toBe('collision');
        expect(results[0]?.person_id).toBeNull();
        expect(results[0]?.collision_candidates).toHaveLength(1);
        expect(results[0]?.collision_candidates?.[0]).toMatchObject({
          person_id: worker_id,
          directory_managed: false,
        });

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.full_name).toBe('Hand Created');
        expect(p?.directory_managed).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('sets ooo and ooo_until when auto replies are enabled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const [seeded] = await peopleDb()
          .insert(person)
          .values({
            tenant_id: t.tenant_id,
            full_name: 'Away Person',
            work_email: 'away@x.vn',
            directory_managed: true,
            availability_status: 'available',
            timezone: 'UTC',
          })
          .returning();
        if (!seeded) throw new Error('seed failed');

        const { results } = await syncDirectoryPeople({
          people: [
            dp({
              work_email: 'away@x.vn',
              full_name: 'Away Person',
              auto_replies_enabled: true,
              ooo_until: '2026-08-15T09:00:00.000Z',
              timezone: 'Asia/Ho_Chi_Minh',
              work_start: '08:30:00',
              work_end: '17:30:00',
            }),
          ],
          session: t.adminSession,
        });

        expect(results[0]?.outcome).toBe('updated');

        const [p] = await peopleDb().select().from(person).where(eq(person.id, seeded.id));
        expect(p?.availability_status).toBe('ooo');
        expect(p?.ooo_until?.toISOString()).toBe('2026-08-15T09:00:00.000Z');
        expect(p?.timezone).toBe('Asia/Ho_Chi_Minh');
        expect(p?.work_start).toBe('08:30:00');
        expect(p?.work_end).toBe('17:30:00');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('clears ooo when auto replies are disabled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const [seeded] = await peopleDb()
          .insert(person)
          .values({
            tenant_id: t.tenant_id,
            full_name: 'Ooo Person',
            work_email: 'ooo@x.vn',
            directory_managed: true,
            availability_status: 'ooo',
            ooo_until: new Date('2026-08-01T00:00:00Z'),
            timezone: 'UTC',
          })
          .returning();
        if (!seeded) throw new Error('seed failed');

        const { results } = await syncDirectoryPeople({
          people: [
            dp({
              work_email: 'ooo@x.vn',
              full_name: 'Ooo Person',
              auto_replies_enabled: false,
              timezone: 'UTC',
              work_start: null,
              work_end: null,
            }),
          ],
          session: t.adminSession,
        });

        expect(results[0]?.outcome).toBe('updated');

        const [p] = await peopleDb().select().from(person).where(eq(person.id, seeded.id));
        expect(p?.availability_status).toBe('available');
        expect(p?.ooo_until).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('never overwrites a manually set busy status', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const [seeded] = await peopleDb()
          .insert(person)
          .values({
            tenant_id: t.tenant_id,
            full_name: 'Busy Person',
            work_email: 'busy@x.vn',
            directory_managed: true,
            availability_status: 'busy',
            timezone: 'UTC',
          })
          .returning();
        if (!seeded) throw new Error('seed failed');

        const { results } = await syncDirectoryPeople({
          people: [
            dp({
              work_email: 'busy@x.vn',
              full_name: 'Busy Person',
              auto_replies_enabled: false,
              timezone: 'UTC',
              work_start: null,
              work_end: null,
            }),
          ],
          session: t.adminSession,
        });

        // Nothing actually changed: busy survives untouched, so this is a no-op sync.
        expect(results[0]?.outcome).toBe('unchanged');

        const [p] = await peopleDb().select().from(person).where(eq(person.id, seeded.id));
        expect(p?.availability_status).toBe('busy');
        expect(p?.ooo_until).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('leaves mailbox columns untouched when auto_replies_enabled is null', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const [seeded] = await peopleDb()
          .insert(person)
          .values({
            tenant_id: t.tenant_id,
            full_name: 'Mailbox Unknown',
            work_email: 'mailbox@x.vn',
            directory_managed: true,
            availability_status: 'busy',
            timezone: 'Asia/Ho_Chi_Minh',
            work_start: '09:00:00',
            work_end: '18:00:00',
          })
          .returning();
        if (!seeded) throw new Error('seed failed');

        const { results } = await syncDirectoryPeople({
          people: [
            dp({
              work_email: 'mailbox@x.vn',
              full_name: 'Mailbox Unknown',
              auto_replies_enabled: null,
              timezone: null,
              work_start: null,
              work_end: null,
              ooo_until: null,
            }),
          ],
          session: t.adminSession,
        });

        // Nothing mapped actually changed (mailbox is gated off entirely), so unchanged.
        expect(results[0]?.outcome).toBe('unchanged');

        const [p] = await peopleDb().select().from(person).where(eq(person.id, seeded.id));
        expect(p?.timezone).toBe('Asia/Ho_Chi_Minh');
        expect(p?.work_start).toBe('09:00:00');
        expect(p?.work_end).toBe('18:00:00');
        expect(p?.availability_status).toBe('busy');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('updates full_name on a directory_managed person, which editWorker refuses', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const [seeded] = await peopleDb()
          .insert(person)
          .values({
            tenant_id: t.tenant_id,
            full_name: 'Old Name',
            work_email: 'locked@x.vn',
            directory_managed: true,
          })
          .returning();
        if (!seeded) throw new Error('seed failed');

        // editWorker refuses this exact edit on a directory-managed person.
        await expect(
          editWorker({
            worker_id: seeded.id,
            patch: { full_name: 'Rejected Name' },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({
          code: 'FORBIDDEN',
          details: { code: 'PERSON_FIELD_M365_MANAGED' },
        });

        // syncDirectoryPeople is the owner of this field and must be able to write it directly.
        const { results } = await syncDirectoryPeople({
          people: [dp({ work_email: 'locked@x.vn', full_name: 'New Name' })],
          session: t.adminSession,
        });
        expect(results[0]?.outcome).toBe('updated');

        const [p] = await peopleDb().select().from(person).where(eq(person.id, seeded.id));
        expect(p?.full_name).toBe('New Name');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
