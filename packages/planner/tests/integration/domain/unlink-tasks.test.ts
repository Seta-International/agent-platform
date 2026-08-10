import { describe, expect, it } from 'vitest';
import { plannerDb, taskReferences } from '../../../src/backend/db/index.ts';
import { linkTasks } from '../../../src/backend/domain/link-tasks.ts';
import { unlinkTasks } from '../../../src/backend/domain/unlink-tasks.ts';
import {
  addTaskReference,
  createGroup,
  createPlan,
  createTask,
  deleteTask,
} from '../../../src/index.ts';
import { makeMemberSession, seedTenant } from '../../helpers.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

async function seedLinked(pool: Parameters<typeof seedTenant>[0]) {
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
  return { seeded, session, group, plan, a, b, link };
}

describe('unlinkTasks', () => {
  it('hard-deletes the row by reference id and emits link-removed', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, link } = await seedLinked(pool);

      await unlinkTasks({ reference_id: link.id, session });

      expect(await plannerDb().select().from(taskReferences)).toHaveLength(0);
      const events = await pool.query(
        `SELECT payload FROM core.events WHERE event_type = 'planner.task.link-removed'`,
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].payload).toMatchObject({ reference_id: link.id, kind: 'relates' });
    }));

  // The asymmetry with linkTasks, and it is load-bearing: merge trashes the
  // duplicate, so if unlink also demanded two live tasks the link a merge just
  // created would be permanently un-removable.
  it('still succeeds when one endpoint is in trash', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, b, link } = await seedLinked(pool);
      await deleteTask({ task_id: b.id, expected_version: b.version, session });

      await unlinkTasks({ reference_id: link.id, session });
      expect(await plannerDb().select().from(taskReferences)).toHaveLength(0);
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
      const member = await makeMemberSession(pool, {
        tenant_id: seeded.tenant_id,
        group_id: groupA.id,
        role: 'member',
      });

      await expect(unlinkTasks({ reference_id: link.id, session: member })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(await plannerDb().select().from(taskReferences)).toHaveLength(1);
    }));

  // §3.11 from this side: bookmarks are removed by removeTaskReference, which
  // gates ONE endpoint. Letting this route touch them would be the same hole in
  // the other direction.
  it('refuses a bookmark row — it is not a link', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, a } = await seedLinked(pool);
      const bookmark = await addTaskReference({
        task_id: a.id,
        url: 'https://example.test/spec',
        type: 'web',
        session,
      });

      await expect(unlinkTasks({ reference_id: bookmark.id, session })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(await plannerDb().select().from(taskReferences)).toHaveLength(2);
    }));
});
