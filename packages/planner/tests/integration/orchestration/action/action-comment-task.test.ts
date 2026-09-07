import { describe, expect, it } from 'vitest';
import { makeActionComment } from '../../../../src/backend/orchestration/action/adapters.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import { seedGroup, seedGroupMembers, seedTasksFixture } from './seed-tasks-fixture.ts';

describe('action runtime — comment port', () => {
  it('posts the comment and records it as a gated `comment` mutation by the agent', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, { titles: ['Alpha'] });
      const { commentId, replayed } = await makeActionComment().comment({
        tenantId,
        actorUserId,
        taskId: tasks[0]!.taskId,
        body: 'Blocked on the vendor key.',
        idempotencyKey: 'comment-key-1',
      });
      expect(replayed).toBe(false);

      const rows = await pool.query<{ body: string }>(
        'SELECT body FROM planner.task_comments WHERE id = $1',
        [commentId],
      );
      expect(rows.rows[0]!.body).toBe('Blocked on the vendor key.');

      const keys = await pool.query<{ mutation_kind: string }>(
        'SELECT mutation_kind FROM core.mutation_idempotency WHERE key = $1',
        ['comment-key-1'],
      );
      expect(keys.rows[0]!.mutation_kind).toBe('comment');

      const events = await pool.query<{ actor: Record<string, unknown> }>(
        `SELECT actor FROM core.events WHERE event_type = 'planner.comment.created'`,
      );
      expect(events.rows[0]!.actor).toMatchObject({
        actor_kind: 'agent',
        on_behalf_of: actorUserId,
      });
    }));

  // A retried confirm must not double-post. This is the whole reason the tool
  // goes through the gateway rather than calling createComment directly.
  it('replays instead of posting twice under the same key', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, { titles: ['Alpha'] });
      const port = makeActionComment();
      const args = {
        tenantId,
        actorUserId,
        taskId: tasks[0]!.taskId,
        body: 'Blocked on the vendor key.',
        idempotencyKey: 'same-key',
      };
      await port.comment(args);
      const second = await port.comment(args);
      expect(second.replayed).toBe(true);

      const rows = await pool.query('SELECT 1 FROM planner.task_comments WHERE task_id = $1', [
        tasks[0]!.taskId,
      ]);
      expect(rows.rows).toHaveLength(1);
    }));

  it('refuses an actor without comment permission on the group', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, groupId } = await seedTasksFixture(pool, { titles: ['Alpha'] });
      // A real second group in the SAME tenant: `group_members.group_id` is a
      // foreign key, so a bare randomUUID() fails the insert and the assertion
      // would pass on the wrong error.
      const otherGroupId = await seedGroup(pool, { tenantId });
      const [outsider] = await seedGroupMembers(pool, {
        tenantId,
        groupId: otherGroupId,
        count: 1,
      });
      await expect(
        makeActionComment().assertCanComment({ tenantId, actorUserId: outsider!, groupId }),
      ).rejects.toThrow();
    }));
});
