import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { plannerDb, taskReferences } from '../../../src/backend/db/index.ts';
import { linkTasks, markAsDuplicate } from '../../../src/backend/domain/link-tasks.ts';
import { createGroup, createPlan, createTask, deleteTask } from '../../../src/index.ts';
import { makeMemberSession, seedTenant } from '../../helpers.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

type SeedTask = Awaited<ReturnType<typeof createTask>>;

/** tenant + group + plan + N tasks, through the domain, one session. */
async function seed(pool: Parameters<typeof seedTenant>[0], titles: string[]) {
  const seeded = await seedTenant(pool);
  const session = seeded.adminSession;
  const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
  const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
  const tasks: SeedTask[] = [];
  for (const title of titles) {
    tasks.push(await createTask({ plan_id: plan.id, title, session }));
  }
  return { seeded, session, group, plan, tasks };
}

function linkRows() {
  return plannerDb().select().from(taskReferences);
}

describe('linkTasks', () => {
  it('writes ONE task_references row whose url is the plan-free canonical path', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Alpha', 'Beta']);
      const [a, b] = tasks as [SeedTask, SeedTask];

      const link = await linkTasks({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
        session,
      });

      const rows = await plannerDb()
        .select()
        .from(taskReferences)
        .where(eq(taskReferences.id, link.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        task_id: a.id,
        url: `/planner/tasks/${b.id}`,
        type: 'relates',
        alias: null,
      });

      const events = await pool.query(
        `SELECT payload FROM core.events WHERE event_type = 'planner.task.link-added'`,
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].payload).toMatchObject({
        reference_id: link.id,
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
      });
    }));

  it('refuses a self-link with a sentence, before the CHECK ever fires', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Alpha']);
      const [a] = tasks as [SeedTask];
      await expect(
        linkTasks({ source_task_id: a.id, target_task_id: a.id, kind: 'relates', session }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    }));

  it('refuses linking TO a trashed task', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Alpha', 'Beta']);
      const [a, b] = tasks as [SeedTask, SeedTask];
      await deleteTask({ task_id: b.id, expected_version: b.version, session });
      await expect(
        linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }));

  // THE test FUT-820 is actually about: update on the source's group is not
  // enough. Without the second check, an actor learns the target's title.
  it('refuses when the actor can update the source group but not the target group', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const admin = seeded.adminSession;
      const groupA = await createGroup({ tenant_id: seeded.tenant_id, name: 'A', session: admin });
      const groupB = await createGroup({ tenant_id: seeded.tenant_id, name: 'B', session: admin });
      const planA = await createPlan({ group_id: groupA.id, name: 'PA', session: admin });
      const planB = await createPlan({ group_id: groupB.id, name: 'PB', session: admin });
      const a = await createTask({ plan_id: planA.id, title: 'Alpha', session: admin });
      const b = await createTask({ plan_id: planB.id, title: 'Beta', session: admin });
      const member = await makeMemberSession(pool, {
        tenant_id: seeded.tenant_id,
        group_id: groupA.id,
        role: 'member',
      });

      await expect(
        linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session: member }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await linkRows()).toHaveLength(0);
    }));
});

