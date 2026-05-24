import type { IdentityUserDeactivated } from './types.ts';

export const IDENTITY_USER_DEACTIVATED = 'identity.user.deactivated' as const;
export const IDENTITY_USER_DEACTIVATED_VERSION = 1 as const;

export type IdentityUserDeactivatedPayload = IdentityUserDeactivated['payload'];
