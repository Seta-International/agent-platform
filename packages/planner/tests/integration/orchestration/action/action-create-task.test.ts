import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeActionTaskCreate } from '../../../../src/backend/orchestration/action/adapters.ts';
import { makeCreateTaskTool } from '../../../../src/backend/orchestration/action/create-task.tool.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import { seedGroup, seedGroupMembers, seedTasksFixture } from './seed-tasks-fixture.ts';

function rc(tenantId: string, userId: string) {
  const requestContext = new RequestContext();
  requestContext.set('tenant_id', tenantId);
  requestContext.set('actor', { type: 'user', user_id: userId });
  return requestContext;
}

/** The real create port, with the vector search stubbed out: pgvector needs a
 *  live embedding provider, and none of these tests are about similarity. */
function toolFor(tenantId: string, actorUserId: string) {
  return makeCreateTaskTool({
    ports: {
      taskCreate: makeActionTaskCreate(),
      similarTasks: { search: async () => [] },
    } as never,
    ctx: { tenantId, actorUserId } as never,
  });
}

describe('action runtime — create port', () => {
  it('resolves a plan by its exact name to a plan and a group', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, groupId, planId, planName } = await seedTasksFixture(pool, {
        titles: [],
      });
      const hit = await makeActionTaskCreate().resolvePlan({
        tenantId,
        actorUserId,
        planRef: planName,
      });
      expect(hit).toEqual({ planId, groupId, planName });
    }));

  it('resolves a plan by UUID', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, planId, planName } = await seedTasksFixture(pool, {
        titles: [],
      });
      const hit = await makeActionTaskCreate().resolvePlan({
        tenantId,
        actorUserId,
        planRef: planId,
      });
      expect(hit).toMatchObject({ planId, planName });
    }));

  // Two plans of the same name is a question, not a guess: the tool turns this
  // shape into a sentence naming both.
  it('reports ambiguity instead of picking one', () =>
    withAgentTestDb(async ({ pool }) => {
      const a = await seedTasksFixture(pool, { titles: [], planName: 'Sprint 32' });
      await seedTasksFixture(pool, {
        titles: [],
        planName: 'Sprint 32',
        tenantId: a.tenantId,
        actorUserId: a.actorUserId,
      });
      const hit = await makeActionTaskCreate().resolvePlan({
        tenantId: a.tenantId,
        actorUserId: a.actorUserId,
        planRef: 'Sprint 32',
      });
      expect(hit).toHaveProperty('ambiguous');
      expect((hit as { ambiguous: unknown[] }).ambiguous).toHaveLength(2);
    }));

  it('returns null for a plan in another tenant', () =>
    withAgentTestDb(async ({ pool }) => {
      const mine = await seedTasksFixture(pool, { titles: [] });
      const theirs = await seedTasksFixture(pool, { titles: [], planName: 'Secret plan' });
      expect(
        await makeActionTaskCreate().resolvePlan({
          tenantId: mine.tenantId,
          actorUserId: mine.actorUserId,
          planRef: theirs.planId,
        }),
      ).toBeNull();
    }));

  // The plan board renders its columns from `buckets`, so a task with a null
  // bucket_id has no column to appear in. The server picks the column rather
  // than leaving a field the LLM never sees to decide whether the user can see
  // their own task.
  it("resolves the plan's first bucket by order_hint", () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, planId } = await seedTasksFixture(pool, { titles: [] });
      // The fixture's bucket has NO order_hint, and listBuckets orders
      // `order_hint NULLS LAST` — so a bucket that HAS one sorts ahead of it.
      const firstId = randomUUID();
      await pool.query(
        `INSERT INTO planner.buckets (id, tenant_id, plan_id, name, order_hint, external_source, created_by)
         VALUES ($1, $2, $3, 'To do', '0100', 'native', $4)`,
        [firstId, tenantId, planId, actorUserId],
      );
      expect(
        await makeActionTaskCreate().resolveDefaultBucket({ tenantId, actorUserId, planId }),
      ).toEqual({ bucketId: firstId, bucketName: 'To do' });
    }));

  it('resolves no bucket when every bucket in the plan is deleted', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, planId, bucketId } = await seedTasksFixture(pool, {
        titles: [],
      });
      await pool.query('UPDATE planner.buckets SET deleted_at = now() WHERE id = $1', [bucketId]);
      expect(
        await makeActionTaskCreate().resolveDefaultBucket({ tenantId, actorUserId, planId }),
      ).toBeNull();
    }));

  it('creates the task and applies its labels in ONE gated transaction', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, planId, bucketId } = await seedTasksFixture(pool, {
        titles: [],
      });
      const { taskId, replayed } = await makeActionTaskCreate().create({
        tenantId,
        actorUserId,
        planId,
        bucketId,
        draft: { title: 'Deploy hiring screen', priority: 'urgent', labels: ['infra'] },
        idempotencyKey: 'create-key-1',
      });
      expect(replayed).toBe(false);

      const task = await pool.query<{ title: string; bucket_id: string | null }>(
        'SELECT title, bucket_id FROM planner.tasks WHERE id = $1',
        [taskId],
      );
      expect(task.rows[0]!.title).toBe('Deploy hiring screen');
      // The column the board needs. Null here is the reported bug.
      expect(task.rows[0]!.bucket_id).toBe(bucketId);

      const labelled = await pool.query('SELECT 1 FROM planner.task_labels WHERE task_id = $1', [
        taskId,
      ]);
      expect(labelled.rows).toHaveLength(1);

      const keys = await pool.query<{ mutation_kind: string }>(
        'SELECT mutation_kind FROM core.mutation_idempotency WHERE key = $1',
        ['create-key-1'],
      );
      expect(keys.rows[0]!.mutation_kind).toBe('create');

      const events = await pool.query<{ actor: Record<string, unknown> }>(
        `SELECT actor FROM core.events WHERE event_type = 'planner.task.created'`,
      );
      expect(events.rows[0]!.actor).toMatchObject({
        actor_kind: 'agent',
        on_behalf_of: actorUserId,
      });
    }));

  // The property that makes a double-confirm harmless: the SECOND call must not
  // produce a second task.
  it('replays instead of creating twice under the same key', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, planId, bucketId } = await seedTasksFixture(pool, {
        titles: [],
      });
      const port = makeActionTaskCreate();
      const args = {
        tenantId,
        actorUserId,
        planId,
        bucketId,
        draft: { title: 'Deploy hiring screen' },
        idempotencyKey: 'same-key',
      };
      const first = await port.create(args);
      const second = await port.create(args);
      expect(second.replayed).toBe(true);
      expect(second.taskId).toBe(first.taskId);

      const rows = await pool.query(
        'SELECT 1 FROM planner.tasks WHERE plan_id = $1 AND deleted_at IS NULL',
        [planId],
      );
      expect(rows.rows).toHaveLength(1);
    }));

  it("refuses an actor without create permission on the plan's group", () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, groupId } = await seedTasksFixture(pool, { titles: [] });
      // A real second group in the SAME tenant. `group_members.group_id` is a
      // foreign key, so a bare randomUUID() fails the insert and the assertion
      // would pass on the wrong error.
      const otherGroupId = await seedGroup(pool, { tenantId });
      const [outsider] = await seedGroupMembers(pool, {
        tenantId,
        groupId: otherGroupId,
        count: 1,
      });
      await expect(
        makeActionTaskCreate().assertCanCreate({
          tenantId,
          actorUserId: outsider!,
          groupId,
        }),
      ).rejects.toThrow();
    }));
});

