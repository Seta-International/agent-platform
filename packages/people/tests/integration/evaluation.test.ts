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
import type { EvaluationScoreInput, EvaluationView } from '../../src/contracts.ts';
import {
  readEvaluation,
  saveEvaluationDraft,
  submitEvaluation,
  unlockCycle,
} from '../../src/index.ts';
import { buildSession, linkUserToPerson, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

afterEach(() => setMonthClock());

/** UTC instant that reads as `hour` on the VN (UTC+7) wall clock. */
function vn(year: number, month: number, day: number, hour = 12): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 7));
}

/** An open-window instant (the 26th) inside the current cycle month. */
function openWindowNow(): { month: string; at: Date } {
  const month = vnYearMonth();
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { month, at: vn(y, m, 26, 10) };
}

type Fixture = Awaited<ReturnType<typeof seedProject>>;

/** Account with one project: an AM, a TL leading it, and one member. */
async function seedProject(pool: Pool) {
  const t = await seedTenant(pool);
  const mk = async (name: string) => {
    const w = await createWorker({ session: t.adminSession, full_name: name });
    const userId = crypto.randomUUID();
    await linkUserToPerson(t.tenant_id, w.worker_id, userId);
    return { person_id: w.worker_id, user_id: userId };
  };
  const am = await mk('Ada AM');
  const tl = await mk('Tom TL');
  const member = await mk('Mia Member');
  const outsider = await mk('Otto Outsider');

  const { account_id } = await createAccount({
    name: 'Contoso',
    am_worker_id: am.person_id,
    session: buildSession({
      tenant_id: t.tenant_id,
      user_id: crypto.randomUUID(),
      roles: ['pm.manager'],
      assignments: [{ role_slug: 'pm.manager', scope_kind: 'tenant', scope_id: null }],
    }),
  });

  const project_id = crypto.randomUUID();
  const db = peopleDb();
  await db
    .insert(accountProjection)
    .values({ account_id, tenant_id: t.tenant_id, name: 'Contoso' });
  await db
    .insert(projectProjection)
    .values({ project_id, tenant_id: t.tenant_id, account_id, name: 'Atlas' });
  await db.insert(workerAllocationProjection).values(
    [tl, member].map((p) => ({
      allocation_id: crypto.randomUUID(),
      tenant_id: t.tenant_id,
      person_id: p.person_id,
      project_id,
      account_id,
      lead_person_id: tl.person_id,
      active: true,
    })),
  );

  const sessionFor = (p: { person_id: string; user_id: string }) =>
    buildSession({
      tenant_id: t.tenant_id,
      user_id: p.user_id,
      roles: ['people.viewer'],
      person_id: p.person_id,
    });

  return { t, am, tl, member, outsider, account_id, project_id, sessionFor };
}

/** Every criterion of the loaded form scored the same, with evidence. */
function scoreAll(view: EvaluationView, score: number): EvaluationScoreInput[] {
  return view.groups.flatMap((g) =>
    g.criteria.map((c) => ({ criterion_id: c.criterion_id, score, evidence: 'shipped Atlas v2' })),
  );
}

async function withFixture(fn: (f: Fixture) => Promise<void>): Promise<void> {
  await withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    resetPmDb();
    initPools({ databaseUrl });
    try {
      await fn(await seedProject(pool));
    } finally {
      resetPeopleDb();
      resetPmDb();
      resetCoreDb();
      await closePools();
    }
  });
}

