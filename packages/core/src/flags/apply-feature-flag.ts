// packages/core/src/flags/apply-feature-flag.ts
import { sql } from 'drizzle-orm';
import { coreFeatureFlags } from '../db/schema/index.ts';
import { emit } from '../events/emit.ts';
import { withEmit } from '../events/with-emit.ts';
import { isKnownFlagKey } from './catalog.ts';
import { CORE_FEATURE_FLAG_UPDATED } from './events.ts';
import { getStrategy } from './strategies.ts';
import type { FlagStrategyConfig } from './types.ts';

// core.events.tenant_id is NOT NULL; global-flag updates carry this sentinel in
// the event row. The payload still carries the true tenant_id (null for global).
export const GLOBAL_TENANT = '00000000-0000-0000-0000-000000000000';

export type FlagErrorCode = 'FORBIDDEN' | 'VALIDATION';

export class FlagError extends Error {
  readonly code: FlagErrorCode;
  constructor(code: FlagErrorCode, message: string) {
    super(message);
    this.name = 'FlagError';
    this.code = code;
  }
}

export async function applyFeatureFlag(params: {
  tenantId: string | null;
  key: string;
  strategies: FlagStrategyConfig[];
  actorUserId: string | null;
}): Promise<void> {
  if (!isKnownFlagKey(params.key)) {
    throw new FlagError('VALIDATION', `unknown flag key: ${params.key}`);
  }
  for (const s of params.strategies) {
    if (!getStrategy(s.kind)) {
      throw new FlagError('VALIDATION', `unknown strategy kind: ${s.kind}`);
    }
  }

  const eventTenant = params.tenantId ?? GLOBAL_TENANT;
  await withEmit(
    { actor: { userId: params.actorUserId ?? 'system', tenantId: eventTenant } },
    async (tx) => {
      const base = {
        key: params.key,
        tenant_id: params.tenantId,
        strategies: params.strategies,
        updated_by: params.actorUserId,
        updated_at: new Date(),
      };
      // Branch on null vs tenant: the two partial unique indexes require the
      // matching predicate for ON CONFLICT inference.
      if (params.tenantId === null) {
        await tx
          .insert(coreFeatureFlags)
          .values(base)
          .onConflictDoUpdate({
            target: coreFeatureFlags.key,
            targetWhere: sql`tenant_id IS NULL`,
            set: {
              strategies: params.strategies,
              updated_by: params.actorUserId,
              updated_at: new Date(),
            },
          });
      } else {
        await tx
          .insert(coreFeatureFlags)
          .values(base)
          .onConflictDoUpdate({
            target: [coreFeatureFlags.tenant_id, coreFeatureFlags.key],
            targetWhere: sql`tenant_id IS NOT NULL`,
            set: {
              strategies: params.strategies,
              updated_by: params.actorUserId,
              updated_at: new Date(),
            },
          });
      }

      await emit({
        tenantId: eventTenant,
        aggregateType: 'core.feature_flag',
        aggregateId: params.key,
        eventType: CORE_FEATURE_FLAG_UPDATED,
        eventVersion: 1,
        payload: { tenant_id: params.tenantId, key: params.key },
      });
    },
  );
}
