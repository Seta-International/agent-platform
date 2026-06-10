import type { IdentityRolePermissionsChanged } from './types.ts';

export const IDENTITY_ROLE_PERMISSIONS_CHANGED = 'identity.role_permissions.changed' as const;
export const IDENTITY_ROLE_PERMISSIONS_CHANGED_VERSION = 1 as const;

export type IdentityRolePermissionsChangedPayload = IdentityRolePermissionsChanged['payload'];
