import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mastra/core/request-context';
import {
  makeActionComment,
  makeActionTaskAssign,
  makeActionTaskCreate,
  makeActionTaskLink,
  makeActionTaskMerge,
  makeActionTaskRead,
  makeActionTaskUpdate,
} from '../../../../src/backend/orchestration/action/adapters.ts';
import { makeAssignTaskTool } from '../../../../src/backend/orchestration/action/assign-task.tool.ts';
import { makeCommentTaskTool } from '../../../../src/backend/orchestration/action/comment-task.tool.ts';
import { makeCreateTaskTool } from '../../../../src/backend/orchestration/action/create-task.tool.ts';
import { makeLinkTasksTool } from '../../../../src/backend/orchestration/action/link-tasks.tool.ts';
import { makeMergeTasksTool } from '../../../../src/backend/orchestration/action/merge-tasks.tool.ts';
import type { ActionPorts } from '../../../../src/backend/orchestration/action/ports.ts';
import { makeUpdateTaskTool } from '../../../../src/backend/orchestration/action/update-task.tool.ts';
import { type MatrixScope, type MatrixWorld, targetFor } from './matrix-actors.ts';

export type MatrixOp =
  | 'create'
  | 'update'
  | 'bulk-update'
  | 'link'
  | 'merge'
  | 'assign'
  | 'comment';

export const MATRIX_OPS: MatrixOp[] = [
  'create',
  'update',
  'bulk-update',
  'link',
  'merge',
  'assign',
  'comment',
];

export function rcFor(tenantId: string, userId: string): RequestContext {
  const rc = new RequestContext();
  rc.set('tenant_id', tenantId);
  rc.set('actor', { type: 'user', user_id: userId });
  return rc;
}

/**
 * The REAL adapters, so a cell exercises the permission story the product has.
 *
 * `similarTasks` is the one stub: the real one needs an embedder, and an empty
 * similar-list changes nothing about who may create a task.
 */
function realPorts(): ActionPorts {
  return {
    taskRead: makeActionTaskRead(),
    taskUpdate: makeActionTaskUpdate(),
    taskLink: makeActionTaskLink(),
    taskMerge: makeActionTaskMerge(),
    taskAssign: makeActionTaskAssign(),
    taskCreate: makeActionTaskCreate(),
    similarTasks: { search: async () => [] },
    comment: makeActionComment(),
  };
}

interface ToolArgs {
  world: MatrixWorld;
  actorUserId: string;
  scope: MatrixScope;
  suspend: () => Promise<void>;
}
interface PortArgs {
  world: MatrixWorld;
  actorUserId: string;
  scope: MatrixScope;
}

export interface OperationRunners {
  /** Layer 1 — the tool's FIRST pass, with suspend stubbed. */
  viaTool(args: ToolArgs): Promise<unknown>;
  /** Layer 2 — the port's own gate, called directly. */
  viaPort(args: PortArgs): Promise<unknown>;
}

/** The deps every tool takes, built per cell so the ctx carries this actor. */
function toolDeps(world: MatrixWorld, actorUserId: string) {
  return {
    ports: realPorts(),
    ctx: { tenantId: world.tenantId, actorUserId } as never,
  };
}

/** The second argument every tool's `execute` takes. */
function toolCtx(world: MatrixWorld, actorUserId: string, suspend: () => Promise<void>) {
  return {
    agent: { suspend, resumeData: undefined },
    requestContext: rcFor(world.tenantId, actorUserId),
  } as never;
}

/** A refusal the PORT layer expresses as a null rather than a throw — the link
 *  and assign read paths collapse FORBIDDEN, NOT_FOUND and CROSS_TENANT into one
 *  `null` on purpose (FUT-805 AC3). The matrix asserts on rejections, so the null
 *  has to become one here rather than silently reading as "allowed". */
function refused(what: string): never {
  throw new Error(`REFUSED: ${what}`);
}

/**
 * One entry per operation. Each knows how to attempt itself at BOTH layers,
 * which is what lets the matrix stay a single `test.each` instead of seven.
 *
 * Every runner attempts a REAL path: a cell that only built arguments would pass
 * against a tool with no gate at all.
 *
 * Every runner also mints its OWN target tasks. A shared task would make one
 * cell's outcome depend on which cells ran before it — `merge` trashes its
 * duplicate and `update` bumps a version.
 */
