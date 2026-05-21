import type { SessionScope } from '@seta/core';
import { eq } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { plans } from '../../db/schema.ts';
import type { PlanRow, TaskExternalSource } from '../dto.ts';
import type { SetCategoryDescriptionsInput } from '../inputs.ts';
import { PlannerError } from '../rbac.ts';
import { attachLabelToCategorySlot } from './attach-label-to-category-slot.ts';
import { setCategoryDescription } from './set-category-description.ts';

type PlanDbRow = typeof plans.$inferSelect;

function rowToDto(row: PlanDbRow): PlanRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    group_id: row.group_id,
    name: row.name,
    category_descriptions: (row.category_descriptions ?? {}) as Record<string, string>,
    external_source: row.external_source as TaskExternalSource,
    external_id: row.external_id,
    external_etag: row.external_etag,
    external_synced_at: row.external_synced_at?.toISOString() ?? null,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at?.toISOString() ?? null,
    version: row.version,
  };
}

export async function setCategoryDescriptions(
  input: SetCategoryDescriptionsInput & { session: SessionScope },
): Promise<PlanRow> {
  for (const [slotStr, entry] of Object.entries(input.slots)) {
    const slot = Number(slotStr);
    await setCategoryDescription({
      plan_id: input.plan_id,
      slot,
      name: entry.name,
      session: input.session,
    });
    if (entry.label_id !== undefined && entry.label_id !== null) {
      await attachLabelToCategorySlot({
        plan_id: input.plan_id,
        label_id: entry.label_id,
        slot,
        session: input.session,
      });
    }
  }

  const db = plannerDb();
  const [row] = await db.select().from(plans).where(eq(plans.id, input.plan_id)).limit(1);
  if (!row) {
    throw new PlannerError('NOT_FOUND', 'Plan not found', { plan_id: input.plan_id });
  }
  return rowToDto(row);
}
