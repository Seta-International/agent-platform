import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { plans, taskAssignments, tasks } from '../../db/schema.ts';
import { emitPlannerTaskAssigned, emitPlannerTaskUnassigned } from '../../events/emit-helpers.ts';
import type { SetTaskAssigneesInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isM365SystemActor } from './_actor.ts';
import { hintsForN, type PlanExternalSource } from './order-hint.ts';

export interface SetTaskAssigneesDeps {
  // Returns entra_oid keyed by user_id. Only invoked on m365-linked plans
  // from non-system sessions; native plans and system-actor calls skip lookup.
  lookupEntraOids: (userIds: string[]) => Promise<Map<string, string | null>>;
}

const NOOP_DEPS: SetTaskAssigneesDeps = {
  lookupEntraOids: async () => new Map(),
};

export async function setTaskAssignees(
  input: SetTaskAssigneesInput & { session: SessionScope },
  deps: SetTaskAssigneesDeps = NOOP_DEPS,
): Promise<void> {
  return withSpan(
    'planner.task.set-assignees',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.task_id,
    },
    () => setTaskAssigneesImpl(input, deps),
  );
}

async function setTaskAssigneesImpl(
  input: SetTaskAssigneesInput & { session: SessionScope },
  deps: SetTaskAssigneesDeps,
): Promise<void> {
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [task] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!task) throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      if (task.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: task.plan_id,
        });

      requirePermission(input.session, 'planner.task.assign', plan.group_id);

      const existing = await tx
        .select({ user_id: taskAssignments.user_id })
        .from(taskAssignments)
        .where(eq(taskAssignments.task_id, input.task_id));
      const existingIds = new Set(existing.map((r) => r.user_id));
      const incomingIds = new Set(input.assignees.map((a) => a.user_id));

      const removed = [...existingIds].filter((id) => !incomingIds.has(id));
      const addedIndices: number[] = [];
      input.assignees.forEach((a, i) => {
        if (!existingIds.has(a.user_id)) addedIndices.push(i);
      });

      if (plan.external_source === 'm365' && !isM365SystemActor(input.session)) {
        const addedUserIds = addedIndices.map((i) => input.assignees[i]!.user_id);
        if (addedUserIds.length > 0) {
          const entraByUser = await deps.lookupEntraOids(addedUserIds);
          const missing = addedUserIds.filter((id) => !entraByUser.get(id));
          if (missing.length > 0) {
            throw new PlannerError(
              'ASSIGNEE_NOT_M365_SYNCABLE',
              'Cannot add users without an M365 identity to a linked plan',
              { task_id: input.task_id, user_ids: missing },
            );
          }
        }
      }

      const generatedHints = hintsForN(
        input.assignees.length,
        plan.external_source as PlanExternalSource,
      );

      if (addedIndices.length > 0) {
        const values = addedIndices.map((i) => {
          const a = input.assignees[i]!;
          return {
            task_id: input.task_id,
            user_id: a.user_id,
            order_hint: a.order_hint ?? generatedHints[i]!,
            assigned_by: input.session.user_id,
          };
        });
        await tx.insert(taskAssignments).values(values);
      }

      if (removed.length > 0) {
        await tx
          .delete(taskAssignments)
          .where(
            and(
              eq(taskAssignments.task_id, input.task_id),
              inArray(taskAssignments.user_id, removed),
            ),
          );
      }

      for (const i of addedIndices) {
        const a = input.assignees[i]!;
        await emitPlannerTaskAssigned({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: task.tenant_id,
          task_id: task.id,
          plan_id: task.plan_id,
          group_id: plan.group_id,
          user_id: a.user_id,
        });
      }

      for (const user_id of removed) {
        await emitPlannerTaskUnassigned({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: task.tenant_id,
          task_id: task.id,
          plan_id: task.plan_id,
          group_id: plan.group_id,
          user_id,
        });
      }
    },
  );
}
