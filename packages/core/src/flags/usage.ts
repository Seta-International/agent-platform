// packages/core/src/flags/usage.ts
import { can } from '@seta/shared-rbac';
import { and, eq, sql } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';
import { coreFeatureFlagExposure } from '../db/schema/index.ts';
import type { SessionScope } from '../session/scope.ts';
import { FlagError } from './apply-feature-flag.ts';

const INACTIVE_AFTER_DAYS = 30;

export interface FeatureFlagUsage {
  flag_key: string;
  adoption_count: number;
  total_evaluated: number;
  adoption_pct: number;
  last_evaluated_at: string | null;
  health: 'active' | 'inactive';
}

export async function getFeatureFlagUsage(
  session: SessionScope,
  key: string,
): Promise<FeatureFlagUsage> {
  if (!can(session, 'core.feature_flag.read')) {
    throw new FlagError('FORBIDDEN', 'Missing permission: core.feature_flag.read');
  }
  const [agg] = await coreDb()
    .select({
      adoption: sql<number>`count(distinct ${coreFeatureFlagExposure.user_id}) filter (where ${coreFeatureFlagExposure.result})`,
      total: sql<number>`count(distinct ${coreFeatureFlagExposure.user_id})`,
      last: sql<string | null>`max(${coreFeatureFlagExposure.last_evaluated_at})`,
    })
    .from(coreFeatureFlagExposure)
    .where(
      and(
        eq(coreFeatureFlagExposure.flag_key, key),
        eq(coreFeatureFlagExposure.tenant_id, session.tenant_id),
      ),
    );

  const adoption = Number(agg?.adoption ?? 0);
  const total = Number(agg?.total ?? 0);
  const last = agg?.last ?? null;
  const activeCutoff = Date.now() - INACTIVE_AFTER_DAYS * 86_400_000;
  const health: 'active' | 'inactive' =
    last && new Date(last).getTime() >= activeCutoff ? 'active' : 'inactive';

  return {
    flag_key: key,
    adoption_count: adoption,
    total_evaluated: total,
    adoption_pct: total === 0 ? 0 : Math.round((adoption / total) * 100),
    last_evaluated_at: last,
    health,
  };
}
