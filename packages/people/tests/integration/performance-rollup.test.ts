import { resetCoreDb } from '@seta/core/testing';
import { createAccount } from '@seta/pm';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  projectProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { setMonthClock, vnYearMonth } from '../../src/backend/domain/month-clock.ts';
import { readEvaluation, readPerformanceRollup, submitEvaluation } from '../../src/index.ts';
import { buildSession, linkUserToPerson, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

afterEach(() => setMonthClock());

function vn(year: number, month: number, day: number, hour = 12): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 7));
}

type Person = { person_id: string; user_id: string };
type Fixture = Awaited<ReturnType<typeof seedAccount>>;

/**
 * One account, two projects: Atlas (TL Tom, members Mia + Max) and Borealis
 * (TL Ben, member Bea). Ada is the AM.
 */
async function seedAccount(pool: Pool) {
  const t = await seedTenant(pool);
  const db = peopleDb();
  const mk = async (name: string): Promise<Person> => {
    const w = await createWorker({ session: t.adminSession, full_name: name });
    const user_id = crypto.randomUUID();
    await linkUserToPerson(t.tenant_id, w.worker_id, user_id);
    return { person_id: w.worker_id, user_id };
  };
  const ada = await mk('Ada AM');
  const tom = await mk('Tom TL');
  const mia = await mk('Mia Member');
  const max = await mk('Max Member');
  const ben = await mk('Ben TL');
  const bea = await mk('Bea Member');

  const { account_id } = await createAccount({
    name: 'Contoso',
    am_worker_id: ada.person_id,
    session: buildSession({
      tenant_id: t.tenant_id,
      user_id: crypto.randomUUID(),
      roles: ['pm.manager'],
      assignments: [{ role_slug: 'pm.manager', scope_kind: 'tenant', scope_id: null }],
    }),
  });
  await db
    .insert(accountProjection)
    .values({ account_id, tenant_id: t.tenant_id, name: 'Contoso' });

  const atlas = crypto.randomUUID();
  const borealis = crypto.randomUUID();
  await db.insert(projectProjection).values([
    { project_id: atlas, tenant_id: t.tenant_id, account_id, name: 'Atlas' },
    { project_id: borealis, tenant_id: t.tenant_id, account_id, name: 'Borealis' },
  ]);
  const alloc = (p: Person, project_id: string, lead: Person) => ({
    allocation_id: crypto.randomUUID(),
    tenant_id: t.tenant_id,
    person_id: p.person_id,
    project_id,
    account_id,
    lead_person_id: lead.person_id,
    active: true,
  });
  await db
    .insert(workerAllocationProjection)
    .values([
      alloc(tom, atlas, tom),
      alloc(mia, atlas, tom),
      alloc(max, atlas, tom),
      alloc(ben, borealis, ben),
      alloc(bea, borealis, ben),
    ]);

  const sessionFor = (p: Person, roles: string[] = ['people.viewer']) =>
    buildSession({
      tenant_id: t.tenant_id,
      user_id: p.user_id,
      roles,
      assignments: roles.map((role_slug) => ({
        role_slug,
        scope_kind: 'tenant' as const,
        scope_id: null,
      })),
      person_id: p.person_id,
    });

  return { t, ada, tom, mia, max, ben, bea, account_id, atlas, borealis, sessionFor };
}

/** Submit a complete evaluation with every criterion on the same score. */
async function submitFlat(
  f: Fixture,
  evaluator: Person,
  subject: Person,
  project_id: string,
  month: string,
  score: number,
): Promise<void> {
  const session = f.sessionFor(evaluator);
  const target = { month, subject_person_id: subject.person_id, project_id };
  const view = await readEvaluation(session, target);
  await submitEvaluation(session, {
    ...target,
    base_version: view.version,
    scores: view.groups.flatMap((g) =>
      g.criteria.map((c) => ({ criterion_id: c.criterion_id, score, evidence: 'evidence' })),
    ),
    strengths: `Strengths for ${subject.person_id.slice(0, 4)}`,
    improve: '',
    top_action: score < 4 ? 'Pair on the release checklist' : '',
  });
}

/** Atlas fully scored (Mia 4, Max 2, Tom 5); Borealis only Bea (3), Ben pending. */
async function seedScores(f: Fixture, month: string): Promise<void> {
  await submitFlat(f, f.tom, f.mia, f.atlas, month, 4);
  await submitFlat(f, f.tom, f.max, f.atlas, month, 2);
  await submitFlat(f, f.ada, f.tom, f.atlas, month, 5);
  await submitFlat(f, f.ben, f.bea, f.borealis, month, 3);
}

async function withFixture(fn: (f: Fixture, month: string) => Promise<void>): Promise<void> {
  await withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    resetPmDb();
    initPools({ databaseUrl });
    try {
      const month = vnYearMonth();
      const [y, m] = month.split('-').map(Number) as [number, number];
      setMonthClock(() => vn(y, m, 26, 10));
      await fn(await seedAccount(pool), month);
    } finally {
      resetPeopleDb();
      resetPmDb();
      resetCoreDb();
      await closePools();
    }
  });
}

