// packages/core/src/flags/set-feature-flag.ts
import { can } from '@seta/shared-rbac';
import type { SessionScope } from '../session/scope.ts';
import { applyFeatureFlag, FlagError } from './apply-feature-flag.ts';
import type { FlagStrategyConfig } from './types.ts';

export async function setFeatureFlag(
  session: SessionScope,
  input: { key: string; strategies: FlagStrategyConfig[] },
): Promise<void> {
  if (!can(session, 'core.feature_flag.write')) {
    throw new FlagError('FORBIDDEN', 'Missing permission: core.feature_flag.write');
  }
  await applyFeatureFlag({
    tenantId: session.tenant_id,
    key: input.key,
    strategies: input.strategies,
    actorUserId: session.user_id,
  });
}
