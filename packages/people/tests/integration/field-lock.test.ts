import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { employmentPeriod, person } from '../../src/backend/db/schema.ts';
import { createWorker, editWorker } from '../../src/index.ts';
import { seedOrgUnit, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function setDirectoryManaged(pool: Pool, workerId: string, managed: boolean): Promise<void> {
  await pool.query(`UPDATE people.person SET directory_managed = $2 WHERE id = $1`, [
    workerId,
    managed,
  ]);
}

describe('M365 field lock', () => {
  it('rejects editing full_name on a directory-managed person', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Ada', session: t.adminSession });
        await setDirectoryManaged(pool, worker_id, true);

        await expect(
          editWorker({
            worker_id,
            patch: { full_name: 'Ada L' },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({
          code: 'FORBIDDEN',
          details: { code: 'PERSON_FIELD_M365_MANAGED' },
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows editing an unlocked field (phone) on a managed person and persists it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Ben', session: t.adminSession });
        await setDirectoryManaged(pool, worker_id, true);

        const result = await editWorker({
          worker_id,
          patch: { phone: '555-2222' },
          session: t.adminSession,
        });
        expect(result.version).toBeGreaterThan(1);

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.phone).toBe('555-2222');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows editing full_name on an unmanaged person and persists it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Cara', session: t.adminSession });
        // directory_managed defaults to false — unchanged behaviour.

        const result = await editWorker({
          worker_id,
          patch: { full_name: 'Cara Updated' },
          session: t.adminSession,
        });
        expect(result.version).toBeGreaterThan(1);

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.full_name).toBe('Cara Updated');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows editing org_unit_id on a managed person and persists it (deliberate carve-out)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id: head } = await createWorker({
          full_name: 'Manager',
          session: t.adminSession,
        });
        const unit = await seedOrgUnit({
          tenant_id: t.tenant_id,
          name: 'M365 Lock Unit',
          kind: 'operation',
          head_worker_id: head,
        });
        const { worker_id } = await createWorker({ full_name: 'Dana', session: t.adminSession });
        await setDirectoryManaged(pool, worker_id, true);

        const result = await editWorker({
          worker_id,
          patch: { org_unit_id: unit },
          session: t.adminSession,
        });
        expect(result.version).toBeGreaterThan(1);

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.org_unit_id).toBe(unit);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects editing job_title (M365-owned employment field) on a directory-managed person', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Eli', session: t.adminSession });
        await setDirectoryManaged(pool, worker_id, true);

        await expect(
          editWorker({
            worker_id,
            patch: { job_title: 'Staff Engineer' },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({
          code: 'FORBIDDEN',
          details: { code: 'PERSON_FIELD_M365_MANAGED' },
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows editing job_title on an unmanaged person and persists it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Finn', session: t.adminSession });

        const result = await editWorker({
          worker_id,
          patch: { job_title: 'Principal Engineer' },
          session: t.adminSession,
        });
        expect(result.version).toBeGreaterThan(1);

        const [ep] = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(eq(employmentPeriod.person_id, worker_id));
        expect(ep?.job_title).toBe('Principal Engineer');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
