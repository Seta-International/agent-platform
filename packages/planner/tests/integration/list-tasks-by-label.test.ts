import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  assignTask,
  createGroup,
  createPlan,
  createTask,
  listTasksByLabel,
  updateTask,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';
import { applyLabels } from './label-test-helpers.ts';

const withDb = (fn: Parameters<typeof withTestDb>[1]) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    fn,
  );

describe('listTasksByLabel', () => {
  it('returns only tasks whose labels contain the requested name', () =>
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
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: infra.id,
          applied_by: seeded.admin.user_id,
          names: ['infrastructure', 'devops'],
        });
        const frontend = await createTask({
          plan_id: plan.id,
          title: 'Build login page',
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: frontend.id,
          applied_by: seeded.admin.user_id,
          names: ['frontend'],
        });

        const { results } = await listTasksByLabel({
          names: ['infrastructure'],
          limit: 10,
          session,
        });

        expect(results.map((r) => r.taskId)).toEqual([infra.id]);
        expect(results[0]!.groupId).toBe(group.id);
        expect(results[0]!.labels).toContain('infrastructure');
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));

  it('ranks tasks matching more of the requested names first, then truncates to limit', () =>
    withDb(async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });

        // One-name matches created LAST so recency would surface them first if the
        // query ranked by updated_at — the overlap ranking must override that.
        const twoTagMatch = await createTask({
          plan_id: plan.id,
          title: 'Both tags',
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: twoTagMatch.id,
          applied_by: seeded.admin.user_id,
          names: ['infrastructure', 'devops'],
        });
        const oneTagA = await createTask({
          plan_id: plan.id,
          title: 'One tag A',
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: oneTagA.id,
          applied_by: seeded.admin.user_id,
          names: ['infrastructure'],
        });
        const oneTagB = await createTask({
          plan_id: plan.id,
          title: 'One tag B',
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: oneTagB.id,
          applied_by: seeded.admin.user_id,
          names: ['devops'],
        });

        const ranked = await listTasksByLabel({
          names: ['infrastructure', 'devops'],
          limit: 10,
          session,
        });
        // Two-name match ranks first; the two one-name matches follow.
        expect(ranked.results[0]!.taskId).toBe(twoTagMatch.id);
        expect(
          ranked.results
            .map((r) => r.taskId)
            .slice(1)
            .sort(),
        ).toEqual([oneTagA.id, oneTagB.id].sort());

        // "give me the single best match" keeps the most relevant, not the newest.
        const top1 = await listTasksByLabel({
          names: ['infrastructure', 'devops'],
          limit: 1,
          session,
        });
        expect(top1.results.map((r) => r.taskId)).toEqual([twoTagMatch.id]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));

  it('matches label names case-insensitively', () =>
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
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: t.id,
          applied_by: seeded.admin.user_id,
          names: ['Infrastructure'],
        });

        const { results } = await listTasksByLabel({
          names: ['infrastructure'],
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
          const task = await createTask({
            plan_id: plan.id,
            title: `Infra task ${i}`,
            session,
          });
          await applyLabels(pool, {
            tenant_id: seeded.tenant_id,
            plan_id: plan.id,
            task_id: task.id,
            applied_by: seeded.admin.user_id,
            names: ['infrastructure'],
          });
        }

        const a = await listTasksByLabel({ names: ['infrastructure'], limit: 10, session });
        const b = await listTasksByLabel({ names: ['infrastructure'], limit: 10, session });

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
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: notStarted.id,
          applied_by: seeded.admin.user_id,
          names: ['infrastructure'],
        });
        const inProgress = await createTask({
          plan_id: plan.id,
          title: 'In progress',
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: inProgress.id,
          applied_by: seeded.admin.user_id,
          names: ['infrastructure'],
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
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: completed.id,
          applied_by: seeded.admin.user_id,
          names: ['infrastructure'],
        });
        await updateTask({
          task_id: completed.id,
          expected_version: completed.version,
          patch: { percent_complete: 100 },
          session,
        });

        const open = await listTasksByLabel({
          names: ['infrastructure'],
          completionStatus: 'open',
          limit: 10,
          session,
        });
        expect(open.results.map((r) => r.taskId)).toEqual(
          expect.arrayContaining([notStarted.id, inProgress.id]),
        );
        expect(open.results).toHaveLength(2);

        const done = await listTasksByLabel({
          names: ['infrastructure'],
          completionStatus: 'completed',
          limit: 10,
          session,
        });
        expect(done.results.map((r) => r.taskId)).toEqual([completed.id]);
        expect(done.results[0]!.status).toBe('completed');

        const any = await listTasksByLabel({ names: ['infrastructure'], limit: 10, session });
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
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: t.id,
          applied_by: seeded.admin.user_id,
          names: ['infrastructure'],
        });
        await assignTask({ task_id: t.id, user_id: alice.user_id, session });

        const { results } = await listTasksByLabel({
          names: ['infrastructure'],
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
          session: admin,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: planA.id,
          task_id: taskA.id,
          applied_by: seeded.admin.user_id,
          names: ['infrastructure'],
        });
        const taskB = await createTask({
          plan_id: planB.id,
          title: 'Infra B',
          session: admin,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: planB.id,
          task_id: taskB.id,
          applied_by: seeded.admin.user_id,
          names: ['infrastructure'],
        });

        const scoped = buildSession({
          tenant_id: seeded.tenant_id,
          user_id: seeded.admin.user_id,
          roles: ['planner.contributor'],
          accessible_group_ids: [groupA.id],
        });

        const { results } = await listTasksByLabel({
          names: ['infrastructure'],
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
