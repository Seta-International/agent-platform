import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { PLANNER_PERMISSIONS, PLANNER_ROLE_SLUGS } from './generated/rbac.ts';

export type { PlannerPermission } from './generated/rbac.ts';
export { PLANNER_PERMISSIONS, PLANNER_ROLE_SLUGS };

// biome-ignore lint/style/noNonNullAssertion: 'planner' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const plannerRbac = inventoryToManifests(INVENTORY).find((m) => m.module === 'planner')!;

export type PlannerRoleSlug = (typeof PLANNER_ROLE_SLUGS)[number];
