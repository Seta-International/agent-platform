import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { emitPlannerTaskMoved, emitPlannerTaskUpdated } from '../../events/emit-helpers.ts';
import type { TaskChangedField } from '../../events/types.ts';
import { buckets, plans, taskLabels, tasks } from '../db/schema.ts';
import type { TaskRow } from '../dto.ts';
import type { MoveTaskInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { taskRowToDto } from './_task-dto.ts';
import { hintBetween, hintsForN, type PlanExternalSource } from './order-hint.ts';

type TaskDbRow = typeof tasks.$inferSelect;

export async function moveTask(input: MoveTaskInput & { session: SessionScope }): Promise<TaskRow> {
  return withSpan(
    'planner.task.move',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.task_id,
    },
    () => moveTaskImpl(input),
  );
}

async function moveTaskImpl(input: MoveTaskInput & { session: SessionScope }): Promise<TaskRow> {
  let result!: TaskDbRow;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [sourcePlan] = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, existing.plan_id))
        .limit(1);
      if (!sourcePlan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: existing.plan_id,
        });

      requirePermission(input.session, 'planner.task.update', sourcePlan.group_id);

      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      const isCrossPlan = input.new_plan_id !== undefined && input.new_plan_id !== existing.plan_id;

      if (isCrossPlan) {
        await performCrossPlanMove({
          input,
          existing,
          sourcePlan,
          tx,
          setResult: (r) => {
            result = r;
          },
        });
        return;
      }

      // In-plan move (existing behavior).
      const target_bucket_id = input.bucket_id !== undefined ? input.bucket_id : existing.bucket_id;

      // Validate target bucket if provided and not null.
      if (target_bucket_id !== null) {
        const [targetBucket] = await tx
          .select()
          .from(buckets)
          .where(eq(buckets.id, target_bucket_id))
          .limit(1);
        if (!targetBucket || targetBucket.plan_id !== existing.plan_id) {
          throw new PlannerError('VALIDATION', 'Target bucket does not belong to the same plan', {
            bucket_id: target_bucket_id,
          });
        }
        if (targetBucket.deleted_at !== null) {
          throw new PlannerError('VALIDATION', 'Target bucket is deleted', {
            bucket_id: target_bucket_id,
          });
        }
      }

      const bucketCondition =
        target_bucket_id !== null ? eq(tasks.bucket_id, target_bucket_id) : isNull(tasks.bucket_id);
      const orderedByHint = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.plan_id, existing.plan_id), bucketCondition, isNull(tasks.deleted_at)))
        .orderBy(sql`order_hint NULLS LAST`);

      const others = orderedByHint.filter((t) => t.id !== input.task_id);

      let prev: TaskDbRow | undefined;
      let next: TaskDbRow | undefined;
      if (input.before_id !== undefined) {
        const idx = others.findIndex((t) => t.id === input.before_id);
        if (idx === -1)
          throw new PlannerError('VALIDATION', 'before_id not in bucket', {
            before_id: input.before_id,
          });
        next = others[idx];
        prev = idx > 0 ? others[idx - 1] : undefined;
      } else if (input.after_id !== undefined) {
        const idx = others.findIndex((t) => t.id === input.after_id);
        if (idx === -1)
          throw new PlannerError('VALIDATION', 'after_id not in bucket', {
            after_id: input.after_id,
          });
        prev = others[idx];
        next = others[idx + 1];
      } else {
        // Append to tail.
        prev = others[others.length - 1];
      }

      let newHint: string;
      const now = new Date();
      const versionAfter = existing.version + 1;

      const planSource = sourcePlan.external_source as PlanExternalSource;
      try {
        newHint = hintBetween(prev?.order_hint ?? null, next?.order_hint ?? null, planSource);
      } catch {
        // Collision: rebalance the whole target bucket. Every task whose order_hint
        // (or bucket, for the moved one) changes gets its own planner.task.moved
        // event so subscribers see each shift.
        const seq = [...others];
        const insertIdx = next ? seq.indexOf(next) : seq.length;
        seq.splice(insertIdx, 0, existing);
        const fresh = hintsForN(seq.length, planSource);
        const rebalanced: Array<{
          before: TaskDbRow;
          after_hint: string;
          new_bucket: string | null;
        }> = [];
        for (let i = 0; i < seq.length; i++) {
          const t = seq[i];
          const h = fresh[i];
          if (!t || h === undefined) continue;
          const newBucket = t.id === input.task_id ? target_bucket_id : t.bucket_id;
          await tx
            .update(tasks)
            .set({
              bucket_id: newBucket,
              order_hint: h,
              updated_at: now,
              version: t.version + 1,
            })
            .where(eq(tasks.id, t.id));
          rebalanced.push({ before: t, after_hint: h, new_bucket: newBucket });
        }
        const [reread] = await tx.select().from(tasks).where(eq(tasks.id, input.task_id)).limit(1);
        if (!reread) throw new PlannerError('VALIDATION', 'Rebalance read returned no row');
        result = reread;

        for (const r of rebalanced) {
          await emitPlannerTaskMoved({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: r.before.tenant_id,
            task_id: r.before.id,
            plan_id: r.before.plan_id,
            group_id: sourcePlan.group_id,
            before: { bucket_id: r.before.bucket_id, order_hint: r.before.order_hint },
            after: { bucket_id: r.new_bucket, order_hint: r.after_hint },
            version_before: r.before.version,
            version_after: r.before.version + 1,
          });
        }
        return;
      }

      // No-op: same bucket and same hint.
      if (target_bucket_id === existing.bucket_id && newHint === existing.order_hint) {
        result = existing;
        return;
      }

      const [updated] = await tx
        .update(tasks)
        .set({
          bucket_id: target_bucket_id,
          order_hint: newHint,
          updated_at: now,
          version: versionAfter,
        })
        .where(eq(tasks.id, input.task_id))
        .returning();
      if (!updated) throw new PlannerError('VALIDATION', 'Update returned no row');
      result = updated;

      await emitPlannerTaskMoved({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        task_id: existing.id,
        plan_id: existing.plan_id,
        group_id: sourcePlan.group_id,
        before: { bucket_id: existing.bucket_id, order_hint: existing.order_hint },
        after: { bucket_id: target_bucket_id, order_hint: newHint },
        version_before: existing.version,
        version_after: versionAfter,
      });

      // Subscribers that listen for generic updates need an `updated` event too.
      const changed: TaskChangedField[] = ['order_hint'];
      const before: Record<string, unknown> = { order_hint: existing.order_hint };
      const after: Record<string, unknown> = { order_hint: newHint };
      if (target_bucket_id !== existing.bucket_id) {
        changed.push('bucket_id');
        before.bucket_id = existing.bucket_id;
        after.bucket_id = target_bucket_id;
      }
      await emitPlannerTaskUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        task_id: existing.id,
        plan_id: existing.plan_id,
        group_id: sourcePlan.group_id,
        before,
        after,
        changed_fields: changed,
        version_before: existing.version,
        version_after: versionAfter,
      });
    },
  );

  return taskRowToDto(result);
}

