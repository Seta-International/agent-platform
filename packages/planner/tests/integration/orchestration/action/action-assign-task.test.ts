import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeActionTaskAssign } from '../../../../src/backend/orchestration/action/adapters.ts';
import { makeAssignTaskTool } from '../../../../src/backend/orchestration/action/assign-task.tool.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import { seedGroup, seedGroupMembers, seedTasksFixture } from './seed-tasks-fixture.ts';

function rc(tenantId: string, userId: string) {
  const requestContext = new RequestContext();
  requestContext.set('tenant_id', tenantId);
  requestContext.set('actor', { type: 'user', user_id: userId });
  return requestContext;
}

describe('action runtime — assign port', () => {
  it('reads the task with its current assignees and group', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, groupId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha'],
      });
      const snap = await makeActionTaskAssign().readForAssign({
        tenantId,
        actorUserId,
        taskId: tasks[0]!.taskId,
      });
      expect(snap).toMatchObject({ title: 'Alpha', groupId, assignees: [] });
    }));

  it('returns null for a task the actor cannot reach', () =>
    withAgentTestDb(async ({ pool }) => {
      const mine = await seedTasksFixture(pool, { titles: ['Alpha'] });
      const theirs = await seedTasksFixture(pool, { titles: ['Secret'] });
      const snap = await makeActionTaskAssign().readForAssign({
        tenantId: mine.tenantId,
        actorUserId: mine.actorUserId,
        taskId: theirs.tasks[0]!.taskId,
      });
      expect(snap).toBeNull();
    }));

  // D5, at the write layer. This is the assertion that would have caught the
  // spec's claim that AssignPort already replaces: it does not, and this port
  // must.
  it('REPLACES the assignee set rather than adding to it', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, groupId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha'],
      });
      const [b, c, a] = await seedGroupMembers(pool, { tenantId, groupId, count: 3 });
      const port = makeActionTaskAssign();
      const taskId = tasks[0]!.taskId;

      await port.assign({
        tenantId,
        actorUserId,
        taskId,
        assigneeUserIds: [b!, c!],
        idempotencyKey: 'k1',
      });
      await port.assign({
        tenantId,
        actorUserId,
        taskId,
        assigneeUserIds: [a!, c!],
        idempotencyKey: 'k2',
      });

      const rows = await pool.query<{ user_id: string }>(
        'SELECT user_id FROM planner.task_assignments WHERE task_id = $1',
        [taskId],
      );
      expect(rows.rows.map((r) => r.user_id).sort()).toEqual([a!, c!].sort());
    }));

  it('records the write as a gated `assign` mutation attributed to the agent', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, groupId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha'],
      });
      const [member] = await seedGroupMembers(pool, { tenantId, groupId, count: 1 });
      await makeActionTaskAssign().assign({
        tenantId,
        actorUserId,
        taskId: tasks[0]!.taskId,
        assigneeUserIds: [member!],
        idempotencyKey: 'assign-key-1',
      });

      const keys = await pool.query<{ mutation_kind: string }>(
        'SELECT mutation_kind FROM core.mutation_idempotency WHERE key = $1',
        ['assign-key-1'],
      );
      expect(keys.rows[0]!.mutation_kind).toBe('assign');

      const events = await pool.query<{ actor: Record<string, unknown> }>(
        `SELECT actor FROM core.events
          WHERE event_type = 'planner.task.assigned' AND aggregate_id = $1`,
        [tasks[0]!.taskId],
      );
      expect(events.rows[0]!.actor).toMatchObject({
        actor_kind: 'agent',
        on_behalf_of: actorUserId,
      });
    }));

  it('replays instead of assigning twice under the same key', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, groupId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha'],
      });
      const [member] = await seedGroupMembers(pool, { tenantId, groupId, count: 1 });
      const port = makeActionTaskAssign();
      const args = {
        tenantId,
        actorUserId,
        taskId: tasks[0]!.taskId,
        assigneeUserIds: [member!],
        idempotencyKey: 'same-key',
      };
      const first = await port.assign(args);
      const second = await port.assign(args);
      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
    }));

  it('finds a group member by name and returns nothing for a stranger', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, groupId } = await seedTasksFixture(pool, {
        titles: ['Alpha'],
      });
      const [member] = await seedGroupMembers(pool, {
        tenantId,
        groupId,
        count: 1,
        displayName: 'Tuan Nguyen',
      });
      const port = makeActionTaskAssign();

      const hit = await port.resolveMembers({
        tenantId,
        actorUserId,
        groupId,
        query: 'Tuan',
      });
      expect(hit).toEqual([{ userId: member!, name: 'Tuan Nguyen', inGroup: true }]);

      expect(
        await port.resolveMembers({ tenantId, actorUserId, groupId, query: 'Nobody' }),
      ).toEqual([]);
    }));
});

describe('planner_assignTask — through the tool, against a real database', () => {
  // §6.2 "assign replaces, never merges". The card promised `Trước: B, C → Sau:
  // A, C`; this proves the write keeps that promise.
  it('a task owned by B and C, confirmed with A and C, ends owned by exactly A and C', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, groupId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha'],
      });
      const [b, c, a] = await seedGroupMembers(pool, { tenantId, groupId, count: 3 });
      const taskId = tasks[0]!.taskId;
      const port = makeActionTaskAssign();
      await port.assign({
        tenantId,
        actorUserId,
        taskId,
        assigneeUserIds: [b!, c!],
        idempotencyKey: 'seed',
      });

      const tool = makeAssignTaskTool({
        ports: { taskAssign: port } as never,
        ctx: { tenantId, actorUserId } as never,
      });
      await tool.execute!(
        { taskRef: taskId, assigneeRefs: ['x'] } as never,
        {
          agent: {
            suspend: vi.fn(async () => {}),
            resumeData: {
              action: 'assign',
              taskId,
              assigneeUserIds: [a!, c!],
              idempotencyKey: 'confirm-1',
            },
          },
          requestContext: rc(tenantId, actorUserId),
        } as never,
      );

      const rows = await pool.query<{ user_id: string }>(
        'SELECT user_id FROM planner.task_assignments WHERE task_id = $1',
        [taskId],
      );
      expect(rows.rows.map((r) => r.user_id).sort()).toEqual([a!, c!].sort());
    }));

  it('an actor outside the group gets no card and writes nothing', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, tasks } = await seedTasksFixture(pool, { titles: ['Alpha'] });
      // Same tenant, DIFFERENT group — so what refuses is the assign gate on the
      // task's group, not tenant isolation and not a foreign-key error.
      const otherGroupId = await seedGroup(pool, { tenantId });
      const [outsider] = await seedGroupMembers(pool, {
        tenantId,
        groupId: otherGroupId,
        count: 1,
      });
      const tool = makeAssignTaskTool({
        ports: { taskAssign: makeActionTaskAssign() } as never,
        ctx: { tenantId, actorUserId: outsider! } as never,
      });
      const suspend = vi.fn(async () => {});
      const out = (await tool.execute!(
        { taskRef: tasks[0]!.taskId, assigneeRefs: ['Member 1'] } as never,
        {
          agent: { suspend, resumeData: undefined },
          requestContext: rc(tenantId, outsider!),
        } as never,
      ).catch(() => ({ assigned: false }))) as { assigned: boolean };
      expect(out.assigned).toBe(false);
      expect(suspend).not.toHaveBeenCalled();
      const rows = await pool.query('SELECT 1 FROM planner.task_assignments WHERE task_id = $1', [
        tasks[0]!.taskId,
      ]);
      expect(rows.rows).toHaveLength(0);
    }));
});
