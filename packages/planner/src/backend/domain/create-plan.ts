import type { SessionScope } from '@seta/core';
import { requestNotification } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { groups, plans } from '../../db/schema.ts';
import { emitPlannerPlanCreated } from '../../events/emit-helpers.ts';
import type { PlanRow } from '../dto.ts';
import type { CreatePlanInput } from '../inputs.ts';
import { resolveGroupMemberIds } from '../notifications/recipients.ts';
import { PlannerError, requirePermission } from '../rbac.ts';

type PlanDbRow = typeof plans.$inferSelect;

export async function createPlan(
  input: CreatePlanInput & { session: SessionScope },
): Promise<PlanRow> {
  let inserted!: PlanDbRow;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [group] = await tx
        .select()
        .from(groups)
        .where(and(eq(groups.id, input.group_id), isNull(groups.deleted_at)))
        .limit(1);
      if (!group)
        throw new PlannerError('NOT_FOUND', 'Group not found', { group_id: input.group_id });
      if (group.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Group belongs to another tenant', {
          group_id: input.group_id,
        });
      }

      requirePermission(input.session, 'planner.plan.create', input.group_id);

      const [row] = await tx
        .insert(plans)
        .values({
          tenant_id: group.tenant_id,
          group_id: input.group_id,
          name: input.name,
          created_by: input.session.user_id,
        })
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Insert returned no row');
      inserted = row;

      const { eventId } = await emitPlannerPlanCreated({
        actor: { type: 'user', user_id: input.session.user_id },
        tenant_id: group.tenant_id,
        after: {
          plan_id: row.id,
          group_id: row.group_id,
          name: row.name,
          created_by: row.created_by,
        },
      });

      const memberIds = await resolveGroupMemberIds(input.session.tenant_id, input.group_id, tx);
      const recipients = memberIds.filter((u) => u !== input.session.user_id);
      await requestNotification({
        tenant_id: group.tenant_id,
        event_type: 'planner.plan.created',
        user_ids: recipients,
        source_event_id: eventId,
        payload: {
          title: 'Plan created',
          body: `New plan "${row.name}" was created in "${group.name}"`,
          plan_id: row.id,
          group_id: input.group_id,
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
    version: row.version,
  };
}
