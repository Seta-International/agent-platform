import { faker } from '@faker-js/faker';
import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import {
  addChecklistItem,
  assignTask,
  createBucket,
  createComment,
  createGroup,
  createPlan,
  createTask,
} from '@seta/planner';
import { linkPlannerGroup } from '@seta/pm';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import type { ProjectRec } from './load.ts';

const log = pino({ name: 'cli/seed-fixture/planner' });

const BUCKETS = ['To Do', 'In Progress', 'In Review', 'Done'] as const;
const DONE_BUCKET_IDX = 3;
const PCT_OPTIONS = [0, 0, 50] as const;

async function existingGroupId(tenantId: string, name: string): Promise<string | undefined> {
  const r = await coreDb().execute(
    sql`SELECT id FROM planner.groups WHERE tenant_id = ${tenantId} AND name = ${name} AND deleted_at IS NULL LIMIT 1`,
  );
  return (r.rows[0] as { id: string } | undefined)?.id;
}

export async function seedPlanner(
  session: SessionScope,
  projects: ProjectRec[],
  people: Map<string, { workerId: string; userId: string }>,
  membersByCode: Map<string, string[]>,
  projectByCode: Map<string, string>,
  // Real board structure (group per project, plan, buckets, PM→planner link) is always seeded.
  // Faker tasks/checklists/comments are demo-only so the default seed carries no mock work items.
  demo = false,
): Promise<void> {
  faker.seed(20260521);

  let groupsCreated = 0;
  let tasksCreated = 0;
  let assignmentsCreated = 0;

  for (const p of projects) {
    const pid = projectByCode.get(p.code);
    if (!pid) {
      log.debug({ code: p.code }, 'planner: no project_id for code, skipping');
      continue;
    }

    const groupName = `${p.project_name} Team`;

    // Idempotency: skip entire project if group already exists
    const existingId = await existingGroupId(session.tenant_id, groupName);
    if (existingId) {
      log.debug({ groupName }, 'planner: group already exists, skipping');
      continue;
    }

    const employeeIds = membersByCode.get(p.code) ?? [];
    const memberUserIds = [
      ...new Set(
        employeeIds
          .map((eid) => people.get(eid)?.userId)
          .filter((uid): uid is string => uid !== undefined),
      ),
    ];

    const group = await createGroup({
      tenant_id: session.tenant_id,
      name: groupName,
      description: `Delivery workspace for ${p.project_name}`,
      initial_members: memberUserIds.map((user_id) => ({ user_id, role: 'member' as const })),
      session,
    });
    groupsCreated++;

    await linkPlannerGroup({ project_id: pid, planner_group_id: group.id, session });

    const plan = await createPlan({ group_id: group.id, name: `${p.project_name} Board`, session });

    const bucketIds: string[] = [];
    for (const bucketName of BUCKETS) {
      const bucket = await createBucket({ plan_id: plan.id, name: bucketName, session });
      bucketIds.push(bucket.id);
    }

    const taskCount = demo ? faker.number.int({ min: 8, max: 15 }) : 0;
    for (let i = 0; i < taskCount; i++) {
      const bucketIdx = faker.number.int({ min: 0, max: 3 });
      const bucketId = bucketIds[bucketIdx] as string;
      const isDone = bucketIdx === DONE_BUCKET_IDX;
      const pct: 0 | 50 | 100 = isDone ? 100 : faker.helpers.arrayElement(PCT_OPTIONS);
      const dueAt = faker.date.between({ from: '2026-05-01', to: '2026-08-31' }).toISOString();
      const isDeferred = faker.datatype.boolean({ probability: 0.1 });

      const task = await createTask({
        plan_id: plan.id,
        bucket_id: bucketId,
        title: faker.hacker.phrase(),
        description: faker.lorem.sentence(),
        percent_complete: pct,
        is_deferred: isDeferred,
        due_at: dueAt,
        session,
      });
      tasksCreated++;

      if (memberUserIds.length > 0) {
        const assignee = faker.helpers.arrayElement(memberUserIds);
        await assignTask({ task_id: task.id, user_id: assignee, session });
        assignmentsCreated++;
      }

      if (faker.datatype.boolean({ probability: 0.3 })) {
        await addChecklistItem({
          task_id: task.id,
          label: faker.lorem.words(3),
          session,
        });
      }

      if (faker.datatype.boolean({ probability: 0.15 })) {
        await createComment({
          task_id: task.id,
          body: faker.lorem.sentence(),
          session,
        });
      }
    }

    log.info(
      { project: p.project_name, group_id: group.id, tasks: taskCount },
      'planner: project board seeded',
    );
  }

  log.info({ groupsCreated, tasksCreated, assignmentsCreated }, 'phase-planner done');
}
