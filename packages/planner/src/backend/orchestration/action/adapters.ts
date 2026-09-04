import { withGatedMutation } from '@seta/core/events';
import { buildActorSession } from '@seta/identity';
import { and, inArray, isNull } from 'drizzle-orm';
import { tasks } from '../../db/schema.ts';
import { getTask } from '../../domain/get-task.ts';
import { updateTask } from '../../domain/update-task.ts';
import { PlannerError, requirePermission } from '../../rbac.ts';
import { getTaskGroupId } from '../../read-helpers.ts';
import type { TaskReadPort, TaskUpdatePort } from './ports.ts';
import type { ActionTaskSnapshot } from './schemas.ts';

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
