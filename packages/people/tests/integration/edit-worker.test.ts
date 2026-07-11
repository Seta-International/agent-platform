import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { employmentPeriod, person } from '../../src/backend/db/schema.ts';
import { createWorker, editWorker } from '../../src/index.ts';
import { buildSession, countEvents, readEvents, seedOrgUnit, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('editWorker', () => {
  it('owner edits personal field: phone updated, history row, event, version bump, profile_completed_at stamped', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Alice', session: t.adminSession });

        const ownerUserId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO people.user_projection (user_id, tenant_id, person_id) VALUES ($1, $2, $3)`,
          [ownerUserId, t.tenant_id, worker_id],
        );

        const ownerSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: ownerUserId,
          roles: ['people.viewer'],
        });

        const result = await editWorker({
          worker_id,
          patch: { phone: '555-1234' },
          session: ownerSession,
        });

        expect(result.version).toBeGreaterThan(1);

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.phone).toBe('555-1234');
        expect(p?.profile_completed_at).not.toBeNull();

        const histRows = await pool.query(
          `SELECT * FROM people.worker_history WHERE person_id = $1 AND action = 'updated'`,
          [worker_id],
        );
        expect(histRows.rows).toHaveLength(1);
        expect(histRows.rows[0].field).toBe('phone');
        expect(histRows.rows[0].to_val).toBe('555-1234');
        expect(histRows.rows[0].by_user_id).toBe(ownerUserId);

        const events = await readEvents(pool, t.tenant_id, 'people.worker.updated');
        expect(events).toHaveLength(1);
        expect(events[0]?.payload).toMatchObject({ worker_id, fields: ['phone'] });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('owner cannot edit admin-only field full_name', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Bob', session: t.adminSession });

        const ownerUserId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO people.user_projection (user_id, tenant_id, person_id) VALUES ($1, $2, $3)`,
          [ownerUserId, t.tenant_id, worker_id],
        );

        const ownerSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: ownerUserId,
          roles: ['people.viewer'],
        });

        await expect(
          editWorker({ worker_id, patch: { full_name: 'Bobby' }, session: ownerSession }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('manager admin edits full_name + phone: two history rows, event fields contains both', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Carol', session: t.adminSession });

        const result = await editWorker({
          worker_id,
          patch: { full_name: 'Carol Updated', phone: '555-9999' },
          session: t.adminSession,
        });
        expect(result.version).toBeGreaterThan(1);

        const histRows = await pool.query(
          `SELECT field FROM people.worker_history WHERE person_id = $1 AND action = 'updated' ORDER BY field`,
          [worker_id],
        );
        expect(histRows.rows).toHaveLength(2);
        const fields = histRows.rows.map((r: { field: string }) => r.field).sort();
        expect(fields).toEqual(['full_name', 'phone']);

        const events = await readEvents(pool, t.tenant_id, 'people.worker.updated');
        expect(events).toHaveLength(1);
        const eventFields = (events[0]?.payload.fields as string[]).sort();
        expect(eventFields).toEqual(['full_name', 'phone']);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('viewer (not owner) cannot edit phone', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Dave', session: t.adminSession });

        const viewerSession = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
        });

        await expect(
          editWorker({ worker_id, patch: { phone: '000-0000' }, session: viewerSession }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('unchanged value produces no history row and no event', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Eve', session: t.adminSession });

        const [p] = await peopleDb()
          .select({ version: person.version })
          .from(person)
          .where(eq(person.id, worker_id));
        const originalVersion = p!.version;

        const result = await editWorker({
          worker_id,
          patch: { full_name: 'Eve' },
          session: t.adminSession,
        });
        expect(result.version).toBe(originalVersion);

        const n = await countEvents(pool, t.tenant_id, 'people.worker.updated');
        expect(n).toBe(0);

        const histRows = await pool.query(
          `SELECT * FROM people.worker_history WHERE person_id = $1 AND action = 'updated'`,
          [worker_id],
        );
        expect(histRows.rows).toHaveLength(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('stale expected_version throws CONFLICT', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Frank', session: t.adminSession });

        await expect(
          editWorker({
            worker_id,
            expected_version: 9999,
            patch: { phone: '111' },
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

  it('admin edits job_title + org_unit_id: two history rows, event fields includes both, split across employment_period/person', async () => {
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
          name: 'Edit Unit',
          kind: 'operation',
          head_worker_id: head,
        });
        const { worker_id } = await createWorker({ full_name: 'Helen', session: t.adminSession });

        const result = await editWorker({
          worker_id,
          patch: { job_title: 'Staff Engineer', org_unit_id: unit },
          session: t.adminSession,
        });
        expect(result.version).toBeGreaterThan(1);

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.org_unit_id).toBe(unit);

        const [ep] = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(and(eq(employmentPeriod.person_id, worker_id), isNull(employmentPeriod.end_date)));
        expect(ep?.job_title).toBe('Staff Engineer');

        const histRows = await pool.query(
          `SELECT field FROM people.worker_history WHERE person_id = $1 AND action = 'updated' ORDER BY field`,
          [worker_id],
        );
        expect(histRows.rows).toHaveLength(2);
        const fields = histRows.rows.map((r: { field: string }) => r.field).sort();
        expect(fields).toEqual(['job_title', 'org_unit_id']);

        const events = await readEvents(pool, t.tenant_id, 'people.worker.updated');
        expect(events).toHaveLength(1);
        const eventFields = (events[0]?.payload.fields as string[]).sort();
        expect(eventFields).toEqual(['job_title', 'org_unit_id']);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('admin edits job_title + phone: job_title lands on the open employment_period, phone on person, event reflects new job_title/full_name/work_email', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Ivy', session: t.adminSession });

        const result = await editWorker({
          worker_id,
          patch: { job_title: 'Principal Engineer', phone: '555-7777' },
          session: t.adminSession,
        });
        expect(result.version).toBeGreaterThan(1);

        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.phone).toBe('555-7777');

        const [ep] = await peopleDb()
          .select()
          .from(employmentPeriod)
          .where(and(eq(employmentPeriod.person_id, worker_id), isNull(employmentPeriod.end_date)));
        expect(ep?.job_title).toBe('Principal Engineer');

        const events = await readEvents(pool, t.tenant_id, 'people.worker.updated');
        expect(events).toHaveLength(1);
        expect(events[0]?.payload).toMatchObject({
          worker_id,
          full_name: 'Ivy',
          work_email: null,
          job_title: 'Principal Engineer',
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('job_title edit on a terminated worker (no open employment period) throws and rolls back version/history/event', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Judy', session: t.adminSession });
        // terminateWorker is broken independently of this fix (its loadWorker still
        // queries the pre-fold `worker` table, which createWorker no longer populates);
        // close the open employment_period directly to isolate this test from that bug.
        await pool.query(
          `UPDATE people.employment_period SET end_date = CURRENT_DATE, lifecycle_stage = 'alumni' WHERE person_id = $1 AND end_date IS NULL`,
          [worker_id],
        );

        const [before] = await peopleDb()
          .select({ version: person.version })
          .from(person)
          .where(eq(person.id, worker_id));
        const versionBeforeEdit = before!.version;

        await expect(
          editWorker({
            worker_id,
            patch: { job_title: 'Staff Engineer' },
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({
          code: 'CONFLICT',
          message: 'cannot set job_title: worker has no active employment period',
        });

        const [after] = await peopleDb()
          .select({ version: person.version })
          .from(person)
          .where(eq(person.id, worker_id));
        expect(after?.version).toBe(versionBeforeEdit);

        const histRows = await pool.query(
          `SELECT * FROM people.worker_history WHERE person_id = $1 AND action = 'updated'`,
          [worker_id],
        );
        expect(histRows.rows).toHaveLength(0);

        const n = await countEvents(pool, t.tenant_id, 'people.worker.updated');
        expect(n).toBe(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('cross-tenant worker_id returns NOT_FOUND', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t1 = await seedTenant(pool);
        const t2 = await seedTenant(pool);
        const { worker_id } = await createWorker({ full_name: 'Grace', session: t1.adminSession });

        await expect(
          editWorker({ worker_id, patch: { phone: '000' }, session: t2.adminSession }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
