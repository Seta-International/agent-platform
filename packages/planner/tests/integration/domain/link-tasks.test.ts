import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { plannerDb, taskLinks } from '../../../src/backend/db/index.ts';
import { linkTasks } from '../../../src/backend/domain/link-tasks.ts';
import { createGroup, createPlan, createTask, deleteTask } from '../../../src/index.ts';
import { makeMemberSession, seedTenant } from '../../helpers.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

describe('linkTasks', () => {
  it('links two tasks and emits link-added', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const session = seeded.adminSession;
      const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
      const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
      const a = await createTask({ plan_id: plan.id, title: 'Alpha', session });
      const b = await createTask({ plan_id: plan.id, title: 'Beta', session });

      const link = await linkTasks({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
        session,
      });

      const rows = await plannerDb().select().from(taskLinks).where(eq(taskLinks.id, link.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
      });

      const events = await pool.query(
        `SELECT payload FROM core.events WHERE event_type = 'planner.task.link-added'`,
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].payload).toMatchObject({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
      });
    }));

  it('refuses a self-link with a sentence, before the CHECK ever fires', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const session = seeded.adminSession;
      const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
      const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
      const a = await createTask({ plan_id: plan.id, title: 'Alpha', session });

      await expect(
        linkTasks({ source_task_id: a.id, target_task_id: a.id, kind: 'relates', session }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    }));

  it('refuses linking TO a trashed task', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const session = seeded.adminSession;
      const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
      const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
      const a = await createTask({ plan_id: plan.id, title: 'Alpha', session });
      const b = await createTask({ plan_id: plan.id, title: 'Beta', session });
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

      // A member of group A only — no reach into group B.
      const member = await makeMemberSession(pool, {
        tenant_id: seeded.tenant_id,
        group_id: groupA.id,
        role: 'member',
      });

      await expect(
        linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session: member }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      expect(await plannerDb().select().from(taskLinks)).toHaveLength(0);
    }));

  it('refuses the inverse duplicates row with its own sentence', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const session = seeded.adminSession;
      const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
      const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
      const a = await createTask({ plan_id: plan.id, title: 'Alpha', session });
      const b = await createTask({ plan_id: plan.id, title: 'Beta', session });
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'duplicates', session });

      const err = await linkTasks({
        source_task_id: b.id,
        target_task_id: a.id,
        kind: 'duplicates',
        session,
      }).catch((e) => e);
      expect(err).toMatchObject({ code: 'DUPLICATE_LINK' });
      expect(err.message).toMatch(/other way round/i);
    }));

  // Not new behaviour — merge already refused a second duplicates row. It moves
  // into the domain so BOTH writers obey it, since planner_linkTasks can write
  // kind:'duplicates' without merging.
  it('refuses a second duplicates row out of the same source, naming the existing target', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const session = seeded.adminSession;
      const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
      const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
      const a = await createTask({ plan_id: plan.id, title: 'Alpha', session });
      const b = await createTask({ plan_id: plan.id, title: 'Beta', session });
      const c = await createTask({ plan_id: plan.id, title: 'Gamma', session });
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'duplicates', session });

      const err = await linkTasks({
        source_task_id: a.id,
        target_task_id: c.id,
        kind: 'duplicates',
        session,
      }).catch((e) => e);
      expect(err).toMatchObject({ code: 'DUPLICATE_LINK' });
      expect(err.details).toMatchObject({ target_task_id: b.id });
    }));

  it('turns the exact-duplicate 23505 into DUPLICATE_LINK', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const session = seeded.adminSession;
      const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
      const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
      const a = await createTask({ plan_id: plan.id, title: 'Alpha', session });
      const b = await createTask({ plan_id: plan.id, title: 'Beta', session });
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session });

      await expect(
        linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_LINK' });
    }));
});
