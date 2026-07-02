import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import type { IdentityPermission } from './generated/rbac.ts';

export type { IdentityPermission } from './generated/rbac.ts';

// biome-ignore lint/style/noNonNullAssertion: 'identity' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const identityRbac = inventoryToManifests(INVENTORY).find((m) => m.module === 'identity')!;

export const A2_PERMISSIONS = [
  'identity.sso.read',
  'identity.sso.update',
  'identity.user.change_email',
  'identity.profile.update',
] as const satisfies readonly IdentityPermission[];

export type A2Permission = (typeof A2_PERMISSIONS)[number];