type PlanDbRow = typeof plans.$inferSelect;

async function performCrossPlanMove(args: {
  input: MoveTaskInput & { session: SessionScope };
  existing: TaskDbRow;
  sourcePlan: PlanDbRow;
  // biome-ignore lint/suspicious/noExplicitAny: tx is the inner Drizzle transaction handle
  tx: any;
  setResult: (r: TaskDbRow) => void;
}): Promise<void> {
  const { input, existing, sourcePlan, tx, setResult } = args;
  const newPlanId = input.new_plan_id as string;

  // Validate target plan: exists, same tenant, not deleted, user has write
  // permission on its group.
  const [targetPlan] = await tx.select().from(plans).where(eq(plans.id, newPlanId)).limit(1);
  if (!targetPlan)
    throw new PlannerError('NOT_FOUND', 'Target plan not found', { plan_id: newPlanId });
  if (targetPlan.tenant_id !== input.session.tenant_id) {
    throw new PlannerError('CROSS_TENANT', 'Target plan belongs to another tenant', {
      plan_id: newPlanId,
    });
  }
  if (targetPlan.deleted_at !== null) {
    throw new PlannerError('VALIDATION', 'Target plan is deleted', { plan_id: newPlanId });
  }
  requirePermission(input.session, 'planner.task.update', targetPlan.group_id);

  // Resolve target bucket: validate when provided, else pick the target plan's
  // tail bucket (or null when the target plan has no buckets).
  let target_bucket_id: string | null;
  if (input.bucket_id !== undefined && input.bucket_id !== null) {
    const [targetBucket] = await tx
      .select()
      .from(buckets)
      .where(eq(buckets.id, input.bucket_id))
      .limit(1);
    if (!targetBucket || targetBucket.plan_id !== newPlanId) {
      throw new PlannerError('VALIDATION', 'Target bucket does not belong to the target plan', {
        bucket_id: input.bucket_id,
        plan_id: newPlanId,
      });
    }
    if (targetBucket.deleted_at !== null) {
      throw new PlannerError('VALIDATION', 'Target bucket is deleted', {
        bucket_id: input.bucket_id,
      });
    }
    target_bucket_id = targetBucket.id;
  } else if (input.bucket_id === null) {
    target_bucket_id = null;
  } else {
    // Pick the target plan's tail bucket (highest order_hint, NULLS LAST).
    const planBuckets = await tx
      .select()
      .from(buckets)
      .where(and(eq(buckets.plan_id, newPlanId), isNull(buckets.deleted_at)))
      .orderBy(sql`order_hint NULLS LAST`);
    target_bucket_id =
      planBuckets.length > 0 ? (planBuckets[planBuckets.length - 1]?.id ?? null) : null;
  }

  // Append to tail of the target bucket in the target plan.
  const bucketCondition =
    target_bucket_id !== null ? eq(tasks.bucket_id, target_bucket_id) : isNull(tasks.bucket_id);
  const targetOrdered = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.plan_id, newPlanId), bucketCondition, isNull(tasks.deleted_at)))
    .orderBy(sql`order_hint NULLS LAST`);
  const tail = targetOrdered[targetOrdered.length - 1] as TaskDbRow | undefined;

  const targetSource = targetPlan.external_source as PlanExternalSource;
  let newHint: string;
  try {
    newHint = hintBetween(tail?.order_hint ?? null, null, targetSource);
  } catch {
    // Tail collision: rebalance entire target bucket and re-emit moves for
    // every shifted task.
    const seq = [...targetOrdered, existing];
    const fresh = hintsForN(seq.length, targetSource);
    const now = new Date();
    const rebalanced: Array<{
      before: TaskDbRow;
      after_hint: string;
      new_bucket: string | null;
      new_plan_id: string;
    }> = [];
    for (let i = 0; i < seq.length - 1; i++) {
      const t = seq[i];
      const h = fresh[i];
      if (!t || h === undefined) continue;
      await tx
        .update(tasks)
        .set({ order_hint: h, updated_at: now, version: t.version + 1 })
        .where(eq(tasks.id, t.id));
      rebalanced.push({
        before: t,
        after_hint: h,
        new_bucket: t.bucket_id,
        new_plan_id: t.plan_id,
      });
    }
    const finalHint = fresh[seq.length - 1];
    if (finalHint === undefined)
      throw new PlannerError('VALIDATION', 'Rebalance produced no hint for moved task');
    await applyCrossPlanUpdate({
      tx,
      existing,
      newPlanId,
      target_bucket_id,
      newHint: finalHint,
      now,
    });

    const [reread] = await tx.select().from(tasks).where(eq(tasks.id, input.task_id)).limit(1);
    if (!reread) throw new PlannerError('VALIDATION', 'Cross-plan reread returned no row');
    setResult(reread);

    for (const r of rebalanced) {
      await emitPlannerTaskMoved({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: r.before.tenant_id,
        task_id: r.before.id,
        plan_id: r.before.plan_id,
        group_id: targetPlan.group_id,
        before: { bucket_id: r.before.bucket_id, order_hint: r.before.order_hint },
        after: { bucket_id: r.new_bucket, order_hint: r.after_hint },
        version_before: r.before.version,
        version_after: r.before.version + 1,
      });
    }
    await emitCrossPlanMove({
      input,
      existing,
      sourcePlan,
      targetPlan,
      target_bucket_id,
      newHint: finalHint,
      versionAfter: existing.version + 1,
    });
    return;
  }

  const now = new Date();
  const versionAfter = existing.version + 1;
  await applyCrossPlanUpdate({ tx, existing, newPlanId, target_bucket_id, newHint, now });

  const [updated] = await tx.select().from(tasks).where(eq(tasks.id, input.task_id)).limit(1);
  if (!updated) throw new PlannerError('VALIDATION', 'Cross-plan update returned no row');
  setResult(updated);

  await emitCrossPlanMove({
    input,
    existing,
    sourcePlan,
    targetPlan,
    target_bucket_id,
    newHint,
    versionAfter,
  });
}

