import { withGatedMutation } from '@seta/core/events';
import { buildActorSession } from '@seta/identity';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import {
  assigneeProjection,
  plans,
  taskAssignments,
  taskComments,
  taskReferences,
  tasks,
} from '../../db/schema.ts';
import { priorityToNumber } from '../../db/task-enums.ts';
import { TASK_LINK_KIND_LIST, taskLinkUrl } from '../../domain/_task-link-row.ts';
import { applyLabelsByName } from '../../domain/apply-labels-by-name.ts';
import { createComment } from '../../domain/create-comment.ts';
import { createTask } from '../../domain/create-task.ts';
import { deleteTask } from '../../domain/delete-task.ts';
import { getTask } from '../../domain/get-task.ts';
import { linkTasks, markAsDuplicate } from '../../domain/link-tasks.ts';
import { listBuckets } from '../../domain/list-buckets.ts';
import { setAssignees } from '../../domain/set-assignees.ts';
import { updateTask } from '../../domain/update-task.ts';
import { getPlannerVectorStore } from '../../embeddings/vector-store.ts';
import { PlannerError, requirePermission } from '../../rbac.ts';
import { getTaskGroupId, listActiveGroupMemberProfiles } from '../../read-helpers.ts';
import { searchSimilar } from '../../workflows/dedup-on-create/steps/search-similar.ts';
import type {
  CommentPort,
  SimilarTaskPort,
  TaskAssignPort,
  TaskCreatePort,
  TaskLinkPort,
  TaskMergePort,
  TaskReadPort,
  TaskUpdatePort,
} from './ports.ts';
import type { ActionTaskSnapshot, ToolTaskLinkKind } from './schemas.ts';

export function makeActionTaskRead(): TaskReadPort {
  return {
    async readMany({ tenantId, taskIds, actorUserId }) {
      // ONE session for the whole batch. buildActorSession is a DB round trip;
      // called per target it would resolve permissions 20 times inside one turn.
      const session = await buildActorSession({ user_id: actorUserId });
      const out: ActionTaskSnapshot[] = [];
      for (const taskId of taskIds) {
        const task = await getTask({ task_id: taskId, session });
        // The task's group, via its plan. getTask returns plan_id only, and the
        // permission gate is group-scoped, so this second read is load-bearing.
        const groupId = await getTaskGroupId(tenantId, taskId);
        if (!groupId) {
          throw new PlannerError('NOT_FOUND', 'Task has no resolvable group', { task_id: taskId });
        }
        out.push({
          taskId: task.id,
          title: task.title,
          description: task.description,
          due_at: task.due_at,
          start_at: task.start_at,
          priority_number: task.priority_number,
          percent_complete: task.percent_complete,
          version: task.version,
          groupId,
        });
      }
      return out;
    },
  };
}

export function makeActionTaskUpdate(): TaskUpdatePort {
  return {
    async assertCanUpdateMany({ actorUserId, groupIds }) {
      const session = await buildActorSession({ user_id: actorUserId });
      // Once per DISTINCT group: 20 tasks in one group is one membership read.
      for (const groupId of new Set(groupIds)) {
        await requirePermission(session, 'planner.task.update', groupId);
      }
    },

    async updateMany({ actorUserId, targets, patch, idempotencyKey }) {
      const session = await buildActorSession({ user_id: actorUserId });
      const taskIds = targets.map((t) => t.taskId);

      // ONE transaction: the gateway opens it, every updateTask joins it through
      // the reentrant withEmit shipped in FUT-808. A stale version anywhere in
      // the batch therefore rolls the whole batch back.
      const { result, replayed } = await withGatedMutation(
        session,
        {
          idempotencyKey,
          onBehalfOf: actorUserId,
          actorKind: 'agent',
          // Keep the audit vocabulary honest: one target is an `update`.
          mutationKind: targets.length === 1 ? 'update' : 'bulk_update',
          // An ARRAY snapshot, positionally aligned with `targets`, so before[i]
          // and after[i] describe the same task. `GatedMutationOpts.snapshot`
          // returns `unknown`, so carrying a batch needs no gateway change.
          // The gateway backfills this pair onto EVERY event the body emitted,
          // so a batch of three leaves three events sharing one pair. That
          // redundancy is cosmetic and inherent to "one function called twice";
          // giving each event its own snapshot would need a grouping column
          // core.events does not have.
          snapshot: async (tx) => {
            const rows = await tx
              .select()
              .from(tasks)
              .where(and(inArray(tasks.id, taskIds), isNull(tasks.deleted_at)));
            const byId = new Map(rows.map((r) => [r.id, r]));
            return taskIds.map((id) => byId.get(id) ?? null);
          },
        },
        async () => {
          const written: string[] = [];
          for (const target of targets) {
            const row = await updateTask({
              task_id: target.taskId,
              expected_version: target.expectedVersion,
              patch,
              session,
            });
            written.push(row.id);
          }
          return { taskIds: written };
        },
      );
      return { taskIds: result.taskIds, replayed };
    },
  };
}

