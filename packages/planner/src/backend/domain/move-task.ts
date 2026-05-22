import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { buckets, plans, tasks } from '../../db/schema.ts';
import { emitPlannerTaskMoved, emitPlannerTaskUpdated } from '../../events/emit-helpers.ts';
import type { TaskChangedField } from '../../events/types.ts';
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

      const [plan] = await tx.select().from(plans).where(eq(plans.id, existing.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: existing.plan_id,
        });

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

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

      const planSource = plan.external_source as PlanExternalSource;
      try {
        newHint = hintBetween(prev?.order_hint ?? null, next?.order_hint ?? null, planSource);
      } catch {
        // Collision: rebalance the whole target bucket.
        const seq = [...others];
        const insertIdx = next ? seq.indexOf(next) : seq.length;
        seq.splice(insertIdx, 0, existing);
        const fresh = hintsForN(seq.length, planSource);
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
        }
        const [reread] = await tx.select().from(tasks).where(eq(tasks.id, input.task_id)).limit(1);
        if (!reread) throw new PlannerError('VALIDATION', 'Rebalance read returned no row');
        result = reread;

        await emitPlannerTaskMoved({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: existing.tenant_id,
          task_id: existing.id,
          plan_id: existing.plan_id,
          group_id: plan.group_id,
          before: { bucket_id: existing.bucket_id, order_hint: existing.order_hint },
          after: { bucket_id: result.bucket_id, order_hint: result.order_hint },
          version_before: existing.version,
          version_after: result.version,
        });
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
        group_id: plan.group_id,
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
        group_id: plan.group_id,
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
