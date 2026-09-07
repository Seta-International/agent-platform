import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { and, eq, isNull } from 'drizzle-orm';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  employmentPeriod,
  type LIFECYCLE_STAGES,
  person,
  personSkill,
  projectProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { listWorkers } from '../../src/backend/domain/read-workers.ts';
import {
  buildSession,
  linkUserToPerson,
  type SeededTenant,
  seedOrgUnit,
  seedTenant,
} from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function withDb(fn: (a: { pool: Pool; t: SeededTenant }) => Promise<void>): Promise<void> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      await fn({ pool, t });
    } finally {
      resetPeopleDb();
      resetCoreDb();
      await closePools();
    }
  });
}

async function makeWorker(
  t: SeededTenant,
  opts: {
    name: string;
    email?: string;
    job_title?: string;
    gender?: string;
    phone?: string;
    orgUnitId?: string | null;
    userId?: string;
  },
): Promise<string> {
  const { worker_id } = await createWorker({
    session: t.adminSession,
    full_name: opts.name,
    work_email: opts.email,
    org_unit_id: opts.orgUnitId ?? null,
  } as never);
  const personPatch: Record<string, unknown> = {};
  if (opts.gender !== undefined) personPatch.gender = opts.gender;
  if (opts.phone !== undefined) personPatch.phone = opts.phone;
  if (Object.keys(personPatch).length > 0) {
    await peopleDb().update(person).set(personPatch).where(eq(person.id, worker_id));
  }
  if (opts.job_title !== undefined) {
    await peopleDb()
      .update(employmentPeriod)
      .set({ job_title: opts.job_title })
      .where(and(eq(employmentPeriod.person_id, worker_id), isNull(employmentPeriod.end_date)));
  }
  if (opts.userId) {
    await linkUserToPerson(t.tenant_id, worker_id, opts.userId);
  }
  return worker_id;
}

// Each worker is created with an open seq:1 'preboarding' period; mutate that one
// instead of inserting (which would trip the one-open-period unique index).
async function addEmployment(
  _t: SeededTenant,
  personId: string,
  opts: { stage: (typeof LIFECYCLE_STAGES)[number]; start: string },
): Promise<void> {
  await peopleDb()
    .update(employmentPeriod)
    .set({ lifecycle_stage: opts.stage, start_date: opts.start })
    .where(and(eq(employmentPeriod.person_id, personId), isNull(employmentPeriod.end_date)));
}

// Closes the worker's open period the way terminateWorker() does: end_date and lifecycle_stage
// are set on the SAME row in the same update, not a new row.
async function closeEmployment(
  personId: string,
  opts: { stage: (typeof LIFECYCLE_STAGES)[number]; end: string },
): Promise<void> {
  await peopleDb()
    .update(employmentPeriod)
    .set({ lifecycle_stage: opts.stage, end_date: opts.end })
    .where(and(eq(employmentPeriod.person_id, personId), isNull(employmentPeriod.end_date)));
}

async function addAllocation(
  t: SeededTenant,
  opts: {
    workerId: string;
    projectId?: string;
    accountId: string;
    accountName: string;
    leadId?: string | null;
    active?: boolean;
  },
): Promise<void> {
  // Account name now lives in account_projection; read-workers joins it in. Seed it so the
  // allocation's account resolves to a name.
  await peopleDb()
    .insert(accountProjection)
    .values({ account_id: opts.accountId, tenant_id: t.tenant_id, name: opts.accountName })
    .onConflictDoUpdate({
      target: accountProjection.account_id,
      set: { name: opts.accountName },
    });
  await peopleDb()
    .insert(workerAllocationProjection)
    .values({
      allocation_id: crypto.randomUUID(),
      tenant_id: t.tenant_id,
      person_id: opts.workerId,
      project_id: opts.projectId ?? crypto.randomUUID(),
      account_id: opts.accountId,
      lead_person_id: opts.leadId ?? null,
      active: opts.active ?? true,
    });
}