describe('performance roll-up (FUT-784)', () => {
  it('an unevaluated month reports zero progress and a null overall, not zeros', async () => {
    await withFixture(async (f, month) => {
      const rollup = await readPerformanceRollup(f.sessionFor(f.tom), {
        scope: 'project',
        month,
        project_id: f.atlas,
      });

      expect(rollup.label).toBe('Atlas');
      expect(rollup.overall).toBeNull();
      expect(rollup.scored).toBe(0);
      expect(rollup.total).toBe(3);
      expect(rollup.groups).toHaveLength(5);
      expect(rollup.rows).toHaveLength(3);
      expect(rollup.rows.every((r) => r.overall === null)).toBe(true);
      expect(rollup.rows.every((r) => Object.keys(r.scores).length === 0)).toBe(true);
    });
  });

  it('project scope averages the people who have been scored', async () => {
    await withFixture(async (f, month) => {
      await seedScores(f, month);
      const rollup = await readPerformanceRollup(f.sessionFor(f.tom), {
        scope: 'project',
        month,
        project_id: f.atlas,
      });

      expect(rollup.scored).toBe(3);
      expect(rollup.total).toBe(3);
      // The single-column heat map needs the project's own group means, not just the total.
      expect(Object.values(rollup.scores).every((v) => v === 3.67)).toBe(true);
      expect(rollup.rows.filter((r) => r.is_lead).map((r) => r.name)).toEqual(['Tom TL']);
      // Mia 4, Max 2, Tom 5 → 3.67 on every group, so 3.67 overall.
      expect(rollup.overall).toBe(3.67);
      const mia = rollup.rows.find((r) => r.id === f.mia.person_id);
      expect(mia?.name).toBe('Mia Member');
      expect(mia?.overall).toBe(4);
      expect(rollup.rows.find((r) => r.id === f.max.person_id)?.overall).toBe(2);
    });
  });

  it('account scope drills projects → people and counts what is still pending', async () => {
    await withFixture(async (f, month) => {
      await seedScores(f, month);
      const rollup = await readPerformanceRollup(f.sessionFor(f.ada), {
        scope: 'account',
        month,
        account_id: f.account_id,
      });

      expect(rollup.label).toBe('Contoso');
      expect(rollup.scored).toBe(4);
      expect(rollup.total).toBe(5);
      expect(rollup.rows.map((r) => r.name)).toEqual(['Atlas', 'Borealis']);

      const atlas = rollup.rows[0];
      expect(atlas?.kind).toBe('project');
      expect(atlas?.subtitle).toBe('Tom TL');
      expect(atlas?.member_count).toBe(3);
      expect(atlas?.overall).toBe(3.67);
      expect(atlas?.children.map((c) => c.name).sort()).toEqual([
        'Max Member',
        'Mia Member',
        'Tom TL',
      ]);

      const borealis = rollup.rows[1];
      expect(borealis?.scored).toBe(1);
      expect(borealis?.total).toBe(2);
      expect(borealis?.overall).toBe(3);
      expect(borealis?.children.find((c) => c.name === 'Ben TL')?.overall).toBeNull();

      // Account mean of the two project means: (3.67 + 3) / 2.
      expect(rollup.overall).toBe(3.33);
    });
  });

  it('org scope drills accounts → projects and needs the org permission', async () => {
    await withFixture(async (f, month) => {
      await seedScores(f, month);

      await expect(
        readPerformanceRollup(f.sessionFor(f.tom), { scope: 'org', month }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      const pmo = f.sessionFor(f.ada, ['pm.pmo']);
      const rollup = await readPerformanceRollup(pmo, { scope: 'org', month });
      expect(rollup.rows).toHaveLength(1);
      const account = rollup.rows[0];
      expect(account?.kind).toBe('account');
      expect(account?.name).toBe('Contoso');
      expect(account?.subtitle).toBe('Ada AM');
      expect(account?.member_count).toBe(5);
      expect(account?.children.map((c) => c.name)).toEqual(['Atlas', 'Borealis']);
      expect(rollup.overall).toBe(3.33);
      expect(rollup.groups.reduce((s, g) => s + g.weight, 0)).toBe(100);
    });
  });

  it('self scope returns the reviews the person received, per project', async () => {
    await withFixture(async (f, month) => {
      await seedScores(f, month);
      const rollup = await readPerformanceRollup(f.sessionFor(f.mia), { scope: 'self', month });

      expect(rollup.label).toBe('Mia Member');
      expect(rollup.overall).toBe(4);
      expect(rollup.rows).toHaveLength(1);
      expect(rollup.rows[0]?.name).toBe('Atlas');
      expect(rollup.reviews).toHaveLength(1);
      const review = rollup.reviews[0];
      expect(review?.project_name).toBe('Atlas');
      expect(review?.evaluator_name).toBe('Tom TL');
      expect(review?.evaluator_capacity).toBe('tl');
      expect(review?.status).toBe('submitted');
      expect(review?.overall).toBe(4);
      expect(review?.strengths).toContain('Strengths for');
    });
  });

  it('a member cannot read another project or the account they are not AM of', async () => {
    await withFixture(async (f, month) => {
      await expect(
        readPerformanceRollup(f.sessionFor(f.mia), {
          scope: 'project',
          month,
          project_id: f.borealis,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        readPerformanceRollup(f.sessionFor(f.tom), {
          scope: 'account',
          month,
          account_id: f.account_id,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
