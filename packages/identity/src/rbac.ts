import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import type { IdentityPermission } from './generated/rbac.ts';

export type { IdentityPermission } from './generated/rbac.ts';

// biome-ignore lint/style/noNonNullAssertion: 'identity' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const identityRbac = inventoryToManifests(INVENTORY).find((m) => m.module === 'identity')!;

export const A2_PERMISSIONS = [
  'identity.sso.read',
  'identity.sso.write',
  'identity.user.email.change',
  'identity.user.write.self',
] as const satisfies readonly IdentityPermission[];

export type A2Permission = (typeof A2_PERMISSIONS)[number];