describe('planner_createTask — through the tool, against a real database', () => {
  // AC1, end to end: the first pass must leave the database exactly as it found
  // it. Everything else in this plan is arrangement; this is the promise.
  it('the preview pass writes no task and no idempotency row', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, planId, planName } = await seedTasksFixture(pool, {
        titles: [],
      });
      const suspend = vi.fn(async () => {});
      await toolFor(tenantId, actorUserId).execute!(
        { planRef: planName, title: 'Deploy hiring screen' } as never,
        {
          agent: { suspend, resumeData: undefined },
          requestContext: rc(tenantId, actorUserId),
        } as never,
      );

      expect(suspend).toHaveBeenCalledTimes(1);
      const tasks = await pool.query('SELECT 1 FROM planner.tasks WHERE plan_id = $1', [planId]);
      expect(tasks.rows).toHaveLength(0);
      const keys = await pool.query('SELECT 1 FROM core.mutation_idempotency');
      expect(keys.rows).toHaveLength(0);
    }));

  it('confirming creates the task; declining afterwards leaves it alone', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, planId, planName, bucketId } = await seedTasksFixture(pool, {
        titles: [],
      });
      const tool = toolFor(tenantId, actorUserId);

      await tool.execute!(
        { planRef: planName, title: 'ignored' } as never,
        {
          agent: {
            suspend: vi.fn(async () => {}),
            resumeData: {
              action: 'create',
              planId,
              bucketId,
              draft: { title: 'Deploy hiring screen', labels: ['infra'] },
              idempotencyKey: 'confirm-1',
            },
          },
          requestContext: rc(tenantId, actorUserId),
        } as never,
      );

      const created = await pool.query<{ id: string; title: string; bucket_id: string | null }>(
        'SELECT id, title, bucket_id FROM planner.tasks WHERE plan_id = $1 AND deleted_at IS NULL',
        [planId],
      );
      expect(created.rows).toHaveLength(1);
      expect(created.rows[0]!.title).toBe('Deploy hiring screen');
      // The regression pin for the reported bug: a task created through chat
      // must land in a column, or the plan board cannot render it at all.
      expect(created.rows[0]!.bucket_id).toBe(bucketId);

      await tool.execute!(
        { planRef: planName, title: 'ignored' } as never,
        {
          agent: {
            suspend: vi.fn(async () => {}),
            resumeData: { action: 'decline', idempotencyKey: 'decline-1' },
          },
          requestContext: rc(tenantId, actorUserId),
        } as never,
      );

      const after = await pool.query(
        'SELECT 1 FROM planner.tasks WHERE plan_id = $1 AND deleted_at IS NULL',
        [planId],
      );
      expect(after.rows).toHaveLength(1);
    }));

  it('use_existing writes nothing at all', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, planId, planName } = await seedTasksFixture(pool, {
        titles: ['Deploy hiring screen v2'],
      });
      const tool = toolFor(tenantId, actorUserId);
      await tool.execute!(
        { planRef: planName, title: 'ignored' } as never,
        {
          agent: {
            suspend: vi.fn(async () => {}),
            resumeData: { action: 'use_existing', existingTaskId: 'x', idempotencyKey: 'k' },
          },
          requestContext: rc(tenantId, actorUserId),
        } as never,
      );

      const tasks = await pool.query('SELECT 1 FROM planner.tasks WHERE plan_id = $1', [planId]);
      expect(tasks.rows).toHaveLength(1); // the seeded one, and only it
      const keys = await pool.query('SELECT 1 FROM core.mutation_idempotency');
      expect(keys.rows).toHaveLength(0);
    }));
});
