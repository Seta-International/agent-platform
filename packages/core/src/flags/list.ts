// packages/core/src/flags/list.ts
import { can } from '@seta/shared-rbac';
import type { SessionScope } from '../session/scope.ts';
import { FlagError } from './apply-feature-flag.ts';
import { getEffectiveFlag } from './cache.ts';
import { getFlagCatalog } from './catalog.ts';
import type { FlagStrategyConfig } from './types.ts';
import { type FeatureFlagUsage, getFeatureFlagUsage } from './usage.ts';

export interface FeatureFlagView {
  key: string;
  description: string;
  enabled_for_all: boolean;
  allowlist_user_ids: string[];
  strategies: FlagStrategyConfig[];
  usage: FeatureFlagUsage;
}

export async function listFeatureFlags(session: SessionScope): Promise<FeatureFlagView[]> {
  if (!can(session, 'core.feature_flag.read')) {
    throw new FlagError('FORBIDDEN', 'Missing permission: core.feature_flag.read');
  }
  const out: FeatureFlagView[] = [];
  for (const def of getFlagCatalog()) {
    const row = await getEffectiveFlag(session.tenant_id, def.key);
    const strategies = row?.strategies ?? [];
    const allow = strategies.find((s) => s.kind === 'member-allowlist');
    out.push({
      key: def.key,
      description: def.description,
      enabled_for_all: strategies.some((s) => s.kind === 'enabled'),
      allowlist_user_ids: Array.isArray(allow?.config?.userIds)
        ? (allow.config.userIds as string[])
        : [],
      strategies,
      usage: await getFeatureFlagUsage(session, def.key),
    });
  }
  return out;
}
