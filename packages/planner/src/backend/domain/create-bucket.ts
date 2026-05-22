import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { buckets, plans } from '../../db/schema.ts';
import { emitPlannerBucketCreated } from '../../events/emit-helpers.ts';
import type { BucketRow, TaskExternalSource } from '../dto.ts';
import type { CreateBucketInput } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { hintBetween, type PlanExternalSource } from './order-hint.ts';

type BucketDbRow = typeof buckets.$inferSelect;

export async function createBucket(
  input: CreateBucketInput & { session: SessionScope },
): Promise<BucketRow> {
  let inserted!: BucketDbRow;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [plan] = await tx
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
        .limit(1);
      if (!plan) throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
      if (plan.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
          plan_id: input.plan_id,
        });
      }

      requirePermission(input.session, 'planner.bucket.create', plan.group_id);

      const existingBuckets = await tx
        .select()
        .from(buckets)
        .where(and(eq(buckets.plan_id, input.plan_id), isNull(buckets.deleted_at)))
        .orderBy(sql`order_hint NULLS LAST`);

      const planSource = plan.external_source as PlanExternalSource;
      let orderHint: string;
      if (input.after_bucket_id !== undefined) {
        const afterIdx = existingBuckets.findIndex((b) => b.id === input.after_bucket_id);
        if (afterIdx === -1) {
          throw new PlannerError('VALIDATION', 'after_bucket_id not in plan', {
            after_bucket_id: input.after_bucket_id,
          });
        }
        // biome-ignore lint/style/noNonNullAssertion: index verified above
        const afterBucket = existingBuckets[afterIdx]!;
        const nextBucket = existingBuckets[afterIdx + 1];
        orderHint = hintBetween(afterBucket.order_hint, nextBucket?.order_hint ?? null, planSource);
      } else {
        const lastBucket = existingBuckets[existingBuckets.length - 1];
        orderHint = hintBetween(lastBucket?.order_hint ?? null, null, planSource);
      }

      const [row] = await tx
        .insert(buckets)
        .values({
          tenant_id: plan.tenant_id,
          plan_id: input.plan_id,
          name: input.name,
          order_hint: orderHint,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      await emitPlannerBucketCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: plan.tenant_id,
        after: {
          bucket_id: row.id,
          plan_id: input.plan_id,
          group_id: plan.group_id,
          name: row.name,
          order_hint: row.order_hint,
        },
      });
    },
  );

  return rowToDto(inserted);
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
