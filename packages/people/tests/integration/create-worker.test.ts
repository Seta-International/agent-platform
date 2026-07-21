import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { employmentPeriod, orgUnit, person } from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('createWorker', () => {
  it('creates rows and emits people.worker.created on name-only input', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { worker_id } = await createWorker({
          full_name: 'Alice Example',
          session: t.adminSession,
        });

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.full_name).toBe('Alice Example');
        expect(p?.work_email).toBeNull();

        const events = await readEvents(pool, t.tenant_id, 'people.worker.created');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(worker_id);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws VALIDATION for empty full_name', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        await expect(
          createWorker({ full_name: '   ', session: t.adminSession }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('generates work_email when domain is configured', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await pool.query('UPDATE core.tenants SET email_domains = $1 WHERE id = $2', [
          ['acme.com'],
          t.tenant_id,
        ]);

        const { worker_id } = await createWorker({
          full_name: 'Jane Doe',
          session: t.adminSession,
        });

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.work_email).toBe('jane.doe@acme.com');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('appends numeric suffix for duplicate name', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await pool.query('UPDATE core.tenants SET email_domains = $1 WHERE id = $2', [
          ['acme.com'],
          t.tenant_id,
        ]);

        await createWorker({ full_name: 'Jane Doe', session: t.adminSession });
        const { worker_id } = await createWorker({
          full_name: 'Jane Doe',
          session: t.adminSession,
        });

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.work_email).toBe('jane.doe2@acme.com');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('leaves work_email null when no domains configured', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { worker_id } = await createWorker({
          full_name: 'Bob Noemail',
          session: t.adminSession,
        });

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.work_email).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws VALIDATION when supplied email domain not in allowed list', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await pool.query('UPDATE core.tenants SET email_domains = $1 WHERE id = $2', [
          ['acme.com'],
          t.tenant_id,
        ]);

        await expect(
          createWorker({
            full_name: 'Off Domain',
            work_email: 'off@other.com',
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('persists job_title and org_unit_id on person/employment_period and emits event', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const [u] = await peopleDb()
          .insert(orgUnit)
          .values({ tenant_id: t.tenant_id, name: 'PMO', kind: 'pmo', sort: 0 })
          .returning();

        const { worker_id } = await createWorker({
          full_name: 'Worker With Title',
          job_title: 'Senior Engineer',
          org_unit_id: u!.id,
          session: t.adminSession,
        } as never);

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.full_name).toBe('Worker With Title');
        expect(p?.org_unit_id).toBe(u!.id);

        const [ep] = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(and(eq(employmentPeriod.person_id, worker_id), isNull(employmentPeriod.end_date)));
        expect(ep?.job_title).toBe('Senior Engineer');

        const events = await readEvents(pool, t.tenant_id, 'people.worker.created');
        expect(events).toHaveLength(1);
        expect(events[0]?.payload).toMatchObject({
          worker_id,
          person_id: worker_id,
          full_name: 'Worker With Title',
          work_email: null,
          job_title: 'Senior Engineer',
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws CONFLICT when employee_no already in use', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        await createWorker({
          full_name: 'First Worker',
          employee_no: 'EMP-001',
          session: t.adminSession,
        });

        await expect(
          createWorker({
            full_name: 'Second Worker',
            employee_no: 'EMP-001',
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT', message: 'employee_no already in use' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws CONFLICT when supplied email already in use', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await pool.query('UPDATE core.tenants SET email_domains = $1 WHERE id = $2', [
          ['acme.com'],
          t.tenant_id,
        ]);

        await createWorker({
          full_name: 'First Worker',
          work_email: 'shared@acme.com',
          session: t.adminSession,
        });

        await expect(
          createWorker({
            full_name: 'Second Worker',
            work_email: 'shared@acme.com',
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
