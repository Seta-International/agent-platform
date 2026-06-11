import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  assignTask,
  createGroup,
  createPlan,
  createTask,
  listTasksBySkillTag,
  updateTask,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const withDb = (fn: Parameters<typeof withTestDb>[1]) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    fn,
  );

describe('listTasksBySkillTag', () => {
  it('returns only tasks whose skill_tags contain the requested tag', () =>
    withDb(async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });

        const infra = await createTask({
          plan_id: plan.id,
          title: 'Provision cluster',
          skill_tags: ['infrastructure', 'devops'],
          session,
        });
        await createTask({
          plan_id: plan.id,
          title: 'Build login page',
          skill_tags: ['frontend'],
          session,
        });

        const { results } = await listTasksBySkillTag({
          tags: ['infrastructure'],
          limit: 10,
          session,
        });

        expect(results.map((r) => r.taskId)).toEqual([infra.id]);
        expect(results[0]!.groupId).toBe(group.id);
        expect(results[0]!.skillTags).toContain('infrastructure');
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));

  it('ranks tasks matching more of the requested tags first, then truncates to limit', () =>
    withDb(async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });

        // One-tag matches created LAST so recency would surface them first if the
        // query ranked by updated_at — the overlap ranking must override that.
        const twoTagMatch = await createTask({
          plan_id: plan.id,
          title: 'Both tags',
          skill_tags: ['infrastructure', 'devops'],
          session,
        });
        const oneTagA = await createTask({
          plan_id: plan.id,
          title: 'One tag A',
          skill_tags: ['infrastructure'],
          session,
        });
        const oneTagB = await createTask({
          plan_id: plan.id,
          title: 'One tag B',
          skill_tags: ['devops'],
          session,
        });

        const ranked = await listTasksBySkillTag({
          tags: ['infrastructure', 'devops'],
          limit: 10,
          session,
        });
        // Two-tag match ranks first; the two one-tag matches follow.
        expect(ranked.results[0]!.taskId).toBe(twoTagMatch.id);
        expect(
          ranked.results
            .map((r) => r.taskId)
            .slice(1)
            .sort(),
        ).toEqual([oneTagA.id, oneTagB.id].sort());

        // "give me the single best match" keeps the most relevant, not the newest.
        const top1 = await listTasksBySkillTag({
          tags: ['infrastructure', 'devops'],
          limit: 1,
          session,
        });
        expect(top1.results.map((r) => r.taskId)).toEqual([twoTagMatch.id]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));

  it('matches tags case-insensitively', () =>
    withDb(async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
        const t = await createTask({
          plan_id: plan.id,
          title: 'Capitalized tag',
          skill_tags: ['Infrastructure'],
          session,
        });

        const { results } = await listTasksBySkillTag({
          tags: ['infrastructure'],
          limit: 10,
          session,
        });

        expect(results.map((r) => r.taskId)).toEqual([t.id]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));

  it('is deterministic: same query twice yields identical ordered results', () =>
    withDb(async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
        for (let i = 0; i < 5; i++) {
          await createTask({
            plan_id: plan.id,
            title: `Infra task ${i}`,
            skill_tags: ['infrastructure'],
            session,
          });
        }

        const a = await listTasksBySkillTag({ tags: ['infrastructure'], limit: 10, session });
        const b = await listTasksBySkillTag({ tags: ['infrastructure'], limit: 10, session });

        expect(a.results.map((r) => r.taskId)).toEqual(b.results.map((r) => r.taskId));
        expect(a.results).toHaveLength(5);
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));

  it('maps status by exact percent_complete', () =>
    withDb(async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });

        const notStarted = await createTask({
          plan_id: plan.id,
          title: 'Not started',
          skill_tags: ['infrastructure'],
          session,
        });
        const inProgress = await createTask({
          plan_id: plan.id,
          title: 'In progress',
          skill_tags: ['infrastructure'],
          session,
        });
        await updateTask({
          task_id: inProgress.id,
          expected_version: inProgress.version,
          patch: { percent_complete: 50 },
          session,
        });
        const completed = await createTask({
          plan_id: plan.id,
          title: 'Completed',
          skill_tags: ['infrastructure'],
          session,
        });
        await updateTask({
          task_id: completed.id,
          expected_version: completed.version,
          patch: { percent_complete: 100 },
          session,
        });

        const open = await listTasksBySkillTag({
          tags: ['infrastructure'],
          completionStatus: 'open',
          limit: 10,
          session,
        });
        expect(open.results.map((r) => r.taskId)).toEqual(
          expect.arrayContaining([notStarted.id, inProgress.id]),
        );
        expect(open.results).toHaveLength(2);

        const done = await listTasksBySkillTag({
          tags: ['infrastructure'],
          completionStatus: 'completed',
          limit: 10,
          session,
        });
        expect(done.results.map((r) => r.taskId)).toEqual([completed.id]);
        expect(done.results[0]!.status).toBe('completed');

        const any = await listTasksBySkillTag({ tags: ['infrastructure'], limit: 10, session });
        expect(any.results).toHaveLength(3);
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));

  it('aggregates assignee user ids', () =>
    withDb(async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [{ name: 'Alice', email: 'alice@example.test' }],
        });
        const session = seeded.adminSession;
        const alice = seeded.users[0]!;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
        const t = await createTask({
          plan_id: plan.id,
          title: 'Assigned infra task',
          skill_tags: ['infrastructure'],
          session,
        });
        await assignTask({ task_id: t.id, user_id: alice.user_id, session });

        const { results } = await listTasksBySkillTag({
          tags: ['infrastructure'],
          limit: 10,
          session,
        });
        expect(results[0]!.assigneeUserIds).toContain(alice.user_id);
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));

  it('restricts to groups the session can access (non-admin)', () =>
    withDb(async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const admin = seeded.adminSession;
        const groupA = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'A',
          session: admin,
        });
        const groupB = await createGroup({
          tenant_id: seeded.tenant_id,
          name: 'B',
          session: admin,
        });
        const planA = await createPlan({ group_id: groupA.id, name: 'PA', session: admin });
        const planB = await createPlan({ group_id: groupB.id, name: 'PB', session: admin });
        const taskA = await createTask({
          plan_id: planA.id,
          title: 'Infra A',
          skill_tags: ['infrastructure'],
          session: admin,
        });
        await createTask({
          plan_id: planB.id,
          title: 'Infra B',
          skill_tags: ['infrastructure'],
          session: admin,
        });

        const scoped = buildSession({
          tenant_id: seeded.tenant_id,
          user_id: seeded.admin.user_id,
          roles: ['planner.contributor'],
          accessible_group_ids: [groupA.id],
        });

        const { results } = await listTasksBySkillTag({
          tags: ['infrastructure'],
          limit: 10,
          session: scoped,
        });
        expect(results.map((r) => r.taskId)).toEqual([taskA.id]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));
});
