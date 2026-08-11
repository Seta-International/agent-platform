import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { ensurePerformanceGroups } from '../domain/ensure-performance-groups.ts';

export const CORE_TENANT_CREATED = 'core.tenant.created';

export interface CoreTenantCreated {
  tenantId: string;
  name: string;
  slug: string;
}

/** Seed fixed evaluation groups when a tenant is created (FUT-778). */
export const performanceGroupsSeedOnTenantCreated: SubscriberDef = {
  subscription: 'people.performance-groups-seed.tenant-created',
  event: CORE_TENANT_CREATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const { tenantId } = (event as DomainEvent<CoreTenantCreated>).payload;
    await ensurePerformanceGroups(
      ctx.tx as Parameters<typeof ensurePerformanceGroups>[0],
      tenantId,
    );
  },
};
