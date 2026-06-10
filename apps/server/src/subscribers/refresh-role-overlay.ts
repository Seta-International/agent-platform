import { invalidateTenantSessions, type OverlayStore } from '@seta/core';
import {
  IDENTITY_ROLE_PERMISSIONS_CHANGED,
  IDENTITY_ROLE_PERMISSIONS_CHANGED_VERSION,
  type IdentityRolePermissionsChangedPayload,
} from '@seta/identity';
import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';

/**
 * When a tenant admin edits a role's permission overlay, the in-memory overlay
 * projection used by the permission resolver must reload for that tenant, and
 * every cached session scope in the tenant must be invalidated so the next
 * request rebuilds permissions against the new overlay. apps/server owns both
 * the overlay-store instance and invalidateTenantSessions, so the wiring lives
 * here rather than in core/register (which stays store-agnostic). Idempotent:
 * refresh + invalidate are safe to repeat under at-least-once delivery.
 */
export function refreshRoleOverlaySubscriber(deps: {
  overlayStore: OverlayStore;
}): SubscriberDef<IdentityRolePermissionsChangedPayload> {
  return {
    subscription: 'apps.server.refresh-role-overlay',
    event: IDENTITY_ROLE_PERMISSIONS_CHANGED,
    eventVersion: IDENTITY_ROLE_PERMISSIONS_CHANGED_VERSION,
    handler: async (
      event: DomainEvent<IdentityRolePermissionsChangedPayload>,
      _ctx: SubscriberCtx,
    ) => {
      const { tenant_id } = event.payload;
      await deps.overlayStore.refresh(tenant_id);
      await invalidateTenantSessions(tenant_id);
    },
  };
}