async function addSkill(
  t: SeededTenant,
  personId: string,
  skillId: string,
  skillName: string,
): Promise<void> {
  await peopleDb().insert(personSkill).values({
    tenant_id: t.tenant_id,
    person_id: personId,
    skill_id: skillId,
    skill_name: skillName,
  });
}

function admin(t: SeededTenant) {
  return t.adminSession; // people.manager with a tenant-scope assignment → sees everyone
}
function viewer(t: SeededTenant, userId: string) {
  return buildSession({ tenant_id: t.tenant_id, user_id: userId, roles: ['people.viewer'] });
}

describe('listWorkers (SQL filter/sort/paginate)', () => {
  it('returns rich rows: accounts[], skills[], manager_name, onboarding_date', async () => {
    await withDb(async ({ t }) => {
      const mgr = await makeWorker(t, { name: 'Boss Manager' });
      const unit = await seedOrgUnit({
        tenant_id: t.tenant_id,
        name: 'Boss Unit',
        kind: 'operation',
        head_worker_id: mgr,
      });
      const w = await makeWorker(t, {
        name: 'Rich Row',
        email: 'rich@x.test',
        job_title: 'Engineer',
        gender: 'female',
        phone: '555-1',
        orgUnitId: unit,
      });
      await addEmployment(t, w, { stage: 'active', start: '2026-01-15' });

      const acc1 = crypto.randomUUID();
      const acc2 = crypto.randomUUID();
      await addAllocation(t, { workerId: w, accountId: acc1, accountName: 'Account One' });
      await addAllocation(t, { workerId: w, accountId: acc2, accountName: 'Account Two' });

      const sk1 = crypto.randomUUID();
      const sk2 = crypto.randomUUID();
      await addSkill(t, w, sk1, 'TypeScript');
      await addSkill(t, w, sk2, 'Postgres');

      const { rows } = await listWorkers(admin(t), { search: 'Rich Row' });
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.worker_id).toBe(w);
      expect(row.full_name).toBe('Rich Row');
      expect(row.job_title).toBe('Engineer');
      expect(row.gender).toBe('female');
      expect(row.phone).toBe('555-1');
      expect(row.lifecycle_stage).toBe('active');
      expect(row.onboarding_date).toBe('2026-01-15');
      expect(row.offboarding_date).toBeNull();
      expect(row.manager_name).toBe('Boss Manager');
      expect(new Set(row.accounts.map((a) => a.name))).toEqual(
        new Set(['Account One', 'Account Two']),
      );
      expect(new Set(row.skills.map((s) => s.name))).toEqual(new Set(['TypeScript', 'Postgres']));
    });
  });

  it('search matches full_name / work_email / job_title case-insensitively', async () => {
    await withDb(async ({ t }) => {
      await makeWorker(t, { name: 'Findable Name' });
      await makeWorker(t, { name: 'By Email', email: 'unique-mail@x.test' });
      await makeWorker(t, { name: 'By Title', job_title: 'Wizardry Lead' });

      expect((await listWorkers(admin(t), { search: 'findable' })).rows).toHaveLength(1);
      expect((await listWorkers(admin(t), { search: 'UNIQUE-MAIL' })).rows).toHaveLength(1);
      expect((await listWorkers(admin(t), { search: 'wizardry' })).rows).toHaveLength(1);
    });
  });

  it('status filter narrows by lifecycle_stage', async () => {
    await withDb(async ({ t }) => {
      const a = await makeWorker(t, { name: 'Active A' });
      const b = await makeWorker(t, { name: 'Onboarding B' });
      await addEmployment(t, a, { stage: 'active', start: '2026-01-01' });
      await addEmployment(t, b, { stage: 'onboarding', start: '2026-02-01' });

      const { rows } = await listWorkers(admin(t), { status: ['active'] });
      expect(rows.map((r) => r.full_name)).toEqual(['Active A']);

      const both = await listWorkers(admin(t), { status: ['active', 'onboarding'] });
      expect(both.rows.map((r) => r.full_name).sort()).toEqual(['Active A', 'Onboarding B']);
    });
  });

  it('a worker whose employment period is closed (alumni) still shows their status and is filterable', async () => {
    await withDb(async ({ t }) => {
      const active = await makeWorker(t, { name: 'Still Active' });
      await addEmployment(t, active, { stage: 'active', start: '2026-01-01' });

      const alumnus = await makeWorker(t, { name: 'Ex Employee' });
      await addEmployment(t, alumnus, { stage: 'active', start: '2025-01-01' });
      await closeEmployment(alumnus, { stage: 'alumni', end: '2026-03-01' });

      const { rows } = await listWorkers(admin(t), {});
      const alumnusRow = rows.find((r) => r.full_name === 'Ex Employee');
      expect(alumnusRow?.lifecycle_stage).toBe('alumni');
      expect(alumnusRow?.offboarding_date).toBe('2026-03-01');

      const filtered = await listWorkers(admin(t), { status: ['alumni'] });
      expect(filtered.rows.map((r) => r.full_name)).toEqual(['Ex Employee']);
      expect(filtered.total).toBe(1);
    });
  });

  it('FUT-953: excludeStatus drops alumni without needing to enumerate every other stage', async () => {
    await withDb(async ({ t }) => {
      const active = await makeWorker(t, { name: 'Still Active' });
      await addEmployment(t, active, { stage: 'active', start: '2026-01-01' });

      const alumnus = await makeWorker(t, { name: 'Ex Employee' });
      await addEmployment(t, alumnus, { stage: 'active', start: '2025-01-01' });
      await closeEmployment(alumnus, { stage: 'alumni', end: '2026-03-01' });

      const { rows } = await listWorkers(admin(t), { excludeStatus: ['alumni'] });
      expect(rows.map((r) => r.full_name).sort()).toEqual(['Still Active']);
    });
  });

  it('account_id filter (multi, OR) narrows correctly', async () => {
    await withDb(async ({ t }) => {
      const a = await makeWorker(t, { name: 'On Acct1' });
      const b = await makeWorker(t, { name: 'On Acct2' });
      const c = await makeWorker(t, { name: 'On None' });
      const acc1 = crypto.randomUUID();
      const acc2 = crypto.randomUUID();
      await addAllocation(t, { workerId: a, accountId: acc1, accountName: 'A1' });
      await addAllocation(t, { workerId: b, accountId: acc2, accountName: 'A2' });
      void c;

      const one = await listWorkers(admin(t), { account_id: [acc1] });
      expect(one.rows.map((r) => r.full_name)).toEqual(['On Acct1']);

      const two = await listWorkers(admin(t), { account_id: [acc1, acc2] });
      expect(two.rows.map((r) => r.full_name).sort()).toEqual(['On Acct1', 'On Acct2']);
    });
  });

  it('project_id filter narrows to active allocations on that project', async () => {
    await withDb(async ({ t }) => {
      const a = await makeWorker(t, { name: 'On Project' });
      const b = await makeWorker(t, { name: 'Inactive On Project' });
      const acc = crypto.randomUUID();
      const proj = crypto.randomUUID();
      await addAllocation(t, { workerId: a, projectId: proj, accountId: acc, accountName: 'A' });
      await addAllocation(t, {
        workerId: b,
        projectId: proj,
        accountId: acc,
        accountName: 'A',
        active: false,
      });

      const { rows } = await listWorkers(admin(t), { project_id: [proj] });
      expect(rows.map((r) => r.full_name)).toEqual(['On Project']);
    });
  });

  it('skill_id filter narrows correctly', async () => {
    await withDb(async ({ t }) => {
      const a = await makeWorker(t, { name: 'Skilled' });
      const b = await makeWorker(t, { name: 'Unskilled' });
      void b;
      const sk = crypto.randomUUID();
      await addSkill(t, a, sk, 'Rust');

      const { rows } = await listWorkers(admin(t), { skill_id: [sk] });
      expect(rows.map((r) => r.full_name)).toEqual(['Skilled']);
    });
  });

  it('sorts asc/desc on full_name; unknown sort field falls back to default', async () => {
    await withDb(async ({ t }) => {
      await makeWorker(t, { name: 'Charlie' });
      await makeWorker(t, { name: 'Alpha' });
      await makeWorker(t, { name: 'Bravo' });

      const asc = await listWorkers(admin(t), { sort: { field: 'full_name', dir: 'asc' } });
      expect(asc.rows.map((r) => r.full_name)).toEqual(['Alpha', 'Bravo', 'Charlie']);

      const desc = await listWorkers(admin(t), { sort: { field: 'full_name', dir: 'desc' } });
      expect(desc.rows.map((r) => r.full_name)).toEqual(['Charlie', 'Bravo', 'Alpha']);

      // unknown field must not throw and falls back to full_name asc
      const bad = await listWorkers(admin(t), {
        sort: { field: 'drop table; --', dir: 'asc' },
      });
      expect(bad.rows.map((r) => r.full_name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    });
  });

  it('paginates with page/pageSize; total = full filtered count (not page length)', async () => {
    await withDb(async ({ t }) => {
      for (const n of ['W1', 'W2', 'W3', 'W4', 'W5']) await makeWorker(t, { name: n });

      const p1 = await listWorkers(admin(t), { page: 1, pageSize: 2 });
      expect(p1.rows).toHaveLength(2);
      expect(p1.total).toBe(5);
      expect(p1.rows.map((r) => r.full_name)).toEqual(['W1', 'W2']);

      const p2 = await listWorkers(admin(t), { page: 2, pageSize: 2 });
      expect(p2.rows.map((r) => r.full_name)).toEqual(['W3', 'W4']);
      expect(p2.total).toBe(5);

      const p3 = await listWorkers(admin(t), { page: 3, pageSize: 2 });
      expect(p3.rows.map((r) => r.full_name)).toEqual(['W5']);
    });
  });

  it('ids path returns requested rows unpaginated', async () => {
    await withDb(async ({ t }) => {
      const ids: string[] = [];
      for (const n of ['A', 'B', 'C', 'D']) ids.push(await makeWorker(t, { name: n }));

      const want = [ids[0]!, ids[2]!, ids[3]!];
      const { rows, total } = await listWorkers(admin(t), { ids: want, pageSize: 1 });
      expect(rows).toHaveLength(3);
      expect(total).toBe(3);
      expect(new Set(rows.map((r) => r.worker_id))).toEqual(new Set(want));
    });
  });

  it('FUT-542: any people.worker.read holder sees the full tenant directory', async () => {
    await withDb(async ({ t }) => {
      const userM = crypto.randomUUID();
      const m = await makeWorker(t, { name: 'Manager M', userId: userM });
      const unit = await seedOrgUnit({
        tenant_id: t.tenant_id,
        name: 'M Unit',
        kind: 'operation',
        head_worker_id: m,
      });
      const r1 = await makeWorker(t, { name: 'Report R1', orgUnitId: unit });
      void r1;
      const unrelated = await makeWorker(t, { name: 'Unrelated U' });
      void unrelated;

      const viewerRows = await listWorkers(viewer(t, userM), {});
      expect(viewerRows.rows.map((row) => row.full_name).sort()).toEqual([
        'Manager M',
        'Report R1',
        'Unrelated U',
      ]);
      expect(viewerRows.total).toBe(3);
    });
  });

  it('rejects a session lacking people.worker.read', async () => {
    await withDb(async ({ t }) => {
      const noPerm = buildSession({ tenant_id: t.tenant_id, user_id: t.admin_user_id, roles: [] });
      await expect(listWorkers(noPerm, {})).rejects.toThrow(/FORBIDDEN|permission/i);
    });
  });

  it('manager_name is null when the manager is soft-deleted', async () => {
    await withDb(async ({ t }) => {
      const mgr = await makeWorker(t, { name: 'Deleted Manager' });
      const unit = await seedOrgUnit({
        tenant_id: t.tenant_id,
        name: 'Orphan Unit',
        kind: 'operation',
        head_worker_id: mgr,
      });
      await makeWorker(t, { name: 'Orphaned Worker', orgUnitId: unit });

      // Soft-delete the manager
      await peopleDb().update(person).set({ deleted_at: new Date() }).where(eq(person.id, mgr));

      const { rows } = await listWorkers(admin(t), { search: 'Orphaned Worker' });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.manager_name).toBeNull();
    });
  });

  it('search matches account_name case-insensitively', async () => {
    await withDb(async ({ t }) => {
      const w = await makeWorker(t, { name: 'Account Search Worker' });
      const acc = crypto.randomUUID();
      await addAllocation(t, { workerId: w, accountId: acc, accountName: 'Zebra Corp' });
      await makeWorker(t, { name: 'No Account Worker' });

      const { rows } = await listWorkers(admin(t), { search: 'zebra' });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.full_name).toBe('Account Search Worker');

      const upper = await listWorkers(admin(t), { search: 'ZEBRA CORP' });
      expect(upper.rows).toHaveLength(1);
    });
  });

  it('search matches skill_name case-insensitively', async () => {
    await withDb(async ({ t }) => {
      const w = await makeWorker(t, { name: 'Skill Search Worker' });
      const sk = crypto.randomUUID();
      await addSkill(t, w, sk, 'GraphQL');
      await makeWorker(t, { name: 'No Skill Worker' });

      const { rows } = await listWorkers(admin(t), { search: 'graphql' });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.full_name).toBe('Skill Search Worker');

      const upper = await listWorkers(admin(t), { search: 'GRAPHQL' });
      expect(upper.rows).toHaveLength(1);
    });
  });

  it('search + status filter narrow results together', async () => {
    await withDb(async ({ t }) => {
      const bob = await makeWorker(t, { name: 'Bob Builder' });
      const alice = await makeWorker(t, { name: 'Alice Coder' });
      await addEmployment(t, bob, { stage: 'active', start: '2026-01-01' });
      await addEmployment(t, alice, { stage: 'active', start: '2026-02-01' });
      const charlie = await makeWorker(t, { name: 'Charlie Designer' });
      await addEmployment(t, charlie, { stage: 'onboarding', start: '2026-03-01' });

      // search "bob" + status "active" → only Bob
      const { rows } = await listWorkers(admin(t), { search: 'bob', status: ['active'] });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.full_name).toBe('Bob Builder');

      // search "charlie" + status "active" → nobody (Charlie is onboarding)
      const empty = await listWorkers(admin(t), { search: 'charlie', status: ['active'] });
      expect(empty.rows).toHaveLength(0);
    });
  });
});

