import { describe, expect, it } from 'vitest';
import { makeActionTaskAssign } from '../../../../src/backend/orchestration/action/adapters.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import { seedGroupMembers, seedTasksFixture } from './seed-tasks-fixture.ts';

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
