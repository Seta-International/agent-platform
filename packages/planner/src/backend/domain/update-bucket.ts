import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { buckets, plans } from '../../db/schema.ts';
import { emitPlannerBucketUpdated } from '../../events/emit-helpers.ts';
import type { BucketRow, TaskExternalSource } from '../dto.ts';
import type { UpdateBucketPatch } from '../inputs.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type BucketDbRow = typeof buckets.$inferSelect;

export async function updateBucket(input: {
  bucket_id: string;
  expected_version: number;
  patch: UpdateBucketPatch;
  session: SessionScope;
}): Promise<BucketRow> {
  let updated!: BucketDbRow;
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

      const before: Partial<{ name: string }> = {};
      const after: Partial<{ name: string }> = {};
      const setFields: { name?: string; updated_at: Date; version: number } = {
        updated_at: new Date(),
        version: existing.version + 1,
      };

      if (input.patch.name !== undefined && input.patch.name !== existing.name) {
        before.name = existing.name;
        after.name = input.patch.name;
        setFields.name = input.patch.name;
      }

      const [row] = await tx
        .update(buckets)
        .set(setFields)
        .where(eq(buckets.id, input.bucket_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      updated = row;

      await emitPlannerBucketUpdated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        bucket_id: existing.id,
        plan_id: existing.plan_id,
        group_id: plan.group_id,
        before,
        after,
        version_before: existing.version,
        version_after: existing.version + 1,
      });
    },
  );

  return rowToDto(updated);
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