describe('listWorkers work fields', () => {
  it('returns org_unit and projects for directory columns', async () => {
    await withDb(async ({ t }) => {
      const unitId = await seedOrgUnit({
        tenant_id: t.tenant_id,
        name: 'Engineering',
        kind: 'delivery',
      });
      const w = await makeWorker(t, { name: 'Eng Anna', orgUnitId: unitId });
      const projectId = crypto.randomUUID();
      await peopleDb().insert(projectProjection).values({
        project_id: projectId,
        tenant_id: t.tenant_id,
        account_id: crypto.randomUUID(),
        name: 'Web Platform',
      });
      await addAllocation(t, {
        workerId: w,
        projectId,
        accountId: crypto.randomUUID(),
        accountName: 'ACME',
      });

      const { rows } = await listWorkers(t.adminSession, { ids: [w] });
      expect(rows[0]?.org_unit_id).toBe(unitId);
      expect(rows[0]?.org_unit_name).toBe('Engineering');
      expect(rows[0]?.projects).toEqual([{ id: projectId, name: 'Web Platform' }]);
      expect(rows[0]?.accounts).toEqual([expect.objectContaining({ name: 'ACME' })]);
    });
  });

  it('returns empty projects and null org_unit when unassigned', async () => {
    await withDb(async ({ t }) => {
      const w = await makeWorker(t, { name: 'Bare Bob' });
      const { rows } = await listWorkers(t.adminSession, { ids: [w] });
      expect(rows[0]?.org_unit_id).toBeNull();
      expect(rows[0]?.org_unit_name).toBeNull();
      expect(rows[0]?.projects).toEqual([]);
    });
  });
});
