import { eq, inArray } from 'drizzle-orm';
import type { plannerDb } from '../db/index.ts';
import { planCategories, type plans } from '../db/schema.ts';
import type { PlanRow } from '../dto.ts';

type PlanDbRow = typeof plans.$inferSelect;
type PlannerDbLike = ReturnType<typeof plannerDb>;

/** Build the M365-style keyed category map (`category<slot>` -> name) for one plan. */
export async function fetchCategoryDescriptions(
  db: PlannerDbLike,
  planId: string,
): Promise<Record<string, string>> {
  const rows = await db
    .select({ slot: planCategories.slot, name: planCategories.name })
    .from(planCategories)
    .where(eq(planCategories.plan_id, planId));
  const result: Record<string, string> = {};
  for (const r of rows) result[`category${r.slot}`] = r.name;
  return result;
}

/** Batch variant for list endpoints — one query for all plan ids. */
export async function fetchCategoryDescriptionsMany(
  db: PlannerDbLike,
  planIds: string[],
): Promise<Map<string, Record<string, string>>> {
  const byPlan = new Map<string, Record<string, string>>();
  if (planIds.length === 0) return byPlan;
  const rows = await db
    .select({
      plan_id: planCategories.plan_id,
      slot: planCategories.slot,
      name: planCategories.name,
    })
    .from(planCategories)
    .where(inArray(planCategories.plan_id, planIds));
  for (const r of rows) {
    const map = byPlan.get(r.plan_id) ?? {};
    map[`category${r.slot}`] = r.name;
    byPlan.set(r.plan_id, map);
  }
  return byPlan;
}

export function planRowToDto(
  row: PlanDbRow,
  categoryDescriptions: Record<string, string>,
): PlanRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    group_id: row.group_id,
    name: row.name,
    category_descriptions: categoryDescriptions,
    external_source: row.external_source as PlanRow['external_source'],
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