// Spec §6.2 test 1b: the pre-checks that replaced the expression index. Each
// branch gets its own sentence, and the pair is read INSIDE the advisory lock,
// which is what turns these from advice into enforcement.
describe('linkTasks — one relationship per pair (D8)', () => {
  it('refuses the same kind in the same direction', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Alpha', 'Beta']);
      const [a, b] = tasks as [SeedTask, SeedTask];
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session });

      const err = await linkTasks({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
        session,
      }).catch((e) => e);
      expect(err).toMatchObject({ code: 'DUPLICATE_REFERENCE' });
      expect(err.message).toMatch(/already linked/i);
      expect(await linkRows()).toHaveLength(1);
    }));

  it('refuses the same kind in the opposite direction — one symmetric fact', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Alpha', 'Beta']);
      const [a, b] = tasks as [SeedTask, SeedTask];
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session });

      const err = await linkTasks({
        source_task_id: b.id,
        target_task_id: a.id,
        kind: 'relates',
        session,
      }).catch((e) => e);
      expect(err).toMatchObject({ code: 'DUPLICATE_REFERENCE' });
      expect(err.message).toMatch(/other direction/i);
    }));

  it('refuses a mutual block', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Alpha', 'Beta']);
      const [a, b] = tasks as [SeedTask, SeedTask];
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'blocks', session });

      await expect(
        linkTasks({ source_task_id: b.id, target_task_id: a.id, kind: 'blocks', session }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_REFERENCE' });
    }));

  it('refuses the inverse duplicates row with its own sentence', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Alpha', 'Beta']);
      const [a, b] = tasks as [SeedTask, SeedTask];
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'duplicates', session });

      const err = await linkTasks({
        source_task_id: b.id,
        target_task_id: a.id,
        kind: 'duplicates',
        session,
      }).catch((e) => e);
      expect(err).toMatchObject({ code: 'DUPLICATE_REFERENCE' });
      expect(err.message).toMatch(/other way round/i);
    }));

  // D8's headline: a pair-direction holds ONE kind, so a kind change is refused
  // NAMING what is there. The tool never rewrites a relationship it did not make.
  it('refuses a different kind, naming the kind that is already there', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Alpha', 'Beta']);
      const [a, b] = tasks as [SeedTask, SeedTask];
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'blocks', session });

      const err = await linkTasks({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
        session,
      }).catch((e) => e);
      expect(err).toMatchObject({
        code: 'DUPLICATE_REFERENCE',
        details: { existing_kind: 'blocks' },
      });
      expect(err.message).toMatch(/blocks/);
      expect(await linkRows()).toHaveLength(1);
    }));

  it('refuses a second duplicates row out of the same source, naming the existing target', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Alpha', 'Beta', 'Gamma']);
      const [a, b, c] = tasks as [SeedTask, SeedTask, SeedTask];
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'duplicates', session });

      const err = await linkTasks({
        source_task_id: a.id,
        target_task_id: c.id,
        kind: 'duplicates',
        session,
      }).catch((e) => e);
      expect(err).toMatchObject({ code: 'DUPLICATE_REFERENCE' });
      expect(err.details).toMatchObject({ target_task_id: b.id });
    }));
});

// Spec §6.2 test 19. Merge must succeed on a pair the dedup workflow already
// marked `relates` — the common case — and D8 forbids a second row, so merge
// PROMOTES in place. The row keeps its id so a link the user is looking at does
// not change identity underneath them.
describe('markAsDuplicate', () => {
  it('promotes an existing relates row in place, keeping its id', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Dup', 'Keep']);
      const [dup, keep] = tasks as [SeedTask, SeedTask];
      const related = await linkTasks({
        source_task_id: dup.id,
        target_task_id: keep.id,
        kind: 'relates',
        session,
      });

      const promoted = await markAsDuplicate({
        duplicate_task_id: dup.id,
        keep_task_id: keep.id,
        session,
      });

      expect(promoted.id).toBe(related.id);
      const rows = await linkRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: related.id,
        task_id: dup.id,
        url: `/planner/tasks/${keep.id}`,
        type: 'duplicates',
      });
    }));

  it('promotes an INVERSE relates row into the canonical direction, same id', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Dup', 'Keep']);
      const [dup, keep] = tasks as [SeedTask, SeedTask];
      // The user linked keep → dup last week; today they merge dup INTO keep.
      const related = await linkTasks({
        source_task_id: keep.id,
        target_task_id: dup.id,
        kind: 'relates',
        session,
      });

      const promoted = await markAsDuplicate({
        duplicate_task_id: dup.id,
        keep_task_id: keep.id,
        session,
      });

      expect(promoted.id).toBe(related.id);
      const rows = await linkRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        task_id: dup.id,
        url: `/planner/tasks/${keep.id}`,
        type: 'duplicates',
      });
    }));

  it('inserts when the pair is clean', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Dup', 'Keep']);
      const [dup, keep] = tasks as [SeedTask, SeedTask];
      await markAsDuplicate({ duplicate_task_id: dup.id, keep_task_id: keep.id, session });
      const rows = await linkRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ task_id: dup.id, type: 'duplicates' });
    }));

  it('refuses a pair carrying blocks, and one already merged', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, tasks } = await seed(pool, ['Dup', 'Keep', 'Other']);
      const [dup, keep, other] = tasks as [SeedTask, SeedTask, SeedTask];
      await linkTasks({ source_task_id: dup.id, target_task_id: keep.id, kind: 'blocks', session });
      await expect(
        markAsDuplicate({ duplicate_task_id: dup.id, keep_task_id: keep.id, session }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_REFERENCE' });

      await markAsDuplicate({ duplicate_task_id: other.id, keep_task_id: keep.id, session });
      await expect(
        markAsDuplicate({ duplicate_task_id: other.id, keep_task_id: keep.id, session }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_REFERENCE' });
    }));
});
