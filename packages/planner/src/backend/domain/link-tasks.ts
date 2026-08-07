import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import type { NodeTx } from '@seta/shared-db';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerTaskLinkAdded } from '../../events/emit-helpers.ts';
import { plans, taskLinks, tasks } from '../db/schema.ts';
import type { TaskLinkKind } from '../dto.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

export interface LinkTasksInput {
  source_task_id: string;
  target_task_id: string;
  kind: TaskLinkKind;
}

/** The same local detector every planner writer uses: `code === '23505'`, one
 *  level of `cause`. No call site anywhere reads `constraint`, so with one
 *  combined pair index this catch CANNOT tell "this exact link exists" from "the
 *  opposite direction exists" — and does not need to. The pre-checks own the
 *  wording on the normal path; this is only the race backstop, where one general
 *  sentence is the honest answer. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if ('code' in err && (err as { code: unknown }).code === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause as { code: unknown }).code === '23505'
  );
}

/** Both endpoints must be LIVE. `unlinkTasks` deliberately does NOT mirror this
 *  filter — see the comment there; the asymmetry is load-bearing. */
async function readLiveTask(tx: NodeTx, taskId: string, tenantId: string) {
  const [row] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), isNull(tasks.deleted_at)))
    .limit(1);
  if (!row) throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: taskId });
  if (row.tenant_id !== tenantId) {
    throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', { task_id: taskId });
  }
  return row;
}

async function readPlanGroup(tx: NodeTx, planId: string): Promise<string> {
  const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: planId });
  return plan.group_id;
}

/**
 * Create a task↔task relationship.
 *
 * The permission gate covers BOTH endpoints. That is the whole content of
 * FUT-820: without the target-side check, an actor could link to — and therefore
 * learn the title of — a task in a group they cannot reach. It is a NEW gate on
 * a NEW feature, not a fix to an existing one (design §0.3).
 */
export async function linkTasks(
  input: LinkTasksInput & { session: SessionScope },
): Promise<{ id: string }> {
  return withSpan(
    'planner.task.link',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.source_task_id,
    },
    () => linkTasksImpl(input),
  );
}

async function linkTasksImpl(
  input: LinkTasksInput & { session: SessionScope },
): Promise<{ id: string }> {
  // Cheapest rule first, and it produces a sentence rather than a constraint
  // error — the table's CHECK is the backstop, not the message.
  if (input.source_task_id === input.target_task_id) {
    throw new PlannerError('VALIDATION', 'A task cannot be linked to itself', {
      task_id: input.source_task_id,
    });
  }

  let linkId!: string;
  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.session.tenant_id } },
    async (tx) => {
      const source = await readLiveTask(tx, input.source_task_id, input.session.tenant_id);
      const target = await readLiveTask(tx, input.target_task_id, input.session.tenant_id);

      const sourceGroup = await readPlanGroup(tx, source.plan_id);
      const targetGroup = await readPlanGroup(tx, target.plan_id);
      await requirePermission(input.session, 'planner.task.update', sourceGroup);
      await requirePermission(input.session, 'planner.task.update', targetGroup);

      // `duplicates` carries two extra rules, each with its own sentence, so the
      // normal path never surfaces the general race message further down.
      if (input.kind === 'duplicates') {
        const [inverse] = await tx
          .select()
          .from(taskLinks)
          .where(
            and(
              eq(taskLinks.tenant_id, source.tenant_id),
              eq(taskLinks.source_task_id, target.id),
              eq(taskLinks.target_task_id, source.id),
              eq(taskLinks.kind, 'duplicates'),
            ),
          )
          .limit(1);
        if (inverse) {
          throw new PlannerError(
            'DUPLICATE_LINK',
            'Those two tasks are already merged the other way round',
            { source_task_id: source.id, target_task_id: target.id },
          );
        }

        // One canonical duplicate target per task. Not new behaviour — merge
        // already refused it — but it lives here so BOTH writers obey it, since
        // planner_linkTasks can write kind:'duplicates' without merging.
        const [existingDup] = await tx
          .select()
          .from(taskLinks)
          .where(
            and(
              eq(taskLinks.tenant_id, source.tenant_id),
              eq(taskLinks.source_task_id, source.id),
              eq(taskLinks.kind, 'duplicates'),
            ),
          )
          .limit(1);
        if (existingDup) {
          throw new PlannerError(
            'DUPLICATE_LINK',
            'That task is already marked as a duplicate of another task',
            { source_task_id: source.id, target_task_id: existingDup.target_task_id },
          );
        }
      }

      let insertedId: string;
      try {
        const [row] = await tx
          .insert(taskLinks)
          .values({
            tenant_id: source.tenant_id,
            source_task_id: source.id,
            target_task_id: target.id,
            kind: input.kind,
            created_by: input.session.user_id,
          })
          .returning({ id: taskLinks.id });
        if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
        insertedId = row.id;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new PlannerError('DUPLICATE_LINK', 'Those two tasks are already linked that way', {
            source_task_id: source.id,
            target_task_id: target.id,
            kind: input.kind,
          });
        }
        throw err;
      }
      linkId = insertedId;

      await emitPlannerTaskLinkAdded({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: source.tenant_id,
        group_id: sourceGroup,
        link_id: insertedId,
        source_task_id: source.id,
        target_task_id: target.id,
        source_plan_id: source.plan_id,
        target_plan_id: target.plan_id,
        kind: input.kind,
      });
    },
  );

  return { id: linkId };
}
