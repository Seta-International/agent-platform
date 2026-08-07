import { describe, expect, it } from 'vitest';
import { plannerDb, taskLinks } from '../../../src/backend/db/index.ts';
import { linkTasks } from '../../../src/backend/domain/link-tasks.ts';
import { unlinkTasks } from '../../../src/backend/domain/unlink-tasks.ts';
import { createGroup, createPlan, createTask, deleteTask } from '../../../src/index.ts';
import { makeMemberSession, seedTenant } from '../../helpers.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

describe('unlinkTasks', () => {
  it('hard-deletes the row and emits link-removed — a link has no trash', () =>
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

      await unlinkTasks({ link_id: link.id, session });

      expect(await plannerDb().select().from(taskLinks)).toHaveLength(0);
      const events = await pool.query(
        `SELECT payload FROM core.events WHERE event_type = 'planner.task.link-removed'`,
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].payload).toMatchObject({ link_id: link.id });
    }));

  // The asymmetry with linkTasks, and it is load-bearing: merge trashes the
  // duplicate, so if unlink also demanded two live tasks the link a merge just
  // created would be permanently un-removable.
  it('still succeeds when one endpoint is in trash', () =>
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
        kind: 'duplicates',
        session,
      });
      await deleteTask({ task_id: a.id, expected_version: a.version, session });

      await unlinkTasks({ link_id: link.id, session });
      expect(await plannerDb().select().from(taskLinks)).toHaveLength(0);
    }));

  it('requires update on BOTH endpoints, evaluated against their CURRENT groups', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const admin = seeded.adminSession;
      const groupA = await createGroup({ tenant_id: seeded.tenant_id, name: 'A', session: admin });
      const groupB = await createGroup({ tenant_id: seeded.tenant_id, name: 'B', session: admin });
      const planA = await createPlan({ group_id: groupA.id, name: 'PA', session: admin });
      const planB = await createPlan({ group_id: groupB.id, name: 'PB', session: admin });
      const a = await createTask({ plan_id: planA.id, title: 'Alpha', session: admin });
      const b = await createTask({ plan_id: planB.id, title: 'Beta', session: admin });
      const link = await linkTasks({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
        session: admin,
      });

      // A member of group A only — no reach into group B.
      const member = await makeMemberSession(pool, {
        tenant_id: seeded.tenant_id,
        group_id: groupA.id,
        role: 'member',
      });

      await expect(unlinkTasks({ link_id: link.id, session: member })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(await plannerDb().select().from(taskLinks)).toHaveLength(1);
    }));

  it('404s an unknown link id', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      await expect(
        unlinkTasks({
          link_id: '00000000-0000-4000-8000-000000000000',
          session: seeded.adminSession,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }));
});
