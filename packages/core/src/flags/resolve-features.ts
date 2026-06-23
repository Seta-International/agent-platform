// packages/core/src/flags/resolve-features.ts
import { type EvaluationContext, OpenFeature } from '@openfeature/server-sdk';
import { sql } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';
import { coreFeatureFlagExposure } from '../db/schema/index.ts';
import { getFlagCatalog } from './catalog.ts';

export async function resolveFeatures(
  tenantId: string,
  userId: string,
  roles: readonly string[],
): Promise<ReadonlySet<string>> {
  const catalog = getFlagCatalog();
  if (catalog.length === 0) return new Set();

  const client = OpenFeature.getClient();
  const ctx: EvaluationContext = { targetingKey: userId, tenantId, userId, roles: [...roles] };

  const enabled = new Set<string>();
  const now = new Date();
  const rows = [] as {
    flag_key: string;
    tenant_id: string;
    user_id: string;
    result: boolean;
    last_evaluated_at: Date;
  }[];

  for (const def of catalog) {
    const value = await client.getBooleanValue(def.key, false, ctx);
    if (value) enabled.add(def.key);
    rows.push({
      flag_key: def.key,
      tenant_id: tenantId,
      user_id: userId,
      result: value,
      last_evaluated_at: now,
    });
  }

  await coreDb()
    .insert(coreFeatureFlagExposure)
    .values(rows)
    .onConflictDoUpdate({
      target: [coreFeatureFlagExposure.flag_key, coreFeatureFlagExposure.user_id],
      set: {
        result: sql`excluded.result`,
        tenant_id: sql`excluded.tenant_id`,
        last_evaluated_at: sql`excluded.last_evaluated_at`,
      },
    });

  return enabled;
}
