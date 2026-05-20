import { emit } from '@seta/core/events';
import type {
  IdentityUserCreated,
  IdentityUserDeactivated,
  IdentityUserEmailChanged,
  IdentityUserProfileUpdated,
} from '@seta/identity/events';
import type { DomainEvent, SubscriberCtx } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { assigneeProjection, plans, taskAssignments, tasks } from '../../db/schema.ts';

export async function applyUserCreated(
  e: DomainEvent<IdentityUserCreated['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  await ctx.tx
    .insert(assigneeProjection)
    .values({
      user_id: e.payload.after.user_id,
      tenant_id: e.payload.after.tenant_id,
      display_name: e.payload.after.name,
      email: e.payload.after.email,
      skills: [],
      availability_status: 'available',
      timezone: 'UTC',
      ooo_until: null,
      deactivated_at: null,
    })
    .onConflictDoNothing();
}

export async function applyProfileUpdated(
  e: DomainEvent<IdentityUserProfileUpdated['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const after = e.payload.after;
  if (!hasAnyProjectedField(after)) return;
  await ctx.tx
    .update(assigneeProjection)
    .set({
      ...(after.display_name !== undefined && { display_name: after.display_name }),
      ...(after.skills !== undefined && { skills: after.skills }),
      ...(after.availability_status !== undefined && {
        availability_status: after.availability_status,
      }),
      ...(after.ooo_until !== undefined && {
        ooo_until: after.ooo_until ? new Date(after.ooo_until) : null,
      }),
      ...(after.timezone !== undefined && { timezone: after.timezone }),
      projection_built_at: new Date(),
    })
    .where(eq(assigneeProjection.user_id, e.payload.user_id));
}

export async function applyDeactivated(
  e: DomainEvent<IdentityUserDeactivated['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  await ctx.tx
    .update(assigneeProjection)
    .set({
      deactivated_at: new Date(e.payload.deactivated_at),
      projection_built_at: new Date(),
    })
    .where(eq(assigneeProjection.user_id, e.payload.user_id));
  await unassignAllForUser(ctx.tx, e.payload.user_id, e);
}

export async function applyEmailChanged(
  e: DomainEvent<IdentityUserEmailChanged['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  await ctx.tx
    .update(assigneeProjection)
    .set({ email: e.payload.new_email, projection_built_at: new Date() })
    .where(eq(assigneeProjection.user_id, e.payload.user_id));
}

function hasAnyProjectedField(after: IdentityUserProfileUpdated['payload']['after']): boolean {
  return (
    after.display_name !== undefined ||
    after.skills !== undefined ||
    after.availability_status !== undefined ||
    after.ooo_until !== undefined ||
    after.timezone !== undefined
  );
}

// Per spec §5.2: cascade unassignment + emit planner.task.unassigned for each (actor.type='system').
// The dispatcher wraps each handler invocation in emitContext.run(), so emit() works here directly.
async function unassignAllForUser(
  tx: SubscriberCtx['tx'],
  userId: string,
  source: DomainEvent<IdentityUserDeactivated['payload']>,
): Promise<void> {
  const rows = await tx
    .select({
      task_id: taskAssignments.task_id,
      plan_id: tasks.plan_id,
      group_id: plans.group_id,
      tenant_id: tasks.tenant_id,
    })
    .from(taskAssignments)
    .innerJoin(tasks, eq(taskAssignments.task_id, tasks.id))
    .innerJoin(plans, eq(tasks.plan_id, plans.id))
    .where(and(eq(taskAssignments.user_id, userId), eq(tasks.tenant_id, source.payload.tenant_id)));

  await tx.delete(taskAssignments).where(eq(taskAssignments.user_id, userId));

  for (const row of rows) {
    await emit({
      tenantId: row.tenant_id,
      aggregateType: 'planner.task',
      aggregateId: row.task_id,
      eventType: 'planner.task.unassigned',
      eventVersion: 1,
      payload: {
        actor: { type: 'system', user_id: null },
        group_id: row.group_id,
        task_id: row.task_id,
        plan_id: row.plan_id,
        user_id: userId,
      },
    });
  }
}
