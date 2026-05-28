import { emit } from '@seta/core/events';
import type {
  IdentityUserCreated,
  IdentityUserDeactivated,
  IdentityUserEmailChanged,
  IdentityUserProfileUpdated,
} from '@seta/identity/events';
import type { DomainEvent, SubscriberCtx } from '@seta/shared-types';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import { assigneeProjection, plans, taskAssignments, tasks } from '../db/schema.ts';

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
    .onConflictDoUpdate({
      target: assigneeProjection.user_id,
      set: {
        tenant_id: e.payload.after.tenant_id,
        display_name: e.payload.after.name,
        email: e.payload.after.email,
        projection_built_at: new Date(),
      },
    });
}

export async function applyProfileUpdated(
  e: DomainEvent<IdentityUserProfileUpdated['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const after = e.payload.after;
  if (!hasAnyProjectedField(after)) return;

  const userId = e.payload.user_id;

  // Upsert: if the projection row doesn't exist yet (race with user.created subscriber —
  // both events fire within milliseconds at seed time), insert it by pulling the required
  // identity fields from identity.user within the same transaction.
  // ON CONFLICT applies the same partial update so the net result is identical whether
  // the row existed or not.
  //
  // Arrays must be passed as a PG array-literal string ($1::text[]) because Drizzle's
  // sql`` template expands a JS array to a row literal ($1,$2,...) which PG rejects as
  // "expression is of type record". toPgArrayLiteral() serialises to e.g. '{aws,docker}'.
  const skillsLiteral = after.skills !== undefined ? toPgArrayLiteral(after.skills) : null;

  // Build the ON CONFLICT SET clause from whichever fields are present.
  const conflictClauses: SQL[] = [sql`projection_built_at = NOW()`];
  if (after.display_name !== undefined)
    conflictClauses.push(sql`display_name = ${after.display_name}`);
  if (skillsLiteral !== null) conflictClauses.push(sql`skills = ${skillsLiteral}::text[]`);
  if (after.availability_status !== undefined)
    conflictClauses.push(sql`availability_status = ${after.availability_status}`);
  if (after.ooo_until !== undefined)
    conflictClauses.push(sql`ooo_until = ${after.ooo_until ? new Date(after.ooo_until) : null}`);
  if (after.timezone !== undefined) conflictClauses.push(sql`timezone = ${after.timezone}`);

  await ctx.tx.execute(sql`
    INSERT INTO planner.assignee_projection
      (user_id, tenant_id, display_name, email, skills, availability_status, timezone, projection_built_at)
    SELECT
      u.id,
      u.tenant_id,
      ${after.display_name !== undefined ? sql`${after.display_name}` : sql`u.name`},
      u.email,
      ${skillsLiteral !== null ? sql`${skillsLiteral}::text[]` : sql`'{}'::text[]`},
      ${after.availability_status !== undefined ? sql`${after.availability_status}` : sql`'available'`},
      ${after.timezone !== undefined ? sql`${after.timezone}` : sql`'UTC'`},
      NOW()
    FROM identity.user u
    WHERE u.id = ${userId}
    ON CONFLICT (user_id) DO UPDATE SET ${sql.join(conflictClauses, sql`, `)}
  `);
}

/**
 * Serialise a JS string array to a PostgreSQL array literal, e.g.
 * ['aws', 'system design'] → '{"aws","system design"}'.
 * Elements are double-quote-escaped so the literal is safe for any string content.
 */
function toPgArrayLiteral(arr: string[]): string {
  const escaped = arr.map((s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${escaped.join(',')}}`;
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
