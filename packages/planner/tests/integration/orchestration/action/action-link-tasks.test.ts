import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeActionTaskLink } from '../../../../src/backend/orchestration/action/adapters.ts';
import { makeLinkTasksTool } from '../../../../src/backend/orchestration/action/link-tasks.tool.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import { seedTasksFixture } from './seed-tasks-fixture.ts';

function rc(tenantId: string, userId: string) {
  const requestContext = new RequestContext();
  requestContext.set('tenant_id', tenantId);
  requestContext.set('actor', { type: 'user', user_id: userId });
  return requestContext;
}

describe('action runtime — link port', () => {
  it('reads an endpoint the actor can see', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, groupId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha'],
      });
      const snap = await makeActionTaskLink().readEndpoint({
        tenantId,
        actorUserId,
        taskId: tasks[0]!.taskId,
      });
      expect(snap).toMatchObject({ title: 'Alpha', groupId });
    }));

  // AC3. Both a task that does not exist and one the actor may not read yield
  // the SAME null, so the tool's refusal sentence cannot differ.
  it('returns null for an absent task', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId } = await seedTasksFixture(pool, { titles: ['Alpha'] });
      const snap = await makeActionTaskLink().readEndpoint({
        tenantId,
        actorUserId,
        taskId: '00000000-0000-4000-8000-000000000000',
      });
      expect(snap).toBeNull();
    }));

  it('returns null — not FORBIDDEN — for a task the actor cannot reach', () =>
    withAgentTestDb(async ({ pool }) => {
      const mine = await seedTasksFixture(pool, { titles: ['Alpha'] });
      const theirs = await seedTasksFixture(pool, { titles: ['Secret'] });
      const snap = await makeActionTaskLink().readEndpoint({
        tenantId: mine.tenantId,
        actorUserId: mine.actorUserId,
        taskId: theirs.tasks[0]!.taskId,
      });
      expect(snap).toBeNull();
    }));

  it('writes one gated link row and records the key as `link`', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha', 'Beta'],
      });
      const out = await makeActionTaskLink().link({
        tenantId,
        actorUserId,
        sourceTaskId: tasks[0]!.taskId,
        targetTaskId: tasks[1]!.taskId,
        kind: 'relates',
        idempotencyKey: 'link-key-1',
      });
      expect(out.replayed).toBe(false);

      const rows = await pool.query(
        'SELECT kind FROM planner.task_links WHERE source_task_id = $1',
        [tasks[0]!.taskId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].kind).toBe('relates');

      const keys = await pool.query(
        'SELECT mutation_kind FROM core.mutation_idempotency WHERE key = $1',
        ['link-key-1'],
      );
      expect(keys.rows[0].mutation_kind).toBe('link');

      const events = await pool.query(
        `SELECT actor FROM core.events WHERE event_type = 'planner.task.link-added'`,
      );
      expect(events.rows[0].actor).toMatchObject({
        actor_kind: 'agent',
        on_behalf_of: actorUserId,
      });
    }));

  it('reports an existing link in either direction', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha', 'Beta'],
      });
      const port = makeActionTaskLink();
      const args = {
        tenantId,
        actorUserId,
        sourceTaskId: tasks[0]!.taskId,
        targetTaskId: tasks[1]!.taskId,
        kind: 'relates' as const,
      };
      expect(await port.linkExists(args)).toBe(false);
      await port.link({ ...args, idempotencyKey: 'k' });
      expect(await port.linkExists(args)).toBe(true);
      // The pair index treats the two directions as one fact.
      expect(
        await port.linkExists({
          ...args,
          sourceTaskId: args.targetTaskId,
          targetTaskId: args.sourceTaskId,
        }),
      ).toBe(true);
    }));
});

describe('planner_linkTasks — the two-endpoint gate, through the tool', () => {
  it('refuses when the actor cannot reach the target, and writes nothing', () =>
    withAgentTestDb(async ({ pool }) => {
      // Two tenants: the actor cannot reach the second at all, which is the
      // strongest form of "cannot update the target group".
      const mine = await seedTasksFixture(pool, { titles: ['Alpha'] });
      const theirs = await seedTasksFixture(pool, { titles: ['Secret'] });

      const tool = makeLinkTasksTool({
        ports: { taskLink: makeActionTaskLink() } as never,
        ctx: { tenantId: mine.tenantId, actorUserId: mine.actorUserId } as never,
      });
      const suspend = vi.fn(async () => {});
      const out = (await tool.execute!(
        {
          sourceTaskRef: mine.tasks[0]!.taskId,
          targetTaskRef: theirs.tasks[0]!.taskId,
          kind: 'relates',
        } as never,
        {
          agent: { suspend, resumeData: undefined },
          requestContext: rc(mine.tenantId, mine.actorUserId),
        } as never,
      )) as { linked: boolean; refusal?: string | null };

      expect(out.linked).toBe(false);
      expect(suspend).not.toHaveBeenCalled();
      const rows = await pool.query('SELECT 1 FROM planner.task_links');
      expect(rows.rows).toHaveLength(0);
    }));

  // AC3, at the integration level: the two refusals must have the SAME SHAPE and
  // neither may mention access.
  it('gives an identically-shaped refusal for an unreadable target and an absent one', () =>
    withAgentTestDb(async ({ pool }) => {
      const mine = await seedTasksFixture(pool, { titles: ['Alpha'] });
      const theirs = await seedTasksFixture(pool, { titles: ['Secret'] });
      const absentId = '00000000-0000-4000-8000-000000000000';

      const tool = makeLinkTasksTool({
        ports: { taskLink: makeActionTaskLink() } as never,
        ctx: { tenantId: mine.tenantId, actorUserId: mine.actorUserId } as never,
      });
      const run = (targetRef: string) =>
        tool.execute!(
          {
            sourceTaskRef: mine.tasks[0]!.taskId,
            targetTaskRef: targetRef,
            kind: 'relates',
          } as never,
          {
            agent: { suspend: vi.fn(async () => {}), resumeData: undefined },
            requestContext: rc(mine.tenantId, mine.actorUserId),
          } as never,
        ) as Promise<{ refusal?: string | null }>;

      const unreadable = await run(theirs.tasks[0]!.taskId);
      const absent = await run(absentId);
      expect(unreadable.refusal).toBe(`I can't find a task called "${theirs.tasks[0]!.taskId}".`);
      expect(absent.refusal).toBe(`I can't find a task called "${absentId}".`);
      expect(unreadable.refusal).not.toMatch(/access|permission|forbidden/i);
    }));
});
