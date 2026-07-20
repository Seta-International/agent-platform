import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { ensureKpiNormSeeded } from '../domain/kpi-norm.ts';

// Local event contract — no import from @seta/core/events for this specific event type, mirroring
// worker-projection.ts's module-boundary rationale (pm subscribes to a foreign event by raw
// string + local payload shape, not a shared import).
export const CORE_TENANT_CREATED = 'core.tenant.created';

export interface CoreTenantCreated {
  tenantId: string;
  name: string;
  slug: string;
}

/** Every tenant gets the fixed KPI Norm library (SETA-08-SOP-001, 44 metrics) — this is
 * reference data, not something a tenant creates, so it's seeded here rather than via CRUD.
 * Idempotent (`ensureKpiNormSeeded` uses onConflictDoNothing), so at-least-once delivery is safe. */
export const kpiNormSeedOnTenantCreated: SubscriberDef = {
  subscription: 'pm.kpi-norm-seed.tenant-created',
  event: CORE_TENANT_CREATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const { tenantId } = (event as DomainEvent<CoreTenantCreated>).payload;
    await ensureKpiNormSeeded(ctx.tx, tenantId);
  },
};
