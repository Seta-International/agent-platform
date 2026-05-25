import { eq } from 'drizzle-orm';
import { copilotDb } from './db/index.ts';
import { tenantSettings } from './db/schema.tenant-settings.ts';

export interface TenantSettings {
  dedupWeights: { semantic: number; vector: number; position: number };
  dedupThresholds: { likelyDup: number; maybeDup: number };
  assignmentWeights: { exact: number; vec: number; load: number; tz: number };
  approvalTtlHours: number;
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  dedupWeights: { semantic: 0.55, vector: 0.3, position: 0.15 },
  dedupThresholds: { likelyDup: 0.18, maybeDup: 0.3 },
  assignmentWeights: { exact: 0.4, vec: 0.25, load: 0.25, tz: 0.1 },
  approvalTtlHours: 72,
};

export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const rows = await copilotDb()
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  const [r] = rows;
  if (!r) return DEFAULT_TENANT_SETTINGS;
  return {
    dedupWeights: r.dedupWeights,
    dedupThresholds: r.dedupThresholds,
    assignmentWeights: r.assignmentWeights,
    approvalTtlHours: r.approvalTtlHours,
  };
}
