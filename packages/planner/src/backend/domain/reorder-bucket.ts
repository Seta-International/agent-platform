import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { buckets, plans } from '../../db/schema.ts';
import { emitPlannerBucketUpdated } from '../../events/emit-helpers.ts';
import type { BucketRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { needsRebalance, placeAfter, rebalancedOrders } from '../sort-order.ts';

type BucketDbRow = typeof buckets.$inferSelect;

export async function reorderBucket(input: {
  bucket_id: string;
  expected_version: number;
  after_bucket_id?: string;
  session: SessionScope;
}): Promise<BucketRow> {
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

      const [plan] = await tx.select().from(plans).where(eq(plans.id, existing.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: existing.plan_id,
        });

      requirePermission(input.session, 'planner.bucket.update', plan.group_id);

      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      // No-op: moving to current position.
      if (input.after_bucket_id === input.bucket_id) {
        result = existing;
        return;
      }

      const planBuckets = await tx
        .select()
        .from(buckets)
        .where(and(eq(buckets.plan_id, existing.plan_id), isNull(buckets.deleted_at)))
        .orderBy(asc(buckets.sort_order));

      // Compute target sort_order excluding the bucket being moved.
      const otherBuckets = planBuckets.filter((b) => b.id !== input.bucket_id);

      let afterSortOrder: number | undefined;
      let nextSortOrder: number | undefined;

      if (input.after_bucket_id === undefined) {
        // Move to first position.
        afterSortOrder = undefined;
        nextSortOrder = otherBuckets[0]?.sort_order;
      } else {
        const afterIdx = otherBuckets.findIndex((b) => b.id === input.after_bucket_id);
        if (afterIdx === -1) {
          throw new PlannerError('VALIDATION', 'after_bucket_id not in plan', {
            after_bucket_id: input.after_bucket_id,
          });
        }
        // biome-ignore lint/style/noNonNullAssertion: afterIdx was verified !== -1 above
        afterSortOrder = otherBuckets[afterIdx]!.sort_order;
        nextSortOrder = otherBuckets[afterIdx + 1]?.sort_order;
      }

      const targetSortOrder = placeAfter(afterSortOrder, nextSortOrder);

      // Check if we need a full rebalance.
      const gapIsSmall =
        (afterSortOrder !== undefined && needsRebalance(afterSortOrder, targetSortOrder)) ||
        (nextSortOrder !== undefined && needsRebalance(targetSortOrder, nextSortOrder));

      if (gapIsSmall) {
        // Build the new ordered list with the bucket placed correctly.
        const reordered: BucketDbRow[] = [];
        if (input.after_bucket_id === undefined) {
          reordered.push(existing);
          reordered.push(...otherBuckets);
        } else {
          const afterIdx = otherBuckets.findIndex((b) => b.id === input.after_bucket_id);
          reordered.push(...otherBuckets.slice(0, afterIdx + 1));
          reordered.push(existing);
          reordered.push(...otherBuckets.slice(afterIdx + 1));
        }

        const freshOrders = rebalancedOrders(reordered.length);
        const now = new Date();

        for (let i = 0; i < reordered.length; i++) {
          // biome-ignore lint/style/noNonNullAssertion: loop index is within bounds of reordered and freshOrders
          const bucket = reordered[i]!;
          // biome-ignore lint/style/noNonNullAssertion: freshOrders has same length as reordered
          const newOrder = freshOrders[i]!;
          const versionAfter = bucket.version + 1;

          const [updated] = await tx
            .update(buckets)
            .set({ sort_order: newOrder, updated_at: now, version: versionAfter })
            .where(eq(buckets.id, bucket.id))
            .returning();
          if (!updated) throw new PlannerError('VALIDATION', 'Rebalance update returned no row');

          if (bucket.id === input.bucket_id) {
            result = updated;
          }

          await emitPlannerBucketUpdated({
            actor: { type: 'user', user_id: input.session.user_id },
            tenant_id: existing.tenant_id,
            bucket_id: bucket.id,
            plan_id: existing.plan_id,
            group_id: plan.group_id,
            before: { sort_order: bucket.sort_order },
            after: { sort_order: newOrder },
            version_before: bucket.version,
            version_after: versionAfter,
          });
        }
      } else {
        // Normal case: update just this bucket.
        const versionAfter = existing.version + 1;
        const [updated] = await tx
          .update(buckets)
          .set({ sort_order: targetSortOrder, updated_at: new Date(), version: versionAfter })
          .where(eq(buckets.id, input.bucket_id))
          .returning();
        if (!updated) throw new PlannerError('VALIDATION', 'Update returned no row');
        result = updated;

        await emitPlannerBucketUpdated({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: existing.tenant_id,
          bucket_id: existing.id,
          plan_id: existing.plan_id,
          group_id: plan.group_id,
          before: { sort_order: existing.sort_order },
          after: { sort_order: targetSortOrder },
          version_before: existing.version,
          version_after: versionAfter,
        });
      }
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
    sort_order: row.sort_order,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    version: row.version,
  };
}
