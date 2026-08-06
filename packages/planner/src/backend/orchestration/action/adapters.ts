import { withGatedMutation } from '@seta/core/events';
import { buildActorSession } from '@seta/identity';
import { and, eq, isNull } from 'drizzle-orm';
import { tasks } from '../../db/schema.ts';
import { getTask } from '../../domain/get-task.ts';
import { updateTask } from '../../domain/update-task.ts';
import { PlannerError, requirePermission } from '../../rbac.ts';
import { getTaskGroupId } from '../../read-helpers.ts';
import type { TaskReadPort, TaskUpdatePort } from './ports.ts';

export function makeActionTaskRead(): TaskReadPort {
  return {
    async read({ tenantId, taskId, actorUserId }) {
      const session = await buildActorSession({ user_id: actorUserId });
      const task = await getTask({ task_id: taskId, session });
      // The task's group, via its plan. getTask returns plan_id only, and the
      // permission gate is group-scoped, so this second read is load-bearing —
      // unlike the assignment reader, which leaves groupId blank because its
      // pipeline never reads it.
      const groupId = await getTaskGroupId(tenantId, taskId);
      if (!groupId) {
        throw new PlannerError('NOT_FOUND', 'Task has no resolvable group', { task_id: taskId });
      }
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
    },
  };
}

export function makeActionTaskUpdate(): TaskUpdatePort {
  return {
    async assertCanUpdate({ actorUserId, groupId }) {
      const session = await buildActorSession({ user_id: actorUserId });
      await requirePermission(session, 'planner.task.update', groupId);
    },

    async update({ actorUserId, taskId, expectedVersion, patch, idempotencyKey }) {
      const session = await buildActorSession({ user_id: actorUserId });
      // ONE transaction: the gateway opens it, updateTask joins it through the
      // reentrant withEmit shipped in FUT-808. The snapshot function is called
      // once before and once after the body, so the two sides of the audit diff
      // cannot drift in shape.
      const { result, replayed } = await withGatedMutation(
        session,
        {
          idempotencyKey,
          onBehalfOf: actorUserId,
          actorKind: 'agent',
          mutationKind: 'update',
          snapshot: async (tx) => {
            const [row] = await tx
              .select()
              .from(tasks)
              .where(and(eq(tasks.id, taskId), isNull(tasks.deleted_at)))
              .limit(1);
            return row ?? null;
          },
        },
        async () => {
          const row = await updateTask({
            task_id: taskId,
            expected_version: expectedVersion,
            patch,
            session,
          });
          return { taskId: row.id, version: row.version };
        },
      );
      return { ...result, replayed };
    },
  };
}
