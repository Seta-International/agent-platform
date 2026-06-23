// packages/core/src/flags/subscriber.ts
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { evictHotAll, evictHotByTenant } from '../session/scope.ts';
import { evictTenantFlags, resetFlagCache } from './cache.ts';
import { CORE_FEATURE_FLAG_UPDATED } from './events.ts';

interface FeatureFlagUpdatedPayload {
  tenant_id: string | null;
  key: string;
}

export const featureFlagCacheInvalidateSubscriber: SubscriberDef = {
  subscription: 'core.feature-flag-cache-invalidate',
  event: CORE_FEATURE_FLAG_UPDATED,
  eventVersion: 1,
  handler: async (event) => {
    const { tenant_id } = (event as DomainEvent<FeatureFlagUpdatedPayload>).payload;
    if (tenant_id === null) {
      // Global default changed → every tenant's resolution is affected.
      evictHotAll();
      resetFlagCache();
    } else {
      evictTenantFlags(tenant_id);
      evictHotByTenant(tenant_id);
    }
  },
};