async function applyCrossPlanUpdate(args: {
  // biome-ignore lint/suspicious/noExplicitAny: tx is the inner Drizzle transaction handle
  tx: any;
  existing: TaskDbRow;
  newPlanId: string;
  target_bucket_id: string | null;
  newHint: string;
  now: Date;
}): Promise<void> {
  const { tx, existing, newPlanId, target_bucket_id, newHint, now } = args;

  // Strip plan-scoped labels. Labels belong to their owning plan
  // (`labels.plan_id`), so any application against the moved task is
  // semantically invalid in the target plan — drop them, matching Microsoft
  // Planner's cross-plan move behavior. Assignees, checklist items,
  // references, and other task-scoped data carry over untouched.
  await tx.delete(taskLabels).where(eq(taskLabels.task_id, existing.id));

  await tx
    .update(tasks)
    .set({
      plan_id: newPlanId,
      bucket_id: target_bucket_id,
      order_hint: newHint,
      updated_at: now,
      version: existing.version + 1,
    })
    .where(eq(tasks.id, existing.id));
}

async function emitCrossPlanMove(args: {
  input: MoveTaskInput & { session: SessionScope };
  existing: TaskDbRow;
  sourcePlan: PlanDbRow;
  targetPlan: PlanDbRow;
  target_bucket_id: string | null;
  newHint: string;
  versionAfter: number;
}): Promise<void> {
  const { input, existing, sourcePlan, targetPlan, target_bucket_id, newHint, versionAfter } = args;

  await emitPlannerTaskMoved({
    actor: { type: 'user', user_id: input.session.user_id },
    tenant_id: existing.tenant_id,
    task_id: existing.id,
    // After the move the canonical plan is the target.
    plan_id: targetPlan.id,
    from_plan_id: sourcePlan.id,
    to_plan_id: targetPlan.id,
    group_id: targetPlan.group_id,
    before: { bucket_id: existing.bucket_id, order_hint: existing.order_hint },
    after: { bucket_id: target_bucket_id, order_hint: newHint },
    version_before: existing.version,
    version_after: versionAfter,
  });

  // Generic update event so non-board subscribers (activity, projections) see
  // the cross-plan transition with the changed plan_id + bucket_id.
  const changed: TaskChangedField[] = ['plan_id', 'bucket_id', 'order_hint'];
  await emitPlannerTaskUpdated({
    actor: { type: 'user', user_id: input.session.user_id },
    tenant_id: existing.tenant_id,
    task_id: existing.id,
    plan_id: targetPlan.id,
    group_id: targetPlan.group_id,
    before: {
      plan_id: sourcePlan.id,
      bucket_id: existing.bucket_id,
      order_hint: existing.order_hint,
    },
    after: {
      plan_id: targetPlan.id,
      bucket_id: target_bucket_id,
      order_hint: newHint,
    },
    changed_fields: changed,
    version_before: existing.version,
    version_after: versionAfter,
  });
}