export function makeActionTaskLink(): TaskLinkPort {
  return {
    async readEndpoint({ tenantId, taskId, actorUserId }) {
      const session = await buildActorSession({ user_id: actorUserId });
      try {
        const task = await getTask({ task_id: taskId, session });
        const groupId = await getTaskGroupId(tenantId, taskId);
        if (!groupId) return null;
        return {
          taskId: task.id,
          title: task.title,
          description: task.description,
          due_at: task.due_at,
          start_at: task.start_at,
          priority_number: task.priority_number,
          percent_complete: task.percent_complete,
          version: task.version,
          groupId,
        };
      } catch (err) {
        // THE normalisation. getTask distinguishes "absent" from "you may not
        // read this", and a link tool that surfaced the difference would answer
        // the question an attacker is asking. Everything else still propagates.
        const code = (err as { code?: unknown }).code;
        if (code === 'NOT_FOUND' || code === 'FORBIDDEN' || code === 'CROSS_TENANT') return null;
        throw err;
      }
    },

    async assertCanLink({ actorUserId, groupIds }) {
      const session = await buildActorSession({ user_id: actorUserId });
      for (const groupId of new Set(groupIds)) {
        await requirePermission(session, 'planner.task.update', groupId);
      }
    },

    async readPairLink({ tenantId, sourceTaskId, targetTaskId }) {
      const [row] = await plannerDb()
        .select({ type: taskReferences.type, task_id: taskReferences.task_id })
        .from(taskReferences)
        .where(
          and(
            eq(taskReferences.tenant_id, tenantId),
            inArray(taskReferences.type, TASK_LINK_KIND_LIST),
            or(
              and(
                eq(taskReferences.task_id, sourceTaskId),
                eq(taskReferences.url, taskLinkUrl(targetTaskId)),
              ),
              and(
                eq(taskReferences.task_id, targetTaskId),
                eq(taskReferences.url, taskLinkUrl(sourceTaskId)),
              ),
            ),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        kind: row.type as ToolTaskLinkKind,
        direction: row.task_id === sourceTaskId ? 'outgoing' : 'incoming',
      };
    },

    async link({ tenantId, actorUserId, sourceTaskId, targetTaskId, kind, idempotencyKey }) {
      const session = await buildActorSession({ user_id: actorUserId });
      const { result, replayed } = await withGatedMutation(
        session,
        {
          idempotencyKey,
          onBehalfOf: actorUserId,
          actorKind: 'agent',
          mutationKind: 'link',
          // A link row has no "before": it did not exist. The gateway calls this
          // once before the body (null) and once after (the row), and backfills
          // both onto the emitted events.
          snapshot: async (tx) => {
            const [row] = await tx
              .select()
              .from(taskReferences)
              .where(
                and(
                  eq(taskReferences.tenant_id, tenantId),
                  eq(taskReferences.task_id, sourceTaskId),
                  eq(taskReferences.url, taskLinkUrl(targetTaskId)),
                ),
              )
              .limit(1);
            return row ?? null;
          },
        },
        async () => {
          const { id } = await linkTasks({
            source_task_id: sourceTaskId,
            target_task_id: targetTaskId,
            kind,
            session,
          });
          return { linkId: id };
        },
      );
      return { linkId: result.linkId, replayed };
    },
  };
}

export function makeActionTaskMerge(): TaskMergePort {
  return {
    async assertCanMerge({ actorUserId, duplicateGroupId, keepGroupId }) {
      const session = await buildActorSession({ user_id: actorUserId });
      for (const groupId of new Set([duplicateGroupId, keepGroupId])) {
        await requirePermission(session, 'planner.task.update', groupId);
      }
      // Only the duplicate is deleted, so only its group needs the delete right.
      await requirePermission(session, 'planner.task.delete', duplicateGroupId);
    },

    async merge({
      actorUserId,
      duplicateTaskId,
      duplicateExpectedVersion,
      keepTaskId,
      idempotencyKey,
    }) {
      const session = await buildActorSession({ user_id: actorUserId });
      const { replayed } = await withGatedMutation(
        session,
        {
          idempotencyKey,
          onBehalfOf: actorUserId,
          actorKind: 'agent',
          mutationKind: 'merge_soft_delete',
          // BY ID ALONE. The gateway calls this once before the body and once
          // after; after the body the duplicate IS soft-deleted, so an
          // `isNull(tasks.deleted_at)` filter here would return null and strip
          // `after` off the audit row — the one field a reviewer needs.
          snapshot: async (tx) => {
            const [row] = await tx
              .select()
              .from(tasks)
              .where(eq(tasks.id, duplicateTaskId))
              .limit(1);
            return row ?? null;
          },
        },
        // ONE body, both writes. withEmit is reentrant (FUT-808), so both domain
        // functions join the gateway's transaction instead of opening their own.
        async () => {
          // NOT linkTasks({ kind: 'duplicates' }): a pair-direction holds one
          // kind at a time (spec D8), and the common case is a pair the dedup
          // workflow already marked `relates`, which linkTasks refuses. This
          // writer promotes that row in place, keeping its id (§3.7).
          await markAsDuplicate({
            duplicate_task_id: duplicateTaskId,
            keep_task_id: keepTaskId,
            session,
          });
          await deleteTask({
            task_id: duplicateTaskId,
            expected_version: duplicateExpectedVersion,
            session,
          });
          return {};
        },
      );
      return { replayed };
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Both deps are read LAZILY, inside search(): the action runtime is composed at
 * module load, before any request has a live embedding provider, so a getter
 * that throws must stay harmless until a create is actually previewed. Same
 * reason `databaseUrl` is optional and only fails when it is genuinely needed —
 * `plannerFindSimilarTasksTool` does exactly this.
 */
export function makeActionSimilarTasks(deps: {
  provider: EmbeddingProvider;
  databaseUrl?: string;
}): SimilarTaskPort {
  return {
    async search({ tenantId, planId, queryText, limit }) {
      if (!deps.databaseUrl) {
        throw new Error('makeActionSimilarTasks: databaseUrl must be supplied');
      }
      const { candidates } = await searchSimilar(
        { tenantId, queryText, planIds: [planId], topK: limit ?? 5 },
        {
          provider: deps.provider,
          pgVector: getPlannerVectorStore(deps.databaseUrl),
          reranker: resolveReranker(),
        },
      );
      return candidates.map((c) => ({ taskId: c.taskId, title: c.title, score: c.score }));
    },
  };
}

export function makeActionTaskCreate(): TaskCreatePort {
  return {
    async resolvePlan({ tenantId, planRef }) {
      const ref = planRef.trim();
      const matches = await plannerDb()
        .select({ planId: plans.id, groupId: plans.group_id, planName: plans.name })
        .from(plans)
        .where(
          and(
            eq(plans.tenant_id, tenantId),
            isNull(plans.deleted_at),
            UUID_RE.test(ref) ? eq(plans.id, ref) : eq(plans.name, ref),
          ),
        );
      if (matches.length === 0) return null;
      if (matches.length > 1) {
        return { ambiguous: matches.map((m) => ({ planId: m.planId, planName: m.planName })) };
      }
      return matches[0]!;
    },

    async assertCanCreate({ actorUserId, groupId }) {
      const session = await buildActorSession({ user_id: actorUserId });
      await requirePermission(session, 'planner.task.create', groupId);
    },

    async resolveDefaultBucket({ actorUserId, planId }) {
      const session = await buildActorSession({ user_id: actorUserId });
      // listBuckets rather than fresh SQL: it already carries the
      // `planner.bucket.read` check, the cross-tenant refusal, and
      // `ORDER BY order_hint NULLS LAST` — the very order the board paints its
      // columns in, which is the whole point of picking the first one.
      const rows = await listBuckets({ plan_id: planId, session });
      const first = rows[0];
      return first ? { bucketId: first.id, bucketName: first.name } : null;
    },

    async create({ actorUserId, planId, bucketId, draft, idempotencyKey }) {
      const session = await buildActorSession({ user_id: actorUserId });
      const { result, replayed } = await withGatedMutation(
        session,
        {
          idempotencyKey,
          onBehalfOf: actorUserId,
          actorKind: 'agent',
          mutationKind: 'create',
          // Nothing exists yet, so there is nothing to snapshot. The gateway
          // persists `result`, and that is what carries the created id back on a
          // replay — the body never runs a second time.
          snapshot: async () => ({}),
        },
        // ONE body, both writes, joined through the reentrant withEmit: a task
        // that exists with none of its labels is not a state the user previewed.
        async () => {
          const task = await createTask({
            session,
            plan_id: planId,
            // Without this the task is invisible on the board, AND its
            // order_hint is computed against the `bucket_id IS NULL` group
            // (create-task.ts), so its position would be meaningless too.
            bucket_id: bucketId,
            title: draft.title,
            description: draft.description,
            due_at: draft.dueAt,
            start_at: draft.startAt,
            // The card carries the priority WORD; the table stores 1/3/5/9.
            ...(draft.priority ? { priority_number: priorityToNumber(draft.priority) } : {}),
          });
          if (draft.labels?.length) {
            await applyLabelsByName({
              plan_id: planId,
              task_id: task.id,
              names: draft.labels,
              session,
            });
          }
          return { taskId: task.id };
        },
      );
      return { taskId: result.taskId, replayed };
    },
  };
}

export function makeActionComment(): CommentPort {
  return {
    async assertCanComment({ actorUserId, groupId }) {
      const session = await buildActorSession({ user_id: actorUserId });
      await requirePermission(session, 'planner.task.comment.create', groupId);
    },

    async comment({ actorUserId, taskId, body, idempotencyKey }) {
      const session = await buildActorSession({ user_id: actorUserId });
      const { result, replayed } = await withGatedMutation(
        session,
        {
          idempotencyKey,
          onBehalfOf: actorUserId,
          actorKind: 'agent',
          mutationKind: 'comment',
          // A comment is additive, so the before-state is the count: enough to
          // tell a replay from a fresh post without copying the thread.
          snapshot: async (tx) => {
            const rows = await tx
              .select({ id: taskComments.id })
              .from(taskComments)
              .where(eq(taskComments.task_id, taskId));
            return { commentCount: rows.length };
          },
        },
        async () => {
          const c = await createComment({ task_id: taskId, body, session });
          return { commentId: c.id };
        },
      );
      // On a REPLAY the body never runs; the id comes back off the persisted
      // `result` instead, which is why it is returned from the body rather than
      // captured in a closure. `?? ''` covers a row persisted before this field
      // existed, and the tool turns an empty id into a null.
      return { commentId: result?.commentId ?? '', replayed };
    },
  };
}

export function makeActionTaskAssign(): TaskAssignPort {
  return {
    async readForAssign({ tenantId, taskId, actorUserId }) {
      const session = await buildActorSession({ user_id: actorUserId });
      try {
        const task = await getTask({ task_id: taskId, session });
        const groupId = await getTaskGroupId(tenantId, taskId);
        if (!groupId) return null;
        const assignees = await plannerDb()
          .select({
            userId: taskAssignments.user_id,
            name: assigneeProjection.display_name,
          })
          .from(taskAssignments)
          .innerJoin(assigneeProjection, eq(assigneeProjection.user_id, taskAssignments.user_id))
          .where(
            and(eq(taskAssignments.task_id, taskId), eq(assigneeProjection.tenant_id, tenantId)),
          );
        return { title: task.title, groupId, assignees };
      } catch (err) {
        // Same normalisation as the link port: an unreadable task and an absent
        // one must be indistinguishable to the caller.
        const code = (err as { code?: unknown }).code;
        if (code === 'NOT_FOUND' || code === 'FORBIDDEN' || code === 'CROSS_TENANT') return null;
        throw err;
      }
    },

    async assertCanAssign({ actorUserId, groupId }) {
      const session = await buildActorSession({ user_id: actorUserId });
      await requirePermission(session, 'planner.task.assign', groupId);
    },

    async resolveMembers({ tenantId, groupId, query }) {
      // Group members only, so `inGroup` is true on every row today. The field
      // exists so the tool can one day tell "nobody by that name" from "that
      // person is not on this task's team"; assertAssigneesAreGroupMembers
      // inside setAssignees is the backstop either way.
      const members = await listActiveGroupMemberProfiles(tenantId, groupId);
      const needle = query.trim().toLowerCase();
      return members
        .filter((m) => m.display_name.toLowerCase().includes(needle))
        .map((m) => ({ userId: m.user_id, name: m.display_name, inGroup: true }));
    },

    async assign({ actorUserId, taskId, assigneeUserIds, idempotencyKey }) {
      const session = await buildActorSession({ user_id: actorUserId });
      const { replayed } = await withGatedMutation(
        session,
        {
          idempotencyKey,
          onBehalfOf: actorUserId,
          actorKind: 'agent',
          mutationKind: 'assign',
          // Sorted so before/after differ only when the SET differs, not on row
          // order.
          snapshot: async (tx) => {
            const rows = await tx
              .select({ user_id: taskAssignments.user_id })
              .from(taskAssignments)
              .where(eq(taskAssignments.task_id, taskId));
            return { assigneeUserIds: rows.map((r) => r.user_id).sort() };
          },
        },
        // setAssignees, not a loop over assignTask: this tool makes the named
        // set TRUE (design D5), and assignTask can only add.
        async () => {
          await setAssignees({ task_id: taskId, user_ids: assigneeUserIds, session });
          return { taskId };
        },
      );
      return { replayed };
    },
  };
}