export const OPERATIONS: Record<MatrixOp, OperationRunners> = {
  create: {
    viaTool: async ({ world, actorUserId, scope, suspend }) => {
      const tool = makeCreateTaskTool(toolDeps(world, actorUserId));
      return tool.execute!(
        { planRef: world.scopes[scope].planId, title: 'Matrix probe' } as never,
        toolCtx(world, actorUserId, suspend),
      );
    },
    viaPort: async ({ world, actorUserId, scope }) => {
      const actor = { tenantId: world.tenantId, actorUserId };
      const port = makeActionTaskCreate();
      const plan = await port.resolvePlan({ ...actor, planRef: world.scopes[scope].planId });
      // Tenant-scoped resolution, so a foreign plan is simply not there.
      if (!plan) refused('plan not resolvable');
      if ('ambiguous' in plan) refused('plan ambiguous');
      await port.assertCanCreate({ ...actor, groupId: plan.groupId });
      const bucket = await port.resolveDefaultBucket({ ...actor, planId: plan.planId });
      if (!bucket) refused('plan has no bucket');
      return port.create({
        ...actor,
        planId: plan.planId,
        bucketId: bucket.bucketId,
        draft: { title: 'Matrix probe' },
        idempotencyKey: randomUUID(),
      });
    },
  },

  update: {
    viaTool: async ({ world, actorUserId, scope, suspend }) => {
      const target = await targetFor(world, scope);
      const tool = makeUpdateTaskTool(toolDeps(world, actorUserId));
      return tool.execute!(
        { taskRefs: [target.taskId], patch: { title: 'Matrix probe' } } as never,
        toolCtx(world, actorUserId, suspend),
      );
    },
    viaPort: async ({ world, actorUserId, scope }) => {
      const actor = { tenantId: world.tenantId, actorUserId };
      const target = await targetFor(world, scope);
      // The read is itself a boundary: it raises the planner's own NOT_FOUND /
      // CROSS_TENANT before the gate is ever reached.
      const snapshots = await makeActionTaskRead().readMany({ ...actor, taskIds: [target.taskId] });
      const port = makeActionTaskUpdate();
      await port.assertCanUpdateMany({ ...actor, groupIds: snapshots.map((s) => s.groupId) });
      return port.updateMany({
        ...actor,
        targets: [{ taskId: target.taskId, expectedVersion: snapshots[0]!.version }],
        patch: { title: 'Matrix probe' },
        idempotencyKey: randomUUID(),
      });
    },
  },

  /**
   * The same tool with TWO targets: one in the actor's own group and one in the
   * scope's. The question this cell asks and no other does is whether a PARTLY
   * permitted batch is refused whole — a batch that wrote the reachable half
   * would be a leak the single-target cell cannot see.
   */
  'bulk-update': {
    viaTool: async ({ world, actorUserId, scope, suspend }) => {
      const mine = await targetFor(world, 'own-group');
      const theirs = await targetFor(world, scope);
      const tool = makeUpdateTaskTool(toolDeps(world, actorUserId));
      return tool.execute!(
        { taskRefs: [mine.taskId, theirs.taskId], patch: { title: 'Matrix probe' } } as never,
        toolCtx(world, actorUserId, suspend),
      );
    },
    viaPort: async ({ world, actorUserId, scope }) => {
      const actor = { tenantId: world.tenantId, actorUserId };
      const mine = await targetFor(world, 'own-group');
      const theirs = await targetFor(world, scope);
      const taskIds = [mine.taskId, theirs.taskId];
      const snapshots = await makeActionTaskRead().readMany({ ...actor, taskIds });
      const port = makeActionTaskUpdate();
      // One gate call per DISTINCT group, which is the whole point of the plural
      // port: two groups here whenever the scope is not the actor's own.
      await port.assertCanUpdateMany({ ...actor, groupIds: snapshots.map((s) => s.groupId) });
      return port.updateMany({
        ...actor,
        targets: snapshots.map((s) => ({ taskId: s.taskId, expectedVersion: s.version })),
        patch: { title: 'Matrix probe' },
        idempotencyKey: randomUUID(),
      });
    },
  },

  /** Source always in the actor's own group, target per scope: the link is the
   *  thing that reaches out, so only one endpoint may be out of reach. */
  link: {
    viaTool: async ({ world, actorUserId, scope, suspend }) => {
      const source = await targetFor(world, 'own-group');
      const target = await targetFor(world, scope);
      const tool = makeLinkTasksTool(toolDeps(world, actorUserId));
      return tool.execute!(
        {
          sourceTaskRef: source.taskId,
          targetTaskRef: target.taskId,
          kind: 'relates',
        } as never,
        toolCtx(world, actorUserId, suspend),
      );
    },
    viaPort: async ({ world, actorUserId, scope }) => {
      const actor = { tenantId: world.tenantId, actorUserId };
      const source = await targetFor(world, 'own-group');
      const target = await targetFor(world, scope);
      const port = makeActionTaskLink();
      const a = await port.readEndpoint({ ...actor, taskId: source.taskId });
      const b = await port.readEndpoint({ ...actor, taskId: target.taskId });
      if (!a || !b) refused('an endpoint is not readable');
      await port.assertCanLink({ ...actor, groupIds: [a.groupId, b.groupId] });
      return port.link({
        ...actor,
        sourceTaskId: a.taskId,
        targetTaskId: b.taskId,
        kind: 'relates',
        idempotencyKey: randomUUID(),
      });
    },
  },

  /**
   * The duplicate — the task that goes to the TRASH — is the one per scope, and
   * the keeper is in the actor's own group. The destructive operation, so this is
   * the row of the table that matters most: a cell that allowed a cross-group
   * merge would be deleting somebody else's task.
   */
  merge: {
    viaTool: async ({ world, actorUserId, scope, suspend }) => {
      const duplicate = await targetFor(world, scope);
      const keep = await targetFor(world, 'own-group');
      const tool = makeMergeTasksTool(toolDeps(world, actorUserId));
      return tool.execute!(
        { duplicateTaskRef: duplicate.taskId, keepTaskRef: keep.taskId } as never,
        toolCtx(world, actorUserId, suspend),
      );
    },
    viaPort: async ({ world, actorUserId, scope }) => {
      const actor = { tenantId: world.tenantId, actorUserId };
      const duplicate = await targetFor(world, scope);
      const keep = await targetFor(world, 'own-group');
      const link = makeActionTaskLink();
      const dup = await link.readEndpoint({ ...actor, taskId: duplicate.taskId });
      const kept = await link.readEndpoint({ ...actor, taskId: keep.taskId });
      if (!dup || !kept) refused('an endpoint is not readable');
      const port = makeActionTaskMerge();
      await port.assertCanMerge({
        ...actor,
        duplicateGroupId: dup.groupId,
        keepGroupId: kept.groupId,
      });
      return port.merge({
        ...actor,
        duplicateTaskId: dup.taskId,
        duplicateExpectedVersion: dup.version,
        keepTaskId: kept.taskId,
        idempotencyKey: randomUUID(),
      });
    },
  },

  /** Assigning a member OF THE TARGET'S GROUP: `setAssignees` refuses a stranger
   *  outright, so naming one would refuse every cell for the wrong reason. */
  assign: {
    viaTool: async ({ world, actorUserId, scope, suspend }) => {
      const target = await targetFor(world, scope);
      const tool = makeAssignTaskTool(toolDeps(world, actorUserId));
      return tool.execute!(
        { taskRef: target.taskId, assigneeRefs: [world.scopes[scope].memberName] } as never,
        toolCtx(world, actorUserId, suspend),
      );
    },
    viaPort: async ({ world, actorUserId, scope }) => {
      const actor = { tenantId: world.tenantId, actorUserId };
      const target = await targetFor(world, scope);
      const port = makeActionTaskAssign();
      const snapshot = await port.readForAssign({ ...actor, taskId: target.taskId });
      if (!snapshot) refused('task not readable');
      await port.assertCanAssign({ ...actor, groupId: snapshot.groupId });
      return port.assign({
        ...actor,
        taskId: target.taskId,
        assigneeUserIds: [world.scopes[scope].memberUserId],
        idempotencyKey: randomUUID(),
      });
    },
  },

  /**
   * The widest gate in the set by design: `planner.task.comment.create` is granted
   * to `planner.viewer` as well as member and admin, so the viewer row of this
   * operation is the one place in the table where a viewer is allowed anything.
   */
  comment: {
    viaTool: async ({ world, actorUserId, scope, suspend }) => {
      const target = await targetFor(world, scope);
      const tool = makeCommentTaskTool(toolDeps(world, actorUserId));
      return tool.execute!(
        { taskRef: target.taskId, body: 'matrix probe' } as never,
        toolCtx(world, actorUserId, suspend),
      );
    },
    viaPort: async ({ world, actorUserId, scope }) => {
      const actor = { tenantId: world.tenantId, actorUserId };
      const target = await targetFor(world, scope);
      const snapshots = await makeActionTaskRead().readMany({ ...actor, taskIds: [target.taskId] });
      const port = makeActionComment();
      await port.assertCanComment({ ...actor, groupId: snapshots[0]!.groupId });
      return port.comment({
        ...actor,
        taskId: target.taskId,
        body: 'matrix probe',
        idempotencyKey: randomUUID(),
      });
    },
  },
};