describe('evaluation form (FUT-784)', () => {
  it('TL loads an empty form: the account axis, no scores, overall null', async () => {
    await withFixture(async (f) => {
      const { month, at } = openWindowNow();
      setMonthClock(() => at);

      const view = await readEvaluation(f.sessionFor(f.tl), {
        month,
        subject_person_id: f.member.person_id,
        project_id: f.project_id,
      });

      expect(view.evaluator_capacity).toBe('tl');
      expect(view.subject.full_name).toBe('Mia Member');
      expect(view.subject.project_name).toBe('Atlas');
      expect(view.cycle_status).toBe('open');
      expect(view.editable).toBe(true);
      expect(view.status).toBe('draft');
      expect(view.version).toBe(0);
      expect(view.overall).toBeNull();
      expect(view.top_action_required).toBe(false);
      expect(view.groups).toHaveLength(5);
      expect(view.groups.reduce((s, g) => s + g.weight, 0)).toBe(100);
      expect(view.groups.every((g) => g.criteria.every((c) => c.score === null))).toBe(true);
    });
  });

  it('saves a partial draft: scores persist, overall stays null, version bumps', async () => {
    await withFixture(async (f) => {
      const { month, at } = openWindowNow();
      setMonthClock(() => at);
      const session = f.sessionFor(f.tl);
      const target = {
        month,
        subject_person_id: f.member.person_id,
        project_id: f.project_id,
      };
      const empty = await readEvaluation(session, target);
      const first = empty.groups[0]?.criteria[0];
      if (!first) throw new Error('no criteria seeded');

      const saved = await saveEvaluationDraft(session, {
        ...target,
        base_version: empty.version,
        scores: [{ criterion_id: first.criterion_id, score: 3, evidence: '' }],
        strengths: 'Reliable on delivery',
        improve: '',
        top_action: '',
      });

      expect(saved.status).toBe('draft');
      expect(saved.version).toBe(1);
      expect(saved.overall).toBeNull();
      expect(saved.strengths).toBe('Reliable on delivery');
      // A score under 4 makes the Top Action mandatory before submit (AC3).
      expect(saved.top_action_required).toBe(true);

      const reloaded = await readEvaluation(session, target);
      expect(reloaded.version).toBe(1);
      expect(
        reloaded.groups
          .flatMap((g) => g.criteria)
          .find((c) => c.criterion_id === first.criterion_id)?.score,
      ).toBe(3);
    });
  });

  it('a criterion can be scored on the half point', async () => {
    await withFixture(async (f) => {
      const { month, at } = openWindowNow();
      setMonthClock(() => at);
      const session = f.sessionFor(f.tl);
      const target = { month, subject_person_id: f.member.person_id, project_id: f.project_id };
      const empty = await readEvaluation(session, target);
      const scores = scoreAll(empty, 4);
      const half = scores[0];
      if (!half) throw new Error('no criteria seeded');
      half.score = 3.5;

      const submitted = await submitEvaluation(session, {
        ...target,
        base_version: empty.version,
        scores,
        strengths: '',
        improve: '',
        top_action: 'Pair on the release checklist',
      });

      expect(
        submitted.groups
          .flatMap((g) => g.criteria)
          .find((c) => c.criterion_id === half.criterion_id)?.score,
      ).toBe(3.5);
      // The half point pulls the weighted mean below a straight 4.
      expect(submitted.overall).toBeLessThan(4);
    });
  });

  it('a score at either end of the scale submits on its own — the form collects numbers only', async () => {
    await withFixture(async (f) => {
      const { month, at } = openWindowNow();
      setMonthClock(() => at);
      const session = f.sessionFor(f.tl);
      const target = { month, subject_person_id: f.member.person_id, project_id: f.project_id };
      const empty = await readEvaluation(session, target);
      const scores = scoreAll(empty, 4);
      const low = scores[0];
      if (!low) throw new Error('no criteria seeded');
      low.score = 1;
      low.evidence = '';

      const draft = await saveEvaluationDraft(session, {
        ...target,
        base_version: empty.version,
        scores,
        strengths: '',
        improve: '',
        top_action: 'Pair on the release checklist',
      });
      const submitted = await submitEvaluation(session, {
        ...target,
        base_version: draft.version,
        scores,
        strengths: '',
        improve: '',
        top_action: 'Pair on the release checklist',
      });

      expect(submitted.status).toBe('submitted');
      expect(
        submitted.groups.flatMap((g) => g.criteria).find((c) => c.criterion_id === low.criterion_id)
          ?.score,
      ).toBe(1);
    });
  });

  it('submit blocks on an unscored criterion, naming it', async () => {
    await withFixture(async (f) => {
      const { month, at } = openWindowNow();
      setMonthClock(() => at);
      const session = f.sessionFor(f.tl);
      const target = { month, subject_person_id: f.member.person_id, project_id: f.project_id };
      const empty = await readEvaluation(session, target);
      const scores = scoreAll(empty, 4);
      const skipped = scores.pop();
      if (!skipped) throw new Error('no criteria seeded');
      const skippedName = empty.groups
        .flatMap((g) => g.criteria)
        .find((c) => c.criterion_id === skipped.criterion_id)?.name as string;

      await expect(
        submitEvaluation(session, {
          ...target,
          base_version: empty.version,
          scores,
          strengths: '',
          improve: '',
          top_action: '',
        }),
      ).rejects.toMatchObject({
        code: 'VALIDATION',
        message: expect.stringContaining(skippedName),
      });
    });
  });

  it('submit blocks when a score is under 4 and no Top Action is given', async () => {
    await withFixture(async (f) => {
      const { month, at } = openWindowNow();
      setMonthClock(() => at);
      const session = f.sessionFor(f.tl);
      const target = { month, subject_person_id: f.member.person_id, project_id: f.project_id };
      const empty = await readEvaluation(session, target);
      const scores = scoreAll(empty, 4);
      (scores[0] as EvaluationScoreInput).score = 3;

      await expect(
        submitEvaluation(session, {
          ...target,
          base_version: empty.version,
          scores,
          strengths: '',
          improve: '',
          top_action: '   ',
        }),
      ).rejects.toMatchObject({
        code: 'VALIDATION',
        message: expect.stringContaining('Top Action'),
      });
    });
  });

  it('submit computes the weighted overall server-side and freezes the evaluation', async () => {
    await withFixture(async (f) => {
      const { month, at } = openWindowNow();
      setMonthClock(() => at);
      const session = f.sessionFor(f.tl);
      const target = { month, subject_person_id: f.member.person_id, project_id: f.project_id };
      const empty = await readEvaluation(session, target);

      const submitted = await submitEvaluation(session, {
        ...target,
        base_version: empty.version,
        scores: scoreAll(empty, 4),
        strengths: 'Consistent',
        improve: '',
        top_action: '',
      });

      expect(submitted.status).toBe('submitted');
      // Every criterion scored 4 → every group scores 4 → overall 4 regardless of weights.
      expect(submitted.overall).toBe(4);
      expect(submitted.submitted_at).not.toBeNull();

      const reloaded = await readEvaluation(session, target);
      expect(reloaded.overall).toBe(4);
      expect(reloaded.status).toBe('submitted');
    });
  });

  it('a stale base_version is rejected — the second tab cannot overwrite the first', async () => {
    await withFixture(async (f) => {
      const { month, at } = openWindowNow();
      setMonthClock(() => at);
      const session = f.sessionFor(f.tl);
      const target = { month, subject_person_id: f.member.person_id, project_id: f.project_id };
      const tabA = await readEvaluation(session, target);
      const tabB = tabA;

      await saveEvaluationDraft(session, {
        ...target,
        base_version: tabA.version,
        scores: [],
        strengths: 'from tab A',
        improve: '',
        top_action: '',
      });

      await expect(
        saveEvaluationDraft(session, {
          ...target,
          base_version: tabB.version,
          scores: [],
          strengths: 'from tab B',
          improve: '',
          top_action: '',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      const reloaded = await readEvaluation(session, target);
      expect(reloaded.strengths).toBe('from tab A');
    });
  });

  it('a closed month is read-only until PMO unlocks the account', async () => {
    await withFixture(async (f) => {
      // Day 10 of M+1: last month's window (open + makeup) has fully ended.
      const now = vn(2026, 7, 10);
      setMonthClock(() => now);
      const month = '2026-06';
      const session = f.sessionFor(f.tl);
      const target = { month, subject_person_id: f.member.person_id, project_id: f.project_id };

      const locked = await readEvaluation(session, target);
      expect(locked.cycle_status).toBe('locked');
      expect(locked.editable).toBe(false);
      await expect(
        saveEvaluationDraft(session, {
          ...target,
          base_version: locked.version,
          scores: [],
          strengths: 'late edit',
          improve: '',
          top_action: '',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });

      const pmo = buildSession({
        tenant_id: f.t.tenant_id,
        user_id: crypto.randomUUID(),
        roles: ['pm.pmo'],
        assignments: [{ role_slug: 'pm.pmo', scope_kind: 'tenant', scope_id: null }],
        person_id: f.am.person_id,
      });
      await unlockCycle(pmo, { month, account_id: f.account_id, days: 3 });

      const reopened = await readEvaluation(session, target);
      expect(reopened.cycle_status).toBe('override');
      expect(reopened.editable).toBe(true);
      const saved = await saveEvaluationDraft(session, {
        ...target,
        base_version: reopened.version,
        scores: [],
        strengths: 'fixed after unlock',
        improve: '',
        top_action: '',
      });
      expect(saved.strengths).toBe('fixed after unlock');
    });
  });

  it('the AM evaluates the TL; nobody else on the project may', async () => {
    await withFixture(async (f) => {
      const { month, at } = openWindowNow();
      setMonthClock(() => at);
      const target = { month, subject_person_id: f.tl.person_id, project_id: f.project_id };

      const amView = await readEvaluation(f.sessionFor(f.am), target);
      expect(amView.evaluator_capacity).toBe('am');
      expect(amView.subject.full_name).toBe('Tom TL');

      await expect(readEvaluation(f.sessionFor(f.member), target)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(readEvaluation(f.sessionFor(f.outsider), target)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  it('nobody evaluates themselves', async () => {
    await withFixture(async (f) => {
      const { month, at } = openWindowNow();
      setMonthClock(() => at);
      await expect(
        readEvaluation(f.sessionFor(f.tl), {
          month,
          subject_person_id: f.tl.person_id,
          project_id: f.project_id,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
