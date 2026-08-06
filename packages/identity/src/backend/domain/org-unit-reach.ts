// rbac: system-only — read-only tree expansion invoked while building the actor
// session itself (Task 7); no caller session exists yet to gate on.
import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { orgUnitProjection } from '../db/schema.ts';

export function expandFromTree(
  rows: ReadonlyArray<{ org_unit_id: string; parent_id: string | null }>,
  rootIds: readonly string[],
): Record<string, string[]> {
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parent_id) continue;
    children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r.org_unit_id]);
  }
  const out: Record<string, string[]> = {};
  for (const root of rootIds) {
    const seen = new Set<string>([root]);
    const queue = [root];
    while (queue.length) {
      const next = queue.shift() as string;
      for (const child of children.get(next) ?? []) {
        if (!seen.has(child)) {
          seen.add(child);
          queue.push(child);
        }
      }
    }
    out[root] = [...seen];
  }
  return out;
}

export async function expandOrgUnits(
  tenantId: string,
  rootIds: readonly string[],
): Promise<Record<string, string[]>> {
  if (rootIds.length === 0) return {};
  const rows = await identityDb()
    .select({ org_unit_id: orgUnitProjection.org_unit_id, parent_id: orgUnitProjection.parent_id })
    .from(orgUnitProjection)
    .where(and(eq(orgUnitProjection.tenant_id, tenantId), isNull(orgUnitProjection.deleted_at)));
  return expandFromTree(rows, rootIds);
}
