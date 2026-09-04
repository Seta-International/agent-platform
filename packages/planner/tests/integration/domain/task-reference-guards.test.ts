import { describe, expect, it } from 'vitest';
import { plannerDb, taskReferences } from '../../../src/backend/db/index.ts';
import { linkTasks } from '../../../src/backend/domain/link-tasks.ts';
import {
  addTaskReference,
  createGroup,
  createPlan,
  createTask,
  removeTaskReference,
} from '../../../src/index.ts';
import { seedTenant } from '../../helpers.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

async function seed(pool: Parameters<typeof seedTenant>[0]) {
  const seeded = await seedTenant(pool);
  const session = seeded.adminSession;
  const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
  const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
  const a = await createTask({ plan_id: plan.id, title: 'Alpha', session });
  const b = await createTask({ plan_id: plan.id, title: 'Beta', session });
  return { session, a, b };
}

// Spec §6.2 test 18.
describe('the bookmark writers cannot touch link rows', () => {
  it('refuses addTaskReference with a link kind', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, a, b } = await seed(pool);
      await expect(
        addTaskReference({
          task_id: a.id,
          url: `/planner/tasks/${b.id}`,
          // Unrepresentable in AddTaskReferenceInput — the HTTP body is parsed at
          // runtime, which is why the domain check exists as well.
          type: 'relates' as never,
          session,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await plannerDb().select().from(taskReferences)).toHaveLength(0);
    }));

  // Refusing the KIND alone is not enough: this row would show up nowhere as a
  // link, then collide on UNIQUE (tenant_id, task_id, url) and refuse the
  // GENUINE link (§3.11).
  it('refuses addTaskReference with a canonical task url, whatever the kind', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, a, b } = await seed(pool);
      await expect(
        addTaskReference({
          task_id: a.id,
          url: `/planner/tasks/${b.id}`,
          type: 'link',
          session,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await plannerDb().select().from(taskReferences)).toHaveLength(0);
    }));

  it('refuses removeTaskReference on a link row, and leaves it in place', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, a, b } = await seed(pool);
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session });

      await expect(
        removeTaskReference({ task_id: a.id, url: `/planner/tasks/${b.id}`, session }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await plannerDb().select().from(taskReferences)).toHaveLength(1);
    }));

  it('still adds and removes an ordinary bookmark', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, a } = await seed(pool);
      await addTaskReference({
        task_id: a.id,
        url: 'https://example.test/spec',
        type: 'web',
        session,
      });
      await removeTaskReference({ task_id: a.id, url: 'https://example.test/spec', session });
      expect(await plannerDb().select().from(taskReferences)).toHaveLength(0);
    }));
});
