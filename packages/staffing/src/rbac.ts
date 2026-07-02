import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { STAFFING_PERMISSIONS, STAFFING_ROLE_SLUGS } from './generated/rbac.ts';

export type { StaffingPermission } from './generated/rbac.ts';
export { STAFFING_PERMISSIONS, STAFFING_ROLE_SLUGS };

// biome-ignore lint/style/noNonNullAssertion: 'staffing' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const staffingRbac = inventoryToManifests(INVENTORY).find((m) => m.module === 'staffing')!;

export type StaffingRoleSlug = (typeof STAFFING_ROLE_SLUGS)[number];

export const STAFFING_ROLE_PERMISSIONS = Object.fromEntries(
  staffingRbac.roles.map((r) => [r.slug, r.permissions]),
) as Record<StaffingRoleSlug, string[]>;
