import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { buckets, plans } from '../../db/schema.ts';
import { emitPlannerBucketUpdated } from '../../events/emit-helpers.ts';
import type { BucketRow, TaskExternalSource } from '../dto.ts';
import type { MoveBucketInput } from '../inputs.ts';
import { withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { hintBetween, hintsForN, type PlanExternalSource } from './order-hint.ts';

type BucketDbRow = typeof buckets.$inferSelect;

export async function moveBucket(
  input: MoveBucketInput & { session: SessionScope },
): Promise<BucketRow> {
  return withSpan(
    'planner.bucket.move',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.bucket_id': input.bucket_id,
      'planner.plan_id': input.plan_id,
    },
    () => moveBucketImpl(input),
  );
}

async function moveBucketImpl(
  input: MoveBucketInput & { session: SessionScope },
): Promise<BucketRow> {
  let result!: BucketDbRow;
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
        .from(buckets)
        .where(and(eq(buckets.id, input.bucket_id), isNull(buckets.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Bucket not found', { bucket_id: input.bucket_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Bucket belongs to another tenant', {
          bucket_id: input.bucket_id,
        });
      }
      if (existing.plan_id !== input.plan_id) {
        throw new PlannerError('VALIDATION', 'Bucket does not belong to plan', {
          bucket_id: input.bucket_id,
          plan_id: input.plan_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, input.plan_id)).limit(1);
      if (!plan) throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });

      requirePermission(input.session, 'planner.bucket.update', plan.group_id);

      const ordered = await tx
        .select()
        .from(buckets)
        .where(and(eq(buckets.plan_id, input.plan_id), isNull(buckets.deleted_at)))
        .orderBy(sql`order_hint NULLS LAST`);

      const others = ordered.filter((b) => b.id !== existing.id);

      let prev: BucketDbRow | undefined;
      let next: BucketDbRow | undefined;
      if (input.before_id !== undefined) {
        const idx = others.findIndex((b) => b.id === input.before_id);
        if (idx === -1)
          throw new PlannerError('VALIDATION', 'before_id not in plan', {
            before_id: input.before_id,
          });
        next = others[idx];
        prev = idx > 0 ? others[idx - 1] : undefined;
      } else if (input.after_id !== undefined) {
        const idx = others.findIndex((b) => b.id === input.after_id);
        if (idx === -1)
          throw new PlannerError('VALIDATION', 'after_id not in plan', {
            after_id: input.after_id,
          });
        prev = others[idx];
        next = others[idx + 1];
      } else {
        prev = others[others.length - 1];
      }

      let newHint: string;
      const now = new Date();
      const versionAfter = existing.version + 1;

      const planSource = plan.external_source as PlanExternalSource;
      try {
        newHint = hintBetween(prev?.order_hint ?? null, next?.order_hint ?? null, planSource);
      } catch {
        const seq = [...others];
        const insertIdx = next ? seq.indexOf(next) : seq.length;
        seq.splice(insertIdx, 0, existing);
        const fresh = hintsForN(seq.length, planSource);
        for (let i = 0; i < seq.length; i++) {
          const b = seq[i];
          const h = fresh[i];
          if (!b || h === undefined) continue;
          await tx
            .update(buckets)
            .set({ order_hint: h, updated_at: now, version: b.version + 1 })
            .where(eq(buckets.id, b.id));
        }
        const [reread] = await tx
          .select()
          .from(buckets)
          .where(eq(buckets.id, existing.id))
          .limit(1);
        if (!reread) throw new PlannerError('VALIDATION', 'Rebalance read returned no row');
        result = reread;

        await emitPlannerBucketUpdated({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: existing.tenant_id,
          bucket_id: existing.id,
          plan_id: existing.plan_id,
          group_id: plan.group_id,
          before: { order_hint: existing.order_hint },
          after: { order_hint: result.order_hint },
          version_before: existing.version,
          version_after: result.version,
        });
        return;
      }

      if (newHint === existing.order_hint) {
        result = existing;
        return;
      }

      const [updated] = await tx
        .update(buckets)
        .set({ order_hint: newHint, updated_at: now, version: versionAfter })
        .where(eq(buckets.id, existing.id))
        .returning();
      if (!updated) throw new PlannerError('VALIDATION', 'Update returned no row');
      result = updated;

      await emitPlannerBucketUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        bucket_id: existing.id,
        plan_id: existing.plan_id,
        group_id: plan.group_id,
        before: { order_hint: existing.order_hint },
        after: { order_hint: newHint },
        version_before: existing.version,
        version_after: versionAfter,
      });
    },
  );

  return rowToDto(result);
}

function rowToDto(row: BucketDbRow): BucketRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    name: row.name,
    order_hint: row.order_hint,
    external_source: row.external_source as TaskExternalSource,
    external_id: row.external_id,
    external_etag: row.external_etag,
    external_synced_at: row.external_synced_at ? row.external_synced_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    version: row.version,
  };
}
