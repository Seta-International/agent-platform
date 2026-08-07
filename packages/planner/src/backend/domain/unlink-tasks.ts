import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-db';
import { eq } from 'drizzle-orm';
import { emitPlannerTaskLinkRemoved } from '../../events/emit-helpers.ts';
import { plans, taskLinks, tasks } from '../db/schema.ts';
import type { TaskLinkKind } from '../dto.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

/**
 * Reads an endpoint WITHOUT a `deleted_at IS NULL` filter, unlike `linkTasks`.
 * The asymmetry is deliberate and load-bearing: a merge trashes the duplicate,
 * so if unlink also demanded two live tasks, the `duplicates` link a merge just
 * created would be permanently un-removable. Linking *to* a trashed task stays
 * refused; removing a link that touches one does not.
 */
async function readAnyTask(tx: NodeTx, taskId: string) {
  const [row] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!row) throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: taskId });
  return row;
}

async function readPlanGroup(tx: NodeTx, planId: string): Promise<string> {
  const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: planId });
  return plan.group_id;
}

export async function unlinkTasks(input: {
  link_id: string;
  session: SessionScope;
}): Promise<void> {
  return withSpan(
    'planner.task.unlink',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.link_id': input.link_id,
    },
    () => unlinkTasksImpl(input),
  );
}

async function unlinkTasksImpl(input: { link_id: string; session: SessionScope }): Promise<void> {
  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      const [link] = await tx
        .select()
        .from(taskLinks)
        .where(eq(taskLinks.id, input.link_id))
        .limit(1);
      // Same NOT_FOUND for a missing row and a cross-tenant one: the existence of
      // another tenant's link is not something to confirm.
      if (!link || link.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('NOT_FOUND', 'Link not found', { link_id: input.link_id });
      }

      const source = await readAnyTask(tx, link.source_task_id);
      const target = await readAnyTask(tx, link.target_task_id);
      const sourceGroup = await readPlanGroup(tx, source.plan_id);
      const targetGroup = await readPlanGroup(tx, target.plan_id);

      // Symmetric with create, and "current" matters: a task can have moved to
      // another plan — and therefore another group — since the link was made.
      // No trash permission is required: `planner.trash.*` gates listing and
      // purging the trash, not removing a link that happens to touch a trashed
      // task. restoreTask itself only needs planner.task.update.
      await requirePermission(input.session, 'planner.task.update', sourceGroup);
      await requirePermission(input.session, 'planner.task.update', targetGroup);

      // Hard delete — a link has no trash of its own.
      await tx.delete(taskLinks).where(eq(taskLinks.id, link.id));

      await emitPlannerTaskLinkRemoved({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: link.tenant_id,
        group_id: sourceGroup,
        link_id: link.id,
        source_task_id: link.source_task_id,
        target_task_id: link.target_task_id,
        source_plan_id: source.plan_id,
        target_plan_id: target.plan_id,
        kind: link.kind as TaskLinkKind,
      });
    },
  );
}
