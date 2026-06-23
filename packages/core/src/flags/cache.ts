// packages/core/src/flags/cache.ts
import { eq, isNull } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';
import { coreDb } from '../db/client.ts';
import { coreFeatureFlags } from '../db/schema/index.ts';
import type { FlagRow } from './types.ts';

const FIVE_MIN = 1000 * 60 * 5;
const tenantCache = new LRUCache<string, Map<string, FlagRow>>({ max: 5_000, ttl: FIVE_MIN });
let globalCache: Map<string, FlagRow> | null = null;

function toRow(r: typeof coreFeatureFlags.$inferSelect): FlagRow {
  return { key: r.key, tenant_id: r.tenant_id, strategies: r.strategies };
}

async function loadTenant(tenantId: string): Promise<Map<string, FlagRow>> {
  const rows = await coreDb()
    .select()
    .from(coreFeatureFlags)
    .where(eq(coreFeatureFlags.tenant_id, tenantId));
  const map = new Map<string, FlagRow>();
  for (const r of rows) map.set(r.key, toRow(r));
  tenantCache.set(tenantId, map);
  return map;
}

async function loadGlobal(): Promise<Map<string, FlagRow>> {
  const rows = await coreDb()
    .select()
    .from(coreFeatureFlags)
    .where(isNull(coreFeatureFlags.tenant_id));
  const map = new Map<string, FlagRow>();
  for (const r of rows) map.set(r.key, toRow(r));
  globalCache = map;
  return map;
}

export async function getEffectiveFlag(
  tenantId: string,
  key: string,
): Promise<FlagRow | undefined> {
  const tenant = tenantCache.get(tenantId) ?? (await loadTenant(tenantId));
  const hit = tenant.get(key);
  if (hit) return hit;
  const global = globalCache ?? (await loadGlobal());
  return global.get(key);
}

export function evictTenantFlags(tenantId: string): void {
  tenantCache.delete(tenantId);
}

export function resetFlagCache(): void {
  tenantCache.clear();
  globalCache = null;
}
