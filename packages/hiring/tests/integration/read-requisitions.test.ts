// packages/hiring/tests/integration/read-requisitions.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { accountProjection, projectProjection, requisition } from '../../src/backend/db/schema.ts';
import { accountProjectionCreated } from '../../src/backend/subscribers/account-projection.ts';
import {
  addCandidate,
  getRequisition,
  hireApplication,
  listAccounts,
  listProjects,
  listRequisitions,
  openRequisition,
  transferApplication,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('read requisitions', () => {
  it('lists with opening counts and fetches a detail bundle', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'SRE',
          kind: 'new',
          headcount: 2,
          skills: [{ skill_id: crypto.randomUUID(), skill_name: 'Go' }],
          session: t.adminSession,
        });
        const list = await listRequisitions(t.adminSession);
        const row = list.find((r) => r.id === requisition_id);
        expect(row?.openings_total).toBe(2);
        expect(row?.openings_open).toBe(2);
        expect(row?.applicants_count).toBe(0);

        const detail = await getRequisition({ requisition_id, session: t.adminSession });
        expect(detail.openings).toHaveLength(2);
        expect(detail.skills[0]?.skill_name).toBe('Go');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('list row carries role/note/dates, skills, and internal/external applicant counts', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'Senior React Engineer',
          kind: 'replacement',
          role_title: 'Frontend Engineer',
          grade: 'L4',
          note: 'Backfill — a senior FE rotates off in Aug.',
          start_date: '2026-05-22',
          due_date: '2026-07-20',
          headcount: 1,
          skills: [
            { skill_id: crypto.randomUUID(), skill_name: 'React', min_level: 3 },
            { skill_id: crypto.randomUUID(), skill_name: 'TypeScript', min_level: 3 },
          ],
          session: t.adminSession,
        });

        await addCandidate({
          requisition_id,
          name: 'Pham Tien Manh',
          personal_email: 'manh@example.test',
          seniority: 'Frontend Engineer',
          session: t.adminSession,
        });

        const row = (await listRequisitions(t.adminSession)).find((r) => r.id === requisition_id);
        expect(row?.role_title).toBe('Frontend Engineer');
        expect(row?.approval_status).toBe('approved');
        expect(row?.note).toBe('Backfill — a senior FE rotates off in Aug.');
        expect(row?.start_date).toBe('2026-05-22');
        expect(row?.due_date).toBe('2026-07-20');
        expect(row?.created_at).toBeTruthy();
        expect(row?.skills.map((s) => s.skill_name).sort()).toEqual(['React', 'TypeScript']);
        expect(row?.applicants_count).toBe(1);
        expect(row?.applicants[0]?.name).toBe('Pham Tien Manh');
        expect(row?.applicants[0]?.role).toBe('Frontend Engineer');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('drops transferred applications from list counts while the detail keeps history', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const a = await openRequisition({ title: 'Role A', headcount: 1, session: t.adminSession });
        const b = await openRequisition({ title: 'Role B', headcount: 1, session: t.adminSession });
        const { application_id } = await addCandidate({
          requisition_id: a.requisition_id,
          name: 'Moving Candidate',
          session: t.adminSession,
        });

        await transferApplication({
          application_id,
          input: { target_requisition_id: b.requisition_id },
          session: t.adminSession,
        });

        const list = await listRequisitions(t.adminSession);
        const rowA = list.find((r) => r.id === a.requisition_id);
        const rowB = list.find((r) => r.id === b.requisition_id);
        // Role A's pipeline no longer contains the candidate — count and card applicants
        // reflect who is actually in play, not closed history.
        expect(rowA?.applicants_count).toBe(0);
        expect(rowA?.applicants_external).toBe(0);
        expect(rowA?.applicants).toHaveLength(0);
        expect(rowB?.applicants_count).toBe(1);
        expect(rowB?.applicants[0]?.name).toBe('Moving Candidate');

        // The detail bundle still returns the transferred application — the UI shows it
        // as history ("Transferred"), separate from the active count.
        const detailA = await getRequisition({
          requisition_id: a.requisition_id,
          session: t.adminSession,
        });
        expect(detailA.applicants).toHaveLength(1);
        expect(detailA.applicants[0]?.status).toBe('transferred');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('counts hired applications in hired_count, separate from the active pipeline', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const r = await openRequisition({ title: 'Role', headcount: 2, session: t.adminSession });
        const hired = await addCandidate({
          requisition_id: r.requisition_id,
          name: 'Hired Candidate',
          session: t.adminSession,
        });
        await addCandidate({
          requisition_id: r.requisition_id,
          name: 'Active Candidate',
          session: t.adminSession,
        });

        await hireApplication({ application_id: hired.application_id, session: t.adminSession });

        const list = await listRequisitions(t.adminSession);
        const row = list.find((r2) => r2.id === r.requisition_id);
        // Hired is terminal — it leaves the active pipeline count and lands in hired_count.
        expect(row?.hired_count).toBe(1);
        expect(row?.applicants_count).toBe(1);
        expect(row?.applicants.map((a) => a.name)).toEqual(['Active Candidate']);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('resolves account/project names from the local projections + subscriber is idempotent', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const account_id = crypto.randomUUID();
        const project_id = crypto.randomUUID();
        const am_worker_id = crypto.randomUUID();

        // The pm.account.created subscriber builds the account_projection — run it twice
        // to prove idempotency (at-least-once delivery).
        const evt = {
          payload: { account_id, tenant_id: t.tenant_id, name: 'Vinfast', am_worker_id },
        } as DomainEvent<unknown>;
        await accountProjectionCreated.handler(evt, { tx: hiringDb() });
        await accountProjectionCreated.handler(evt, { tx: hiringDb() });
        const projRows = await hiringDb()
          .select()
          .from(accountProjection)
          .where(eq(accountProjection.account_id, account_id));
        expect(projRows).toHaveLength(1);
        expect(projRows[0]?.name).toBe('Vinfast');

        await hiringDb().insert(projectProjection).values({
          project_id,
          tenant_id: t.tenant_id,
          account_id,
          name: 'Connected Vehicle App',
        });

        const { requisition_id } = await openRequisition({
          title: 'Senior React Engineer',
          kind: 'new',
          account_id,
          project_id,
          session: t.adminSession,
        });

        const row = (await listRequisitions(t.adminSession)).find((r) => r.id === requisition_id);
        expect(row?.account_name).toBe('Vinfast');
        expect(row?.project_id).toBe(project_id);
        expect(row?.project_name).toBe('Connected Vehicle App');

        // getRequisition (the New Requisition dialog's account/project display source) must
        // resolve the same names, not just the list view.
        const detail = await getRequisition({ requisition_id, session: t.adminSession });
        expect(detail.account_name).toBe('Vinfast');
        expect(detail.project_name).toBe('Connected Vehicle App');

        const accounts = await listAccounts(t.adminSession);
        expect(accounts).toEqual([{ account_id, name: 'Vinfast' }]);

        const projects = await listProjects(t.adminSession, account_id);
        expect(projects).toEqual([{ project_id, account_id, name: 'Connected Vehicle App' }]);
        // Unfiltered listProjects still returns it (no account_id passed).
        expect(await listProjects(t.adminSession)).toEqual([
          { project_id, account_id, name: 'Connected Vehicle App' },
        ]);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('listRequisitions orders newest-created first, regardless of insertion order', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id: oldest } = await openRequisition({
          title: 'Oldest',
          kind: 'new',
          session: t.adminSession,
        });
        const { requisition_id: middle } = await openRequisition({
          title: 'Middle',
          kind: 'new',
          session: t.adminSession,
        });
        const { requisition_id: newest } = await openRequisition({
          title: 'Newest',
          kind: 'new',
          session: t.adminSession,
        });
        // Force explicit, unambiguous created_at values — real-clock timestamps from three
        // back-to-back inserts aren't a reliable enough signal to prove ORDER BY is doing the
        // work rather than incidental insertion order.
        await hiringDb()
          .update(requisition)
          .set({ created_at: new Date('2026-01-01T00:00:00Z') })
          .where(eq(requisition.id, oldest));
        await hiringDb()
          .update(requisition)
          .set({ created_at: new Date('2026-01-02T00:00:00Z') })
          .where(eq(requisition.id, middle));
        await hiringDb()
          .update(requisition)
          .set({ created_at: new Date('2026-01-03T00:00:00Z') })
          .where(eq(requisition.id, newest));

        const ids = (await listRequisitions(t.adminSession)).map((r) => r.id);
        expect(ids).toEqual([newest, middle, oldest]);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('getRequisition throws NOT_FOUND for another tenant', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const a = await seedTenant(pool);
        const b = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'X',
          kind: 'new',
          session: a.adminSession,
        });
        await expect(getRequisition({ requisition_id, session: b.adminSession })).rejects.toThrow(
          'not found',
        );
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
