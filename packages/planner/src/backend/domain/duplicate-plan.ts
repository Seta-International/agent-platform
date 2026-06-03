import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { requestNotification } from '@seta/notifications';
import { and, eq, isNull } from 'drizzle-orm';
import { emitPlannerBucketCreated, emitPlannerPlanCreated } from '../../events/emit-helpers.ts';
import { buckets, groups, plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { resolveGroupMemberIds } from './recipients.ts';

type PlanDbRow = typeof plans.$inferSelect;

export async function duplicatePlan(input: {
  plan_id: string;
  session: SessionScope;
}): Promise<PlanRow> {
  let inserted!: PlanDbRow;

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [source] = await tx
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.plan_id), isNull(plans.deleted_at)))
        .limit(1);
      if (!source)
        throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
      if (source.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Plan belongs to another tenant', {
          plan_id: input.plan_id,
        });
      }

      requirePermission(input.session, 'planner.plan.create', source.group_id);

      const [group] = await tx
        .select({ name: groups.name })
        .from(groups)
        .where(eq(groups.id, source.group_id))
        .limit(1);

      const newName = `${source.name} (copy)`;

      const [row] = await tx
        .insert(plans)
        .values({
          tenant_id: source.tenant_id,
          group_id: source.group_id,
          name: newName,
          created_by: input.session.user_id,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      const { eventId } = await emitPlannerPlanCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: source.tenant_id,
        after: {
          plan_id: row.id,
          group_id: row.group_id,
          name: row.name,
          created_by: row.created_by,
        },
      });

      // Copy non-deleted buckets (name + order_hint only; no tasks).
      const sourceBuckets = await tx
        .select()
        .from(buckets)
        .where(and(eq(buckets.plan_id, source.id), isNull(buckets.deleted_at)));

      for (const b of sourceBuckets) {
        const [newBucket] = await tx
          .insert(buckets)
          .values({
            tenant_id: source.tenant_id,
            plan_id: row.id,
            name: b.name,
            order_hint: b.order_hint,
          })
          .returning();
        if (!newBucket) continue;

        await emitPlannerBucketCreated({
          actor: { type: 'user', user_id: input.session.user_id },
          tenant_id: source.tenant_id,
          after: {
            bucket_id: newBucket.id,
            plan_id: row.id,
            group_id: source.group_id,
            name: newBucket.name,
            order_hint: newBucket.order_hint,
          },
        });
      }

      const memberIds = await resolveGroupMemberIds(source.tenant_id, source.group_id, tx);
      const recipients = memberIds.filter((u) => u !== input.session.user_id);
      await requestNotification({
        tenant_id: source.tenant_id,
        event_type: 'planner.plan.created',
        user_ids: recipients,
        source_event_id: eventId,
        payload: {
          title: 'Plan duplicated',
          body: `Plan "${newName}" was created in "${group?.name ?? ''}"`,
          plan_id: row.id,
          group_id: source.group_id,
          actor: { user_id: input.session.user_id, name: input.session.user_id },
        },
      });
    },
  );

  return rowToDto(inserted);
}

function rowToDto(row: PlanDbRow): PlanRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    group_id: row.group_id,
    name: row.name,
    category_descriptions: (row.category_descriptions ?? {}) as Record<string, string>,
    external_source: row.external_source as 'native' | 'm365',
    external_id: row.external_id,
    external_etag: row.external_etag,
    external_synced_at: row.external_synced_at ? row.external_synced_at.toISOString() : null,
    sync_status: row.sync_status as PlanRow['sync_status'],
    last_error: row.last_error,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    archived_at: row.archived_at ? row.archived_at.toISOString() : null,
    version: row.version,
  };
}
