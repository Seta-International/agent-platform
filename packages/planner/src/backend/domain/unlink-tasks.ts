import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-db';
import { eq } from 'drizzle-orm';
import { emitPlannerTaskLinkRemoved } from '../../events/emit-helpers.ts';
import { plans, taskReferences, tasks } from '../db/schema.ts';
import type { TaskLinkKind } from '../dto.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isTaskLinkKind, taskIdFromLinkUrl } from './_task-link-row.ts';

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

/**
 * Remove a task↔task link BY ROW ID.
 *
 * Not by `{task_id, url}` as `removeTaskReference` is, and that is forced: for an
 * INCOMING link the row belongs to the other task, so a caller on this task's
 * detail page cannot address it by its own `task_id` (design §3.2).
 */
export async function unlinkTasks(input: {
  reference_id: string;
  session: SessionScope;
}): Promise<void> {
  return withSpan(
    'planner.task.unlink',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.reference_id': input.reference_id,
    },
    () => unlinkTasksImpl(input),
  );
}

async function unlinkTasksImpl(input: {
  reference_id: string;
  session: SessionScope;
}): Promise<void> {
  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      const [row] = await tx
        .select()
        .from(taskReferences)
        .where(eq(taskReferences.id, input.reference_id))
        .limit(1);

      // ONE NOT_FOUND for three cases — absent, another tenant's, and a BOOKMARK
      // row. The last is §3.11: bookmarks are removed by removeTaskReference,
      // which gates one endpoint; letting this route touch them would drop a row
      // the other endpoint has no say in. Same code for all three, because the
      // existence of a row this route may not address is not something to
      // confirm.
      if (!row || row.tenant_id !== input.session.tenant_id || !isTaskLinkKind(row.type)) {
        throw new PlannerError('NOT_FOUND', 'Link not found', {
          reference_id: input.reference_id,
        });
      }

      const source = await readAnyTask(tx, row.task_id);
      const target = await readAnyTask(tx, taskIdFromLinkUrl(row.url));
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
      await tx.delete(taskReferences).where(eq(taskReferences.id, row.id));

      await emitPlannerTaskLinkRemoved({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: row.tenant_id,
        group_id: sourceGroup,
        reference_id: row.id,
        source_task_id: source.id,
        target_task_id: target.id,
        source_plan_id: source.plan_id,
        target_plan_id: target.plan_id,
        kind: row.type as TaskLinkKind,
      });
    },
  );
}
