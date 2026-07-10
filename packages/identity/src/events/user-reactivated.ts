import type { IdentityUserReactivated } from './types.ts';

export const IDENTITY_USER_REACTIVATED = 'identity.user.reactivated' as const;
export const IDENTITY_USER_REACTIVATED_VERSION = 1 as const;

export type IdentityUserReactivatedPayload = IdentityUserReactivated['payload'];
